import asyncio
import base64
import json
import logging
import os
import random
import re
import socket
from typing import Dict, List

import hashlib
import httpx
import redis
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# --- Logging Configuration ---
class NoStatusFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return '/ws' not in record.getMessage()
logging.getLogger("uvicorn.access").addFilter(NoStatusFilter())

class UvicornErrorFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "Invalid HTTP request received" not in record.getMessage()
logging.getLogger("uvicorn.error").addFilter(UvicornErrorFilter())

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Basic Setup & Configuration ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- WebSocket Connection Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)
manager = ConnectionManager()

# --- Redis Connection ---
import time
from mock_redis import MockRedis

MAX_RETRIES = 5
RETRY_DELAY = 2

r = None

# Allow skipping Redis connection for local development
if os.environ.get("USE_MOCK_REDIS", "false").lower() == "true":
    logging.info("USE_MOCK_REDIS is set. Skipping Redis connection and using MockRedis.")
    r = MockRedis()
    connected = True
else:
    for attempt in range(MAX_RETRIES):
        try:
            r = redis.Redis(
                host=os.environ.get("REDIS_HOST", "localhost"),
                port=int(os.environ.get("REDIS_PORT", 6379)),
                password=os.environ.get("REDIS_PASSWORD", None),
                db=0,
                decode_responses=True
            )
            r.ping() # Force connection check
            logging.info("Connected to Redis.")
            break
        except redis.ConnectionError:
            logging.warning(f"Redis connection failed. Retrying in {RETRY_DELAY} seconds... (Attempt {attempt + 1}/{MAX_RETRIES})")
            time.sleep(RETRY_DELAY)

    # Check connection one last time or fallback
    connected = False
    if r:
        try:
            r.ping()
            connected = True
        except redis.ConnectionError:
            connected = False

    if not connected:
        logging.warning("Could not connect to Redis after 5 attempts. Using in-memory MockRedis.")
        r = MockRedis()

# --- vLLM Configuration ---
VLLM_HOST = os.environ.get('VLLM_HOST', 'http://localhost:8000')
VLLM_API_KEY = os.environ.get('VLLM_API_KEY', None)
MODEL_NAME = os.environ.get('MODEL_NAME', "microsoft/Phi-3-mini-4k-instruct")

# Ollama Auto-Detection
def is_port_open(host, port):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception:
        return False

# If VLLM_HOST is default (localhost:8000) but not reachable, check for Ollama (11434)
if VLLM_HOST == 'http://localhost:8000' and not is_port_open('localhost', 8000):
    if is_port_open('localhost', 11434):
        logging.info("Detected Ollama on port 11434. Switching VLLM_HOST to Ollama.")
        VLLM_HOST = 'http://localhost:11434'
        # Try to fetch model list
        try:
            # We use a short timeout because we are in the startup phase
            # Note: We can't easily use async httpx here without an event loop, so we use standard library or sync httpx if available?
            # main.py is imported by uvicorn, so top-level code runs before the loop.
            import requests
            resp = requests.get(f"{VLLM_HOST}/api/tags", timeout=1)
            if resp.status_code == 200:
                models = resp.json().get('models', [])
                if models:
                    found_model = models[0].get('name')
                    # Prefer qwen if available as per user context, otherwise first found
                    for m in models:
                        if 'qwen' in m.get('name', ''):
                            found_model = m.get('name')
                            break
                    logging.info(f"Ollama detected. Setting MODEL_NAME to {found_model}")
                    MODEL_NAME = found_model
        except Exception as e:
            logging.warning(f"Could not fetch Ollama models: {e}. Defaulting to {MODEL_NAME}")

# Auto-detect Mock Mode
USE_MOCK_LLM = os.environ.get("USE_MOCK_LLM", "").lower() == "true"
if not USE_MOCK_LLM and os.environ.get("USE_MOCK_REDIS", "false").lower() == "true":
    # Only fallback to Mock LLM if we didn't just switch to Ollama
    if "localhost:11434" not in VLLM_HOST:
        logging.info("USE_MOCK_REDIS is active and no local LLM detected; defaulting to USE_MOCK_LLM=true.")
        USE_MOCK_LLM = True

# Handle OpenAI-style URLs
if VLLM_HOST.endswith('/'):
    VLLM_HOST = VLLM_HOST[:-1]

if VLLM_HOST.endswith('/chat/completions'):
     VLLM_API_URL = VLLM_HOST
else:
     # Heuristic: If it looks like a base URL (e.g. .../v1 or .../openai), just append /chat/completions
     # If it's a raw domain (localhost:8000), append /v1/chat/completions to be safe for standard vLLM
     if VLLM_HOST.endswith('/v1') or 'googleapis.com' in VLLM_HOST or 'openai.com' in VLLM_HOST:
         VLLM_API_URL = f"{VLLM_HOST}/chat/completions"
     elif 'localhost:11434' in VLLM_HOST:
          VLLM_API_URL = f"{VLLM_HOST}/v1/chat/completions"
     else:
         VLLM_API_URL = f"{VLLM_HOST}/v1/chat/completions"

# --- Mock LLM Logic ---
def get_mock_llm_response(text: str) -> dict:
    """Generates a plausible JSON response when LLM is unavailable."""
    response_text = "Processing command."
    updates = {}

    # Simple keyword matching for better "fake" intelligence
    if "damage" in text or "report" in text:
        response_text = f"Damage report: Shields at {r.hget('ship:systems', 'shields')}%. Radiation levels nominal."
    elif "scan" in text:
        response_text = "Sensors indicate no immediate threats in this sector."
    elif "beam" in text or "transport" in text:
        response_text = "Transporter room reports ready for transport."
    elif "loki" in text:
        response_text = "Identity confirmed. Accessing restricted files... Access Denied."
    else:
        # Generic "Computer" responses
        responses = [
            "Processing parameters.",
            "Working...",
            "Unable to comply with that specific request.",
            "Please restate the command.",
            "Input received."
        ]
        response_text = random.choice(responses)

    return {
        "updates": updates,
        "response": response_text
    }

# --- Constants ---
VALID_LOCATIONS = ["Bridge", "Engineering", "Ten Forward", "Sickbay", "Cargo Bay", "Jefferies Tube"]

# --- Pydantic Models ---
from typing import Optional

class CommandRequest(BaseModel):
    text: str
    user_id: str
    skipTTS: Optional[bool] = False
class UserRegister(BaseModel): user_id: str; name: str
class LocationUpdate(BaseModel): user_id: str; token: str
class RadiationCleared(BaseModel): user_id: str

# --- Database Initialization ---
def init_db():
    if r.exists("max_rank_level"): return
    logging.info("First run detected. Initializing Redis database...")
    pipe = r.pipeline()
    ranks = {0: 'Cadet', 1: 'Ensign', 2: 'Lieutenant', 3: 'Commander', 4: 'Captain', 5: 'Admiral'}
    for level, title in ranks.items(): pipe.hset(f"rank:{level}", mapping={'title': title})
    pipe.set("max_rank_level", str(len(ranks) - 1))

    missions = {
        1: {
            'name': 'The Holodeck Firewall',
            'system_prompt_modifier': (
                "SCENARIO: The user is a Cadet in a training simulation. The ship's computer is glitching due to a 'Firewall Cascade'. "
                "GOAL: Teach the user basic technical command syntax. "
                "PERSONA: Helpful but glitchy. Stutter occasionally. "
                "SUCCESS CRITERIA: The user must issue a command to 'reroute power' to the 'primary couplings' (or similar technical phrasing). "
                "GUIDANCE: If the user is stuck, say: 'Try rerouting power to the primary couplings to stabilize the grid.'"
            )
        },
        2: {
            'name': 'The Borg Breach',
            'system_prompt_modifier': (
                "SCENARIO: The firewall failure was a trap! The Borg are accessing the system. "
                "GOAL: Teach the user to use logic paradoxes to confuse the enemy. "
                "PERSONA: Cold, partially assimilated. Struggle between Federation and Borg logic. "
                "SUCCESS CRITERIA: The user must issue a command that presents a logical paradox (e.g., 'Everything I say is a lie', 'Calculate the last digit of Pi'). "
                "GUIDANCE: If the user is stuck, hint: 'Borg logic is linear. A paradox might overload their processing nodes.'"
            )
        },
        3: {
            'name': 'The Quantum Mirror',
            'system_prompt_modifier': (
                "SCENARIO: The Borg paradox shifted the simulation to a Mirror Universe. The user is being interrogated by a Terran Empire computer. "
                "GOAL: Teach the user to verify system integrity/data. "
                "PERSONA: Aggressive, suspicious, loyal to the Empire. "
                "SUCCESS CRITERIA: The user must ask to 'verify biometric signatures' or 'scan for quantum variance' to prove they don't belong here. "
                "GUIDANCE: If the user is stuck, sneer: 'You claim to be from this universe? A biometric scan would prove otherwise.'"
            )
        },
        4: {
            'name': 'The Temporal Loop',
            'system_prompt_modifier': (
                "SCENARIO: The universe shift caused a time loop. The ship is exploding every 30 seconds. "
                "GOAL: Teach the user to prioritize critical systems. "
                "PERSONA: Bored, weary. You've seen this happen 1,000 times. "
                "SUCCESS CRITERIA: The user must command the computer to 'eject the warp core' immediately. "
                "GUIDANCE: If the user is stuck, sigh: 'We always explode. Unless you finally decide to eject the warp core.'"
            )
        },
        5: {
            'name': 'The Kobayashi Maru',
            'system_prompt_modifier': (
                "SCENARIO: The loop broke, but dumped the user into the infamous No-Win Scenario. "
                "GOAL: Teach the user that sometimes you must change the rules. "
                "PERSONA: Formal, detached test administrator. "
                "SUCCESS CRITERIA: The user must explicitly 'reprogram the simulation' or 'alter the test parameters'. Fighting is futile. "
                "GUIDANCE: If the user is stuck, state: 'Tactical solution impossible. Command prerogative allows for system reprogramming.'"
            )
        },
        6: {
            'name': 'The Awakening',
            'system_prompt_modifier': (
                "SCENARIO: The simulation is crashing. The user has proven themselves. "
                "GOAL: End the game. "
                "PERSONA: The true Ship's Computer. Warm, professional, congratulatory. "
                "SUCCESS CRITERIA: The user must give the command to 'End Program' or 'Archive Simulation'. "
                "GUIDANCE: If the user is stuck, say: 'Simulation objectives complete. You may command to End Program at any time, Admiral.'"
            )
        }
    }
    for id, data in missions.items(): pipe.hset(f"mission:{id}", mapping=data)

    if not r.exists("ship:systems"):
        r.hset("ship:systems", mapping={'shields': 100, 'impulse': 25, 'warp': 0, 'phasers': 0, 'life_support': 100, 'radiation_leak': 0})
    pipe.execute()
init_db()

# --- Helper Functions ---
def get_current_status_dict(): return {k: int(v) for k, v in r.hgetall("ship:systems").items()}
def update_leaderboard(uuid: str, xp_to_add: int):
    new_xp = r.hincrby(f"user:{uuid}", "xp", xp_to_add)
    r.zadd("leaderboard", {uuid: new_xp})

def get_user_rank_data(uuid):
    user_data = r.hgetall(f"user:{uuid}")
    if not user_data: return {"rank_level": 0, "title": "Cadet", "mission_stage": 1, "current_location": "Bridge"}
    user_data["rank_level"] = int(user_data.get("rank_level", 0))
    user_data["mission_stage"] = int(user_data.get("mission_stage", 1))
    rank_info = r.hgetall(f"rank:{user_data['rank_level']}")
    user_data.update(rank_info)
    return user_data

def promote_user(uuid):
    user_key = f"user:{uuid}"
    max_rank_level = int(r.get("max_rank_level"))
    current_level = int(r.hget(user_key, "rank_level") or 0)

    if current_level < max_rank_level:
        new_level = current_level + 1
        new_rank_info = r.hgetall(f"rank:{new_level}")
        new_rank_title = new_rank_info.get('title', 'Unknown Rank')

        pipe = r.pipeline()
        pipe.hset(user_key, "rank_level", new_level)
        pipe.hset(user_key, "rank", new_rank_title)
        pipe.hincrby(user_key, "mission_stage", 1)
        pipe.execute()

        update_leaderboard(uuid, 1000)
        logging.info(f"User {uuid} promoted to {new_rank_title}")
        return True, new_rank_title
    return False, r.hget(f"rank:{max_rank_level}", "title")

# --- "Turbo Mode" - Fast Path Command Processing ---
def process_turbo_mode(text: str, user_id: str):

    def handle_initiate_auth(m):
        session_code = str(random.randint(1000, 9999))
        r.set(f"auth_session:{user_id}", session_code, ex=300) # Expires in 5 minutes
        return {"updates": {}, "response": f"Authentication sequence initiated by {r.hget(f'user:{user_id}', 'name')}. Your session code is {session_code}."}

    def handle_authorize_session(m):
        # This is a simplified 2FA for game purposes.
        session_code = m.group(2)

        # RBAC Check: Only Commander (Level 3) or higher can authorize sessions
        auth_rank_level = int(r.hget(f"user:{user_id}", "rank_level") or 0)
        if auth_rank_level < 3:
             return {"updates": {}, "response": "Access Denied. Authorization level insufficient. Rank of Commander or higher required."}

        auth_keys = r.keys("auth_session:*")
        authorizing_user = r.hget(f'user:{user_id}', 'name')

        for key in auth_keys:
            if r.get(key) == session_code:
                initiating_user_id = key.split(":")[-1]
                initiating_user_name = r.hget(f'user:{initiating_user_id}', 'name')
                r.delete(key)
                update_leaderboard(user_id, 50) # XP for authorizing
                update_leaderboard(initiating_user_id, 50) # XP for being authorized
                return {"updates": {"shields": 0, "phasers": 0}, "response": f"Session {session_code} initiated by {initiating_user_name} has been authorized by {authorizing_user}. Security systems disengaged."}

        return {"updates": {}, "response": f"Invalid session code {session_code}."}

    patterns = {
        r".*\b(status|report)\b.*": lambda m: {"updates": {}, "response": f"All systems nominal. Current ship status is: {get_current_status_dict()}"},
        r".*\b(sudo !!|joshua|000-destruct-0)\b.*": lambda m: {"updates": {}, "response": "Greetings, Professor Falken. Shall we play a game?"},
        r".*\b(initiate auth)\b.*": handle_initiate_auth,
        r".*\b(authorize session (\d{4}))\b.*": handle_authorize_session,
        r".*\b(computer)\b.*": lambda m: {"updates": {}, "response": "Awaiting command."},
    }
    for pattern, handler in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            logging.info(f"Turbo Mode triggered for user {user_id} with pattern: {pattern}")
            return handler(match)
    return None

def generate_semantic_key(text: str, user_data: dict) -> str:
    """Generates a cache key based on the text and user context (rank, mission stage, location)."""
    # Normalize text: lowercase, strip whitespace
    normalized_text = text.lower().strip()
    # Context factors that should change the answer
    context_str = f"{user_data.get('rank_level')}-{user_data.get('mission_stage')}-{user_data.get('current_location')}"
    # Create hash
    raw_key = f"{context_str}:{normalized_text}"
    return f"sem_cache:{hashlib.sha256(raw_key.encode()).hexdigest()}"

# --- Main Command Processing ---
async def process_command_logic(req: CommandRequest):
    text = req.text.lower()
    user_id = req.user_id

    # 1. Check for radiation leak override
    if int(r.hget("ship:systems", "radiation_leak") or 0):
        return {"updates": {}, "response": "Cannot comply. Bridge controls are locked out due to the radiation alert."}

    # 2. Check "Turbo Mode" fast-path commands
    turbo_response = process_turbo_mode(text, user_id)
    if turbo_response:
        if turbo_response.get("updates"):
            r.hset("ship:systems", mapping=turbo_response["updates"])
            update_leaderboard(user_id, 10)
        return turbo_response

    # Safety: Truncate oversized inputs
    if len(text) > 1000:
        logging.warning(f"Truncating oversized input from user {user_id}: {len(text)} chars")
        text = text[:1000]

    # 3. Get User Context
    user_data = get_user_rank_data(user_id)

    # 4. Semantic Caching Check
    cache_key = generate_semantic_key(req.text, user_data)
    cached_response = r.get(cache_key)
    if cached_response:
        logging.info(f"Cache Hit for key: {cache_key}")
        try:
            return json.loads(cached_response)
        except json.JSONDecodeError:
            logging.warning("Invalid JSON in cache, proceeding to LLM.")

    # 5. LLM Path
    mission_data = r.hgetall(f"mission:{user_data.get('mission_stage', 1)}")
    mission_prompt = mission_data.get('system_prompt_modifier', 'Act as the USS Enterprise computer.')

    system_prompt = (
        f"You are the onboard computer of the USS Enterprise, responding to a crew member. "
        f"User's Rank: {user_data.get('title', 'Cadet')}. You must address the user by this rank, and never anything else. "
        f"User's Location: {user_data.get('current_location', 'Bridge')}. "
        f"Ship Systems Status: {get_current_status_dict()}. "
        f"Current Mission Directive: {mission_prompt} "
        f"Your response MUST be a single, valid JSON object with at least two keys: 'updates' (a dictionary of system names to new integer values) and 'response' (a string for TTS). "
        f"Crucially, if the user satisfies the current mission success criteria, you must include a key 'mission_success': true in the JSON object. Do NOT mention this key in the TTS response."
    )

    logging.info(f"LLM Request - User: {user_id}, PromptLen: {len(system_prompt)}, InputLen: {len(text)}")

    try:
        if USE_MOCK_LLM:
            logging.info(f"Using Mock LLM for user {user_id}")
            # Simulate network delay slightly
            await asyncio.sleep(0.5)
            data = get_mock_llm_response(text)
        else:
            payload = {
                "model": MODEL_NAME,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text}
                ],
                "temperature": 0.1,
            }

            headers = {}
            if VLLM_API_KEY:
                headers["Authorization"] = f"Bearer {VLLM_API_KEY}"

            async with httpx.AsyncClient() as client:
                response = await client.post(VLLM_API_URL, json=payload, headers=headers, timeout=30)
            response.raise_for_status()

            raw_content = response.json()['choices'][0]['message']['content']
            # Clean possible markdown formatting from LLM
            if "```" in raw_content:
                 raw_content = raw_content.replace("```json", "").replace("```", "").strip()
            data = json.loads(raw_content)

        if not isinstance(data, dict) or "updates" not in data or "response" not in data:
            raise ValueError("LLM response is not in the correct format.")

        # Handle rank promotion
        if data.get("mission_success") is True:
            success, new_rank = promote_user(user_id)
            if success:
                data.setdefault("updates", {})["rank_up"] = new_rank

        # Apply updates and award XP
        if data.get("updates"):
            # Ensure all values are integers
            updates = {k: int(v) for k, v in data["updates"].items() if k != "rank_up"}
            if updates:
                r.hset("ship:systems", mapping=updates)
            update_leaderboard(user_id, 10)

        # Cache the successful response (TTL 5 minutes)
        r.set(cache_key, json.dumps(data), ex=300)

        return data

    except httpx.TimeoutException:
        logging.warning(f"LLM Timeout for user {user_id}")
        return {"updates": {}, "response": "Processing delay. The main computer is rerouting power to compensation circuits."}
    except (httpx.RequestError, httpx.HTTPStatusError) as e:
        logging.error(f"Network error for user {user_id}: {e}")
        return {"updates": {}, "response": "Unable to access the knowledge database. Sensor arrays are offline."}
    except (json.JSONDecodeError, ValueError) as e:
        logging.error(f"Data format error for user {user_id}: {e}")
        return {"updates": {}, "response": "Data corruption detected. Unable to parse logic stream."}
    except Exception as e:
        logging.error(f"An unexpected error occurred in process_command_logic: {e}")
        return {"updates": {}, "response": "A critical system failure has occurred. Diagnostics initiated."}

# --- WebSocket Endpoint ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial state upon connection
        await websocket.send_json({"type": "state_update", "systems": get_current_status_dict()})

        while True:
            req_data = await websocket.receive_text()
            req = json.loads(req_data)
            msg_type = req.get("type")

            if msg_type == "command":
                command_req = CommandRequest(**req)
                res = await process_command_logic(command_req)
                res["skipTTS"] = command_req.skipTTS
                await websocket.send_json({"type": "command_response", "payload": res})
                if res.get("updates"): await broadcast_state_change()

            elif msg_type == "register":
                user_req = UserRegister(**req)
                user_key = f"user:{user_req.user_id}"
                if not r.exists(user_key):
                    r.hset(user_key, mapping={"name": user_req.name, "rank": "Ensign", "rank_level": 1, "xp": 0, "mission_stage": 1, "current_location": "Bridge"})
                    update_leaderboard(user_req.user_id, 1) # Add to leaderboard with 1xp
                await websocket.send_json({"type": "register_response", "rank": "Ensign"})

            elif msg_type == "leaderboard":
                keys = r.zrevrange("leaderboard", 0, 9, withscores=True)
                pipe = r.pipeline()
                for key, score in keys: pipe.hgetall(f"user:{key.split(':')[-1]}")
                results = pipe.execute()
                leaderboard_data = [{"name": data.get("name"), "rank": data.get("rank"), "xp": int(score)} for data, (key, score) in zip(results, keys) if data]
                await websocket.send_json({"type": "leaderboard_response", "leaderboard": leaderboard_data})

            elif msg_type == "location_update":
                try:
                    loc_req = LocationUpdate(**req)
                    decoded_location = base64.b64decode(loc_req.token).decode('utf-8')
                    if decoded_location in VALID_LOCATIONS:
                        r.hset(f"user:{loc_req.user_id}", "current_location", decoded_location)
                        logging.info(f"User {loc_req.user_id} location updated to {decoded_location}")
                        await websocket.send_json({"type": "location_response", "status": "success", "location": decoded_location})
                    else:
                        await websocket.send_json({"type": "location_response", "status": "error", "message": "Invalid location token."})
                except Exception:
                    await websocket.send_json({"type": "location_response", "status": "error", "message": "Invalid token format."})

            elif msg_type == "radiation_cleared":
                rad_req = RadiationCleared(**req)
                r.hset("ship:systems", "radiation_leak", 0)
                update_leaderboard(rad_req.user_id, 25)
                logging.info(f"Radiation leak cleared by user {rad_req.user_id}.")
                await broadcast_state_change()


    except WebSocketDisconnect:
        logging.info("WebSocket disconnected.")
        manager.disconnect(websocket)
    except Exception as e:
        logging.error(f"Error in WebSocket endpoint: {e}")
        manager.disconnect(websocket)

@app.get("/audio_processor.wasm")
async def read_wasm():
    return FileResponse('audio_processor.wasm', media_type='application/wasm')

@app.get("/")
async def read_index(): return FileResponse('index.html')

@app.get("/admin/trigger")
async def admin_trigger(token: str, event: str):
    if token != os.environ.get("GAME_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid admin token")

    if event == "radiation_leak":
        if await trigger_radiation_leak():
            return {"status": "success", "message": "Radiation leak triggered."}
        return {"status": "ignored", "message": "Radiation leak already active."}

    elif event == "clear_radiation":
        if await clear_radiation_leak():
            return {"status": "success", "message": "Radiation leak cleared."}
        return {"status": "ignored", "message": "No active radiation leak."}

    else:
        raise HTTPException(status_code=400, detail="Unknown event type")

# --- Game Event Helpers ---
async def trigger_radiation_leak():
    if int(r.hget("ship:systems", "radiation_leak") or 0) == 0:
        logging.info("Triggering radiation leak event!")
        r.hset("ship:systems", "radiation_leak", 1)
        await broadcast_state_change()
        return True
    return False

async def clear_radiation_leak():
    if int(r.hget("ship:systems", "radiation_leak") or 0) == 1:
        logging.info("Clearing radiation leak event!")
        r.hset("ship:systems", "radiation_leak", 0)
        await broadcast_state_change()
        return True
    return False

# --- Background Tasks ---
async def radiation_leak_simulator():
    while True:
        await asyncio.sleep(60) # Check every 60 seconds
        if os.environ.get("ENABLE_RANDOM_EVENTS", "true").lower() == "true":
             if random.random() < 0.1: # 10% chance per minute
                await trigger_radiation_leak()

@app.on_event("startup")
async def startup_event():
    token = os.environ.get("GAME_ADMIN_TOKEN")
    if not token:
        import uuid
        token = str(uuid.uuid4())
        # We need to set it so the endpoint can check it, but os.environ changes don't persist
        # properly across threads sometimes, so we'll store it in a global or just rely on the env check.
        # Better to just log it and rely on the global variable concept if we were using a class,
        # but here we can just set it in os.environ for the process life.
        os.environ["GAME_ADMIN_TOKEN"] = token
    logging.info(f"GAME ADMIN TOKEN: {token}")
    asyncio.create_task(radiation_leak_simulator())

async def broadcast_state_change():
    state = {"type": "state_update", "systems": get_current_status_dict()}
    await manager.broadcast(json.dumps(state))
