from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import sqlite3
import requests
import json
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "ship_state.db"
OLLAMA_URL = "http://localhost:11434/api/chat"
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

@app.get("/status", response_model=StatusResponse)
def get_status():
    return {"systems": get_current_status_dict()}

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
        ollama_host = os.environ.get("OLLAMA_HOST", OLLAMA_URL)

        # Attempt connection with short timeout
        res = requests.post(ollama_host, json=ollama_req, timeout=2)
        res.raise_for_status()
        result_json = res.json()

        # Extract content from chat response
        content = result_json.get("message", {}).get("content", "{}")
        llm_output = json.loads(content)

    except Exception:
        # Fallback to mock logic if Ollama is down or errors
        print("Ollama not reachable or error, using mock logic.")
        llm_output = mock_llm_logic(req.text)

    updates = llm_output.get("updates", {})
    response_text = llm_output.get("response", "Unable to comply.")

    # 2. Update DB
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    for system, level in updates.items():
        cursor.execute('UPDATE systems SET level = ? WHERE name = ?', (level, system))
    conn.commit()
    conn.close()

    return {"response": response_text, "updates": updates}
