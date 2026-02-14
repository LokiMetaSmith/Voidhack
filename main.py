import asyncio
import base64
import json
import logging
import os
import random
from typing import List

import httpx
import aiofiles
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from server.stt import transcribe_audio
from server.models import CommandRequest, UserRegister, LocationUpdate, RadiationCleared
from server.database import r, init_db, get_current_status_dict, update_leaderboard
from server.game_logic import process_command_logic
from server.logging_config import setup_logging

# --- Logging Configuration ---
setup_logging()

class NoStatusFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return '/ws' not in record.getMessage()
logging.getLogger("uvicorn.access").addFilter(NoStatusFilter())

class UvicornErrorFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "Invalid HTTP request received" not in record.getMessage()
logging.getLogger("uvicorn.error").addFilter(UvicornErrorFilter())

# --- Basic Setup & Configuration ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- Constants ---
VALID_LOCATIONS = ["Bridge", "Engineering", "Ten Forward", "Sickbay", "Cargo Bay", "Jefferies Tube"]

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

# --- Initialize Database ---
init_db()

# --- TTS Configuration ---
TTS_ENGINE = os.environ.get("TTS_ENGINE", "kokoro").lower()
logging.info(f"TTS Engine configured to: {TTS_ENGINE}")

# --- Endpoints ---

@app.post("/api/transcribe")
async def transcribe_endpoint(file: UploadFile = File(...)):
    # Save the temporary audio blob
    temp_filename = f"temp_{file.filename}"
    async with aiofiles.open(temp_filename, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)

    # Process with Whisper
    text = await transcribe_audio(temp_filename)

    # Clean up
    if os.path.exists(temp_filename):
        os.remove(temp_filename)

    return {"text": text}

@app.post("/api/speak")
async def speak_endpoint(request: CommandRequest):
    import hashlib
    import io

    # Generate cache key
    key_hash = hashlib.md5(request.text.encode()).hexdigest()
    cache_key = f"tts_cache:{TTS_ENGINE}:{key_hash}"

    # Check cache
    try:
        cached_audio = r.get(cache_key)
        if cached_audio:
            logging.info(f"TTS Cache Hit for '{request.text[:20]}...'")
            audio_bytes = base64.b64decode(cached_audio)
            media_type = "audio/mp3" if TTS_ENGINE == "kokoro" else "audio/wav"
            return StreamingResponse(io.BytesIO(audio_bytes), media_type=media_type)
    except Exception as e:
        logging.warning(f"Redis cache read failed: {e}")

    if TTS_ENGINE == "kokoro":
        # Kokoro OpenAI-compatible endpoint
        tts_url = "http://kokoro-service:8880/v1/audio/speech"

        payload = {
            "model": "kokoro",
            "input": request.text,
            "voice": "af_heart", # Standard high-quality female voice
            "response_format": "mp3",
            "speed": 1.1
        }
        media_type = "audio/mp3"

    else:
        # Default to Coqui XTTS
        tts_url = "http://tts-service:5002/api/tts"

        payload = {
            "text": request.text,
            "speaker_wav": "/app/tts_models/voices/computer_main.wav", # Path inside container
            "language_id": "en"
        }
        media_type = "audio/wav"

    try:
        # Create client without context manager to allow streaming in generator
        client = httpx.AsyncClient()
        req = client.build_request("POST", tts_url, json=payload, timeout=10.0)
        r_tts = await client.send(req, stream=True)
        r_tts.raise_for_status()

        async def stream_and_cache():
            audio_data = bytearray()
            try:
                async for chunk in r_tts.aiter_bytes():
                    audio_data.extend(chunk)
                    yield chunk

                # Cache the complete audio
                try:
                    encoded_audio = base64.b64encode(audio_data).decode('utf-8')
                    r.set(cache_key, encoded_audio, ex=3600) # Cache for 1 hour
                    logging.info(f"TTS Cache Miss. Cached '{request.text[:20]}...'")
                except Exception as e:
                    logging.error(f"Failed to cache TTS audio: {e}")

            finally:
                await r_tts.aclose()
                await client.aclose()

        return StreamingResponse(stream_and_cache(), media_type=media_type)

    except httpx.ConnectError:
        logging.error(f"Failed to connect to TTS Engine: {TTS_ENGINE} at {tts_url}")
        raise HTTPException(status_code=502, detail="TTS Service Unavailable")
    except Exception as e:
        logging.error(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
        os.environ["GAME_ADMIN_TOKEN"] = token
    logging.info(f"GAME ADMIN TOKEN: {token}")
    asyncio.create_task(radiation_leak_simulator())

async def broadcast_state_change():
    state = {"type": "state_update", "systems": get_current_status_dict()}
    await manager.broadcast(json.dumps(state))
