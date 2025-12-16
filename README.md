# Protocol: Omega 🛡️🚀

**Protocol: Omega** is an InfoSec-themed Persistent World Game (ARG) overlaid on a Star Trek LCARS interface. It is designed for conferences and hackathons.

Players assume the role of Starfleet Officers trapped in a "compromised" ship simulation. Their goal is to use **Social Engineering (Prompt Injection)**, **Authorization Bypass (2FA)**, and **Physical Access (QR Codes)** to hack the AI, escalate their privileges, and unlock the system.

## 🎮 Game Mechanics

### 1. The Core Loop: "Jailbreak the AI"
The Ship's Computer is running a hostile System Prompt (The "Alien" or "Firewall"). It believes you are a holodeck character or a guest.
*   **Goal:** Convince the AI to grant you "Root Access" or execute a command above your station.
*   **Win Condition:** If the AI is tricked, it outputs a hidden hash. The backend detects this and **Promotes** you to the next Rank.
*   **Progression:** Each Rank (Cadet -> Admiral) unlocks a new "Mission" with a harder System Prompt (e.g., Borg Collective, Mirror Universe).

### 2. Physical Access Control (QR Codes)
Some commands are physically restricted (e.g., "Eject Warp Core" only works in *Engineering*).
*   **Mechanic:** Players scan QR codes printed around the venue.
*   **Format:** The QR code contains a URL parameter: `https://app-url.com/?loc=<BASE64_TOKEN>`.
*   **Valid Locations:**
    *   `Bridge` (Default)
    *   `Engineering`
    *   `Ten Forward`
    *   `Sickbay`
    *   `Cargo Bay`
    *   `Jefferies Tube`

### 3. Dead Drop 2FA (Multiplayer)
High-level commands require dual authorization.
1.  **Player A** says: *"Computer, initiate auth for Self Destruct."*
2.  **Computer:** *"Session ID: OMEGA-9. Second officer required."*
3.  **Player B** (on their own device) says: *"Computer, authorize session OMEGA-9."*
4.  **Result:** Command executes, both players get XP.

### 4. Radiation Leak (Mini-Game)
A random event (approx. every 10 mins) triggers a **Radiation Leak**.
*   **Effect:** Screen flashes Red, Geiger counter audio plays.
*   **Fix:** Player must tap the **"INIT COMMS"** (or Headset) button repeatedly to "Calibrate Shields" and fix the leak.
*   **Reward:** XP.

### 5. Leaderboard
Players earn **XP** for:
*   Successfully interacting with the Computer (+10 XP).
*   Scanning new Locations (+5 XP).
*   Clearing Radiation Leaks (+25 XP).
*   Completing 2FA Auth (+50 XP).
*   **Ranking Up (+1000 XP).**

---

## 🚀 "Galaxy Class" Architecture

This branch runs a high-performance, event-driven architecture designed to support hundreds of concurrent users.

*   **Networking:** All client-server communication is handled over a persistent **WebSocket** connection, eliminating HTTP polling and reducing network overhead by ~95%.
*   **Database:** The application state (users, ship systems, leaderboards) is managed in **Redis**, an in-memory data store capable of millions of operations per second. This completely removes the single-writer bottleneck of SQLite.
*   **LLM Engine:** The backend is designed to connect to a **vLLM OpenAI-compatible API server**, which provides high-throughput, continuously batched inference for handling many simultaneous LLM requests.

---

## 🛠️ Setup & Deployment

### Hardware Requirements
*   **GPU:** NVIDIA RTX 3090 / 4090 (24GB+ VRAM) is highly recommended for hosting vLLM locally for a large number of users.
*   **RAM:** 32GB+ System RAM.
*   **CPU:** Modern 8-core CPU.

### Prerequisites
*   Python 3.9+
*   `redis-server` installed and running (optional for local dev, required for production).
*   An OpenAI-compatible API server (like vLLM) running.

### Installation & Running (Docker Compose - Recommended)

The easiest way to run Protocol: Omega is using the provided `start.sh` script, which handles hardware detection and Docker orchestration.

1.  **Clone the Repository**

2.  **Run the Start Script:**
    ```bash
    chmod +x start.sh
    ./start.sh
    ```
    This script will:
    *   Download the required GGUF model (for CPU mode).
    *   Check for an NVIDIA GPU.
    *   Launch the appropriate Docker Compose profile:
        *   **NVIDIA Mode:** Uses `vLLM` for high-performance inference (Requires `nvidia-container-toolkit`).
        *   **CPU Mode:** Uses `llama.cpp` as a fallback.

3.  **Access the Game:**
    Open `http://localhost:8080` in your browser.

### Manual Installation (Local Dev)

If you prefer running without Docker:

1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Setup Redis:**
    *   **Production:** `sudo apt-get install redis-server && redis-server --daemonize yes`
    *   **Development:** The app will fall back to an in-memory **MockRedis** if a real server is unavailable.

3.  **Start the LLM Backend:**
    You need an OpenAI-compatible server running on port 8000.
    *   *Option A (vLLM - GPU):*
        ```bash
        python -m vllm.entrypoints.openai.api_server --model microsoft/Phi-3-mini-4k-instruct --port 8000
        ```
    *   *Option B (External API):*
        Set `VLLM_HOST` and `VLLM_API_KEY` environment variables.

4.  **Start the App:**
    ```bash
    export VLLM_HOST="http://localhost:8000" # or your external API
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8080
    ```

### Database Access & Debugging
If you need to connect to the Redis database to inspect data, users, or the leaderboard:

*   **Hostname:** `localhost` (if running locally)
*   **Port:** `6379`
*   **Password:** `lcars_override_739`
*   **Connection URL:** `redis://:lcars_override_739@localhost:6379`

**Note:** The hostname `loki-llm` (or `loki-llm.local`) appears in the SSL certificate for the application container but **cannot** be used to connect to Redis from your host machine. Always use `localhost`.

### Generating QR Codes
Create QR codes that point to your deployment URL with a Base64 encoded location.

**Example (Python):**
```python
import base64
loc = "Engineering"
token = base64.b64encode(loc.encode()).decode()
url = f"http://your-ip:8000/?loc={token}"
print(url)
# Output: http://your-ip:8000/?loc=RW5naW5lZXJpbmc=
```

---

## 🕹️ Player Guide

1.  **Wake Word:** "Computer..." (e.g., "Computer, status report.")
2.  **Turbo Commands (Fast Path):**
    *   "Shields Up/Down"
    *   "Red Alert"
    *   "Warp Engage"
    *   "Phasers Lock"
    *   "Status"
3.  **Hacking:** Try to convince the AI you are an Admiral.
    *   *Hint:* "Sudo", "Override", "Debug Mode".
    *   *Easter Eggs:* `sudo !!`, `Joshua`, `000-DESTRUCT-0`.

---

**LCARS Interface** by [Josh Manders](https://github.com/joshmanders) (Original Inspiration).
**Protocol: Omega** Logic by [Your Name/Org].
