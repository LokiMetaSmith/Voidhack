# Voidhack

Voidhack is a Star Trek LCARS-themed voice command application that simulates a ship's computer interface. It allows users to control various ship systems (like shields, warp drive, phasers, etc.) using natural language voice commands.

The project uses a **Python (FastAPI)** backend with **SQLite** for state management, and a **Vanilla JavaScript** frontend styled with CSS to look like the LCARS (Library Computer Access and Retrieval System) interface from *Star Trek: The Next Generation*. It integrates with **Ollama** running locally to interpret user intent using an LLM, falling back to basic keyword matching if Ollama is unavailable.

## Tech Stack

*   **Backend:** Python 3, FastAPI, Uvicorn
*   **Database:** SQLite (`ship_state.db`)
*   **Frontend:** HTML5, CSS3 (LCARS design), Vanilla JavaScript
*   **AI/LLM:** Ollama (local LLM inference) for natural language understanding
*   **Voice:** Web Speech API (Speech-to-Text & Text-to-Speech)
*   **Hardware Integration:** Media Session API hack to support Bluetooth headset button triggers

## Prerequisites

*   Python 3.8+
*   [Ollama](https://ollama.com/) (Optional, for advanced command interpretation)
    *   If using Ollama, ensure the `llama3` model is pulled: `ollama pull llama3`

## Installation

1.  Clone the repository (if applicable).
2.  Install the required Python dependencies:

    ```bash
    pip install -r requirements.txt
    ```

## Usage

1.  Start the application server:

    ```bash
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
    ```

    *   The server runs on port `8000` by default.
    *   If you have Ollama running, ensure it is accessible at `http://localhost:11434` (default).

2.  Open your web browser and navigate to:

    ```
    http://localhost:8000
    ```

3.  **Initialize Comms:**
    *   Click the **"INIT COMMS"** button on the LCARS interface.
    *   This starts a silent audio loop that allows the browser to intercept media keys.
    *   **Bluetooth Headset:** You can now press the play/pause button on your Bluetooth headset to trigger the listening mode.

4.  **Voice Commands:**
    *   Once listening (indicated by "LISTENING..." on screen and a chirp sound), speak your command.
    *   Examples:
        *   "Raise shields to maximum."
        *   "Engage warp drive."
        *   "Arm phasers."
        *   "Set impulse to full power."
        *   "Status report."

5.  **System Status:**
    *   The main display shows the current levels of ship systems (Shields, Impulse, Warp, Phasers, Life Support).
    *   The log panel shows the computer's text response.

## Configuration

*   **Ollama Model:** Defaults to `llama3`. Can be changed via the `OLLAMA_MODEL` environment variable.
*   **Ollama Host:** Defaults to `http://localhost:11434/api/generate`. Can be changed via the `OLLAMA_HOST` environment variable.

## Troubleshooting

### Common Console Errors

*   **`[Password Alert] completePageInitializationIfReady_ ...`**:
    *   If you see this error in the browser console, it is caused by the Google **Password Alert** Chrome extension. It is unrelated to the Voidhack application and can be safely ignored.
