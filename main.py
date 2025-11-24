from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import sqlite3
import requests
import json
import os
import logging
import time
import threading
from profiling_utils import profile_time, profile_block

class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            # Filter out /status endpoint from access logs
            if len(record.args) >= 3:
                if record.args[2] == "/status":
                    return False
        except Exception:
            pass
        return True

# Apply filter to uvicorn access logger on startup
logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "ship_state.db"
OLLAMA_DEFAULT_HOST = "http://localhost:11434"
MODEL_NAME = "qwen2.5:1.5b"  # User can change this via env var if needed

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS systems (
            name TEXT PRIMARY KEY,
            level INTEGER
        )
    ''')
    # Initialize default values if empty
    cursor.execute('SELECT count(*) FROM systems')
    if cursor.fetchone()[0] == 0:
        defaults = [
            ('shields', 100),
            ('impulse', 25),
            ('warp', 0),
            ('phasers', 0),
            ('life_support', 100)
        ]
        cursor.executemany('INSERT INTO systems (name, level) VALUES (?, ?)', defaults)
        conn.commit()
    conn.close()

init_db()

class CommandRequest(BaseModel):
    text: str

class StatusResponse(BaseModel):
    systems: dict

def get_current_status_dict():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT name, level FROM systems')
    rows = cursor.fetchall()
    conn.close()
    return {name: level for name, level in rows}

@app.get("/")
async def read_index():
    return FileResponse('index.html')

def preload_model():
    """Wakes up Ollama on startup to avoid cold start latency."""
    base_url, generate_url = get_ollama_config()
    print(f"Attempting to pre-load model {MODEL_NAME} at {generate_url}...")
    try:
        requests.post(generate_url, json={
            "model": os.environ.get("OLLAMA_MODEL", MODEL_NAME),
            "prompt": "",
            "keep_alive": -1 # Keep loaded indefinitely (or until default timeout)
        }, timeout=1)
    except Exception as e:
        print(f"Pre-load warning: {e}")

@app.on_event("startup")
async def startup_event():
    threading.Thread(target=preload_model).start()

def get_ollama_config():
    host = os.environ.get("OLLAMA_HOST", OLLAMA_DEFAULT_HOST).rstrip("/")
    # Check if user accidentally included /api/chat in the host variable
    if host.endswith("/api/chat"):
         base = host[:-9]
    else:
         base = host

    chat_url = f"{base}/api/generate"
    return base, chat_url

# Global cache for LLM status
_llm_status_cache = {"status": 0, "timestamp": 0}
_llm_status_ttl = 60  # cache for 60 seconds

def check_llm_status():
    global _llm_status_cache
    now = time.time()

    # Return cached value if valid
    if now - _llm_status_cache["timestamp"] < _llm_status_ttl:
        return _llm_status_cache["status"]

    base_url, _ = get_ollama_config()
    try:
        # Simple check to see if server is responding
        requests.get(base_url, timeout=0.2)
        status = 100
    except Exception:
        status = 0

    # Update cache
    _llm_status_cache = {"status": status, "timestamp": now}
    return status

@app.get("/status", response_model=StatusResponse)
@profile_time("Status Endpoint")
def get_status():
    systems = get_current_status_dict()
    # Inject Neural Net status
    with profile_block("Ollama Connectivity Check"):
        systems["neural_net"] = check_llm_status()
    return {"systems": systems}

@profile_time("Mock Logic")
def mock_llm_logic(text):
    text = text.lower()
    updates = {}
    response = "Command not recognized."

    if "shield" in text:
        if "raise" in text or "up" in text or "maximum" in text:
            updates["shields"] = 100
            response = "Shields raised to maximum."
        elif "lower" in text or "down" in text:
            updates["shields"] = 0
            response = "Shields lowered."
        elif "hold" in text:
            response = "Shields holding."

    if "warp" in text:
        if "engage" in text or "go" in text:
            updates["warp"] = 90
            response = "Warp drive engaged."
        elif "stop" in text or "drop" in text:
            updates["warp"] = 0
            response = "Warp drive disengaged."

    if "phaser" in text:
        if "arm" in text or "lock" in text:
            updates["phasers"] = 100
            response = "Phasers armed and locked."
        elif "fire" in text:
             response = "Firing phasers."

    if "impulse" in text:
        if "full" in text:
            updates["impulse"] = 100
            response = "Impulse engines at full power."

    if not updates and "status" in text:
        response = "Systems nominal."

    if not updates and response == "Command not recognized.":
        # Handle wake word only
        if text.strip() == "computer":
            response = "Awaiting command."
        # Generic fallback if nothing matched but it wasn't status
        pass

    return {"updates": updates, "response": response}

@app.post("/command")
@profile_time("Command Processing")
def process_command(req: CommandRequest):
    current_status = get_current_status_dict()

    # OPTIMIZATION: Check for exact keywords first (0ms latency)
    text_lower = req.text.lower()
    fast_response = None

    if "status" in text_lower and len(text_lower) < 20:
        fast_response = {"updates": {}, "response": "Systems nominal. displaying current status."}
    elif "shields" in text_lower:
        if "up" in text_lower or "raise" in text_lower or "maximum" in text_lower:
             fast_response = {"updates": {"shields": 100}, "response": "Shields raised."}
        elif "down" in text_lower or "lower" in text_lower:
             fast_response = {"updates": {"shields": 0}, "response": "Shields lowered."}
    elif "red alert" in text_lower:
         fast_response = {"updates": {"shields": 100, "phasers": 100}, "response": "Red Alert! Shields and Phasers at maximum."}
    elif "warp" in text_lower:
        if "engage" in text_lower or "go" in text_lower:
            fast_response = {"updates": {"warp": 90}, "response": "Warp drive engaged."}
        elif "stop" in text_lower or "disengage" in text_lower:
             fast_response = {"updates": {"warp": 0}, "response": "Warp drive disengaged."}
    elif "phaser" in text_lower and ("arm" in text_lower or "lock" in text_lower):
        fast_response = {"updates": {"phasers": 100}, "response": "Phasers armed."}

    if fast_response:
        # Skip Ollama entirely for these commands
        updates = fast_response["updates"]
        response_text = fast_response["response"]
    else:
        # CHANGE 2: drastic prompt reduction for speed
        # We remove "fluff" and ask for strict JSON.
        prompt = f"""
System: Starship Enterprise Computer.
Status: {json.dumps(current_status)}
Command: "{req.text}"

Task: Update systems (shields, impulse, warp, phasers, life_support) 0-100.
Output: JSON object with "updates" (dict) and "response" (short spoken string).
""".strip()

        llm_output = {}
        try:
            ollama_req = {
                "model": os.environ.get("OLLAMA_MODEL", MODEL_NAME),
                "prompt": prompt,
                "stream": False, # CHANGE 3: Turn off streaming for simple JSON tasks to reduce overhead
                "format": "json",
                "options": {
                    "num_predict": 128, # CHANGE 4: Limit output tokens (prevents long rambles)
                    "temperature": 0.1  # Make it deterministic and faster
                }
            }

            _, ollama_generate_url = get_ollama_config()

            # Attempt connection with longer timeout
            full_response_text = ""
            eval_count = 0

            with profile_block("Ollama API Call"):
                with requests.post(ollama_generate_url, json=ollama_req, stream=False, timeout=30) as res:
                    res.raise_for_status()
                    response_json = res.json()
                    full_response_text = response_json.get("response", "")
                    eval_count = response_json.get("eval_count", 0)
                    eval_duration = response_json.get("eval_duration", 0)
                    print(f"Ollama Stats: eval_count={eval_count}, eval_duration={eval_duration}ns")

            llm_output = json.loads(full_response_text)

        except requests.exceptions.HTTPError as e:
            ollama_generate_url = get_ollama_config()[1]
            print(f"Ollama HTTP Error at {ollama_generate_url}: {e}")
            # Attempt to print the response text which might contain the error details (e.g. 'model not found')
            if e.response is not None:
                 print(f"Ollama Response Body: {e.response.text}")
            print("Using mock logic.")
            llm_output = mock_llm_logic(req.text)
        except Exception as e:
            # Fallback to mock logic if Ollama is down or errors
            print(f"Ollama not reachable at {ollama_generate_url}. Error: {e}")
            print("Using mock logic.")
            llm_output = mock_llm_logic(req.text)

        updates = llm_output.get("updates", {})
        response_text = llm_output.get("response", "Unable to comply.")

    # 2. Update DB
    with profile_block("DB Update"):
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        for system, level in updates.items():
            cursor.execute('UPDATE systems SET level = ? WHERE name = ?', (level, system))
        conn.commit()
        conn.close()

    return {"response": response_text, "updates": updates}
