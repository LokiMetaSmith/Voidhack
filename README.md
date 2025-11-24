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

## 🛠️ Setup & Deployment

### Prerequisites
*   Python 3.9+
*   [Ollama](https://ollama.com/) running locally (default port 11434).
*   Model: `qwen2.5:1.5b` (or change `MODEL_NAME` in `main.py`).

### Installation
1.  Clone the repo.
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Start the server:
    ```bash
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
    ```

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
