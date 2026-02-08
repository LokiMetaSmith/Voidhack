import os
import socket
import logging
import random
import re
import json
import asyncio
import hashlib
import httpx
from server.database import r, get_current_status_dict, update_leaderboard, get_user_rank_data, promote_user
from server.models import CommandRequest

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

# --- Restricted Commands ---
RESTRICTED_COMMANDS = {
    "eject warp core": "Engineering",
    "purge coolant": "Engineering",
    "medical override": "Sickbay",
    "quarantine": "Sickbay",
    "cargo release": "Cargo Bay",
    "jettison cargo": "Cargo Bay",
    "jefferies tube access": "Jefferies Tube"
}

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

async def process_command_logic(req: CommandRequest):
    text = req.text.lower()
    user_id = req.user_id

    # 1. Check for radiation leak override
    if int(r.hget("ship:systems", "radiation_leak") or 0):
        return {"updates": {}, "response": "Cannot comply. Bridge controls are locked out due to the radiation alert."}

    # 1.5. Check Location Restrictions
    # We need user data early for this check
    user_data = get_user_rank_data(user_id)
    current_location = user_data.get('current_location', 'Bridge')

    for command, required_loc in RESTRICTED_COMMANDS.items():
        if command in text and current_location != required_loc:
             return {"updates": {}, "response": f"Access Denied. Command '{command}' requires physical presence in {required_loc}. Current location: {current_location}."}

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

    # 3. Get User Context (Already fetched above)
    # user_data = get_user_rank_data(user_id)

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

            # Attempt to find JSON object using regex
            match = re.search(r'\{.*\}', raw_content, re.DOTALL)
            data = None
            if match:
                try:
                    data = json.loads(match.group(0))
                except json.JSONDecodeError:
                    logging.warning(f"Failed to parse extracted JSON from user {user_id}. Content: {match.group(0)}")

            # Fallback if no valid JSON found
            if data is None:
                logging.warning(f"LLM returned invalid JSON for user {user_id}. Raw: {raw_content}")
                # Treat the whole content as the response message
                clean_text = raw_content.replace("```json", "").replace("```", "").strip()
                data = {"updates": {}, "response": clean_text}

            # Ensure data is a dictionary (handle case where json.loads returns list/scalar)
            if not isinstance(data, dict):
                data = {"updates": {}, "response": str(data)}

            # Ensure required keys exist
            if "response" not in data:
                data["response"] = "Processing complete."
            if "updates" not in data:
                data["updates"] = {}

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
