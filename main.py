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
MODEL_NAME = "llama3"  # User can change this via env var if needed

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

def get_ollama_config():
    host = os.environ.get("OLLAMA_HOST", OLLAMA_DEFAULT_HOST).rstrip("/")
    # Check if user accidentally included /api/chat in the host variable
    if host.endswith("/api/chat"):
         base = host[:-9]
         chat = host
    else:
         base = host
         chat = f"{host}/api/chat"
    return base, chat

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

    # 1. Call Ollama to interpret intent
    prompt = f"""
You are the intelligent computer of the Starship Enterprise.
Current Ship Status: {json.dumps(current_status)}
User Command: "{req.text}"

Your goal is to interpret the command and update ship systems.
Valid systems: shields, impulse, warp, phasers, life_support.
Values must be integers between 0 and 100.

Return ONLY a JSON object with two keys:
1. "updates": a dictionary of system names and their new levels.
2. "response": a short, robotic spoken response confirming the action.

Example:
{{
  "updates": {{"shields": 50, "phasers": 100}},
  "response": "Shields at 50 percent. Phasers armed."
}}
"""

    llm_output = {}
    try:
        # Try to connect to Ollama
        ollama_req = {
            "model": os.environ.get("OLLAMA_MODEL", MODEL_NAME),
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "format": "json"
        }
        _, ollama_chat_url = get_ollama_config()

        # Attempt connection with short timeout
        with profile_block("Ollama API Call"):
            res = requests.post(ollama_chat_url, json=ollama_req, timeout=2)
            res.raise_for_status()
            result_json = res.json()

        # Extract content from chat response
        content = result_json.get("message", {}).get("content", "{}")
        llm_output = json.loads(content)

    except requests.exceptions.HTTPError as e:
        print(f"Ollama HTTP Error at {ollama_chat_url}: {e}")
        # Attempt to print the response text which might contain the error details (e.g. 'model not found')
        if e.response is not None:
             print(f"Ollama Response Body: {e.response.text}")
        print("Using mock logic.")
        llm_output = mock_llm_logic(req.text)
    except Exception as e:
        # Fallback to mock logic if Ollama is down or errors
        print(f"Ollama not reachable at {ollama_chat_url}. Error: {e}")
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
