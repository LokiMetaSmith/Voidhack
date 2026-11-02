## Archived: 2026-11-02

* The `wasm_project` directory lacks a `Cargo.toml`, requiring manual compilation of `src/lib.rs` using `rustc --target wasm32-unknown-unknown --crate-type cdylib -O` to generate `audio_processor.wasm`.
* The missions are seeded into Redis as a four-part narrative arc (Malware Discovery -> Lockpicking -> Embedded Systems -> Voidhack Purge) set in a BSides Oklahoma holodeck simulation.
* The `silentAudio` stream uses a base64-encoded WAV file (MIME `audio/wav`) instead of MP3 to ensure browser compatibility and avoid `NotSupportedError` during Media Session initialization.
* The `server/game_logic.py` module enforces location-based command restrictions using a `RESTRICTED_COMMANDS` dictionary, returning a JSON response with `alert: 'location_denied'` and `required_location` fields if the user is in the wrong location.
* Base64 audio assets in `index.html` are generated using Python's `wave` module to ensure valid WAV headers and prevent browser decoding errors.
* The backend `process_command_logic` in `server/game_logic.py` uses regex to extract JSON from LLM responses and falls back to using the raw text (stripped of code blocks) if valid JSON cannot be parsed.
* The LCARS color palette in `index.html` includes `--lcars-tan` (#ffcc99) and `--lcars-gold` (#ffaa00) to support the authentic elbow design.
* The `server/game_logic.py` module dynamically constructs the LLM API URL based on the `VLLM_HOST`, specifically distinguishing between Google Gemini, generic OpenAI endpoints, and local Ollama instances.
* The `initMediaSession` function is invoked immediately within `initComms` to ensure it executes within the user gesture context, preventing autoplay blocks.
* The application embeds base64-encoded audio data for `geiger-sound`, `chirp-sound`, and `processing-sound` directly in `index.html` to guarantee element availability for logic handlers.
* The frontend `handleCommandResponse` function triggers a full-screen `#access-denied-overlay` and plays `processing-sound` when receiving a `location_denied` alert from the backend.
* The `docker-compose.yml` file defines a `tts-service` using the `ghcr.io/coqui-ai/tts-server:latest` image, configured with NVIDIA GPU support and a volume mount for voice samples.
* The `toggleView` function includes a safety check (`socket && socket.readyState`) to prevent `TypeError` when accessing the uninitialized WebSocket object.
* The `update_leaderboard` function in `server/database.py` enforces data integrity by creating a default 'Ensign' user profile if the target user record is missing or incomplete in Redis before applying XP updates.
* Structured logging is implemented via `server/logging_config.py` using a custom `JSONFormatter` to output logs in JSON format, which is configured via `setup_logging()` in `main.py`.
* The `server/game_logic.py` startup logic detects if the configured `VLLM_HOST` is unreachable and checks for a local Ollama instance on port 11434, automatically reconfiguring the host and API URL if found.
* The `MockPipeline` implementation includes `hgetall` to support leaderboard functionality when running with `USE_MOCK_REDIS`.
* The AI agent's system prompt in `server/game_logic.py` instructs it to act as the ship's Main Computer under Emergency Protocol Omega, suffering from 'Voidhack' virus glitches that introduce 21st-century hacker jargon into its responses.
* The `server/database.py` module implements a connection retry mechanism (5 attempts) for Redis, which can be bypassed by setting `USE_MOCK_REDIS=true` to immediately use the `MockRedis` fallback.
* The Media Session API configuration includes handlers for `nexttrack` and `previoustrack` mapped to `handleHeadsetTrigger` to broaden headset compatibility.
* The `/api/speak` endpoint routes requests to the configured TTS service, streams the response, and implements a Redis-based read-through cache for generated audio (1-hour expiry).
* The TTS caching implementation in `main.py` uses a custom `stream_and_cache` generator to stream audio chunks to the client while simultaneously buffering them for subsequent Redis storage (base64 encoded).
* The backend codebase is refactored into `server/models.py` (Pydantic models), `server/database.py` (Redis/DB helpers), `server/game_logic.py` (Core logic/LLM), `server/logging_config.py` (Logging setup), and `main.py` (FastAPI/Routes).
* Frontend changes are verified by creating a temporary Playwright script (e.g., `verification/verify_ui.py`) to confirm visual elements and state transitions (like "LISTENING...") before submission.
* The `handle_authorize_session` function in `server/game_logic.py` enforces Role-Based Access Control (RBAC), requiring a user `rank_level` of at least 3 (Commander) to authorize a session.
* The `tests/test_rbac.py` module contains unit tests that verify the Role-Based Access Control (RBAC) logic in `handle_authorize_session` using mocked Redis responses.
* Player rank progression is mapped as Ensign -> Lieutenant -> Commander -> Captain, with 'Ensign' as the default starting rank.
* The `#last-command` element is restricted to displaying transcriptions and status messages, and no longer accepts click events.
* The `index.html` CSS grid layout is defined as `grid-template-columns: 180px 1fr 100px` and `grid-template-rows: 80px 1fr 60px` to support the authentic LCARS 'Elbow' header and sidebar structure.
* The `keydown` event listener for the COMMs terminal input is bound in `window.onload` rather than `initComms` to prevent duplicate triggers on re-initialization.
* The system prompt enforces rank consistency by explicitly instructing the LLM to address the user solely by their assigned rank and refer to "Guidance" parameters for mission context.
* The UI layout includes a `.lcars-right-bar` element to balance the visual structure in the third grid column.
* The frontend `index.html` displays audio status `3` as "AUDIO: NOISY" with a purple visual indicator (`.audio-noisy`).
* Backend game logic includes persistent events (e.g., 'Radiation Leak') that can lock UI controls and interfere with standard regression tests in the development environment.
* The frontend `setupWebSocket` function prevents duplicate connections by nullifying event listeners and closing the existing socket before creating a new one.
* The frontend `speak` function attempts to call the `/api/speak` endpoint for server-side TTS and automatically falls back to the browser's `SpeechSynthesis` API (`speakLocal`) if the server request fails.
* The `docker-compose.yml` file defines a `kokoro-service` using the `ghcr.io/remsky/kokoro-fastapi-gpu:latest` image, exposed on port 8880 for OpenAI-compatible speech generation.
* When testing backend logic involving Redis, both `server.database.r` and `server.game_logic.r` must be patched separately to ensure consistent mocking across modules.
* The 'Galaxy Class' local stack architecture supports switching between `Kokoro-FastAPI` and `Coqui XTTS v2` for text-to-speech (via Docker), while using `faster-whisper` server-side for speech-to-text.
* Frontend Speech-to-Text logic is controlled by the `USE_SERVER_STT` constant; if true, it uses VAD-triggered `MediaRecorder` and the `/api/transcribe` endpoint; if false, it falls back to the browser's native `webkitSpeechRecognition`.
* The `faster-whisper` implementation in `server/stt.py` attempts to load the 'medium.en' model on CUDA, with a fallback to CPU (using int8 quantization) if CUDA is unavailable.
* The `#push-to-talk` button is a centralized, orange pill-shaped element located in the `.lcars-footer` (grid row 3), flanked by decorative LCARS bars, serving as the manual trigger for the communication channel.
* Rank promotion is triggered when the LLM includes `"mission_success": true` in its JSON response payload, allowing the AI to determine puzzle resolution contextually.
* The `TTS_ENGINE` environment variable in `docker-compose.yml` (defaulting to `kokoro`) determines which TTS backend is used by the application logic.
* To prevent test flakiness caused by global variable initialization in `main.py`, `tests/test_tts_cache.py` uses `unittest.mock.patch` to override `main.TTS_ENGINE` directly instead of relying solely on `os.environ`.
* The `isChannelOpen` state is toggled via `handleHeadsetTrigger`, which is invoked unconditionally by Media Session `play`, `pause`, `nexttrack`, and `previoustrack` events.
* The original browser-based text-to-speech implementation has been renamed to `speakLocal` to serve as a fallback for the new server-based implementation.
* The `initComms` function enforces single-instance execution for `VoiceActivityDetector` by calling `stopDetection()` on the previous instance.
* The `audio_processor.wasm` module implements audio analysis using RMS and Zero Crossing Rate (ZCR), returning status codes: 0 (Silence), 1 (Good), 2 (Clipping), and 3 (Noisy).
* The frontend uses a global `reconnectTimer` to manage and clear pending WebSocket reconnection attempts during manual initialization.
* Running tests requires setting `PYTHONPATH=.` (e.g., `PYTHONPATH=. pytest tests/test_rbac.py`) to ensure correct module resolution for imports from the root directory.
* The `MockRedis` class in `mock_redis.py` includes a `flushall()` method to support resetting state during unit tests.
