# Architecture Comparison Report

This report compares the current "Galaxy Class" architecture (implemented in the codebase) with the proposed "Voice Processing Architecture" (provided in the prompt).

## Executive Summary

| Feature | Current Architecture (Codebase) | Proposed Architecture (Spec) | Recommendation |
| :--- | :--- | :--- | :--- |
| **Communication** | **WebSocket (Persistent)** | HTTP (Request/Response) | **Keep Current** (Critical for multiplayer events) |
| **Frontend Framework** | Vanilla JavaScript | React / TypeScript | **Keep Current** (Unless strict typing is required) |
| **Audio Input** | Standard Web Speech API | **Mobile-Optimized** (Bluetooth, iOS Fixes) | **Adopt Proposed Logic** (High value for mobile UX) |
| **AI Provider** | vLLM (Phi-3) | Google Gemini 2.5 Flash | **Neutral** (Switchable via config) |
| **State Management** | Redis (Shared/Global) | Stateless / Request-Scope | **Keep Current** |

---

## 1. Communication Protocol: WebSockets vs. HTTP

### Current: WebSocket (`/ws`)
The current application uses a persistent WebSocket connection.
*   **Pros:**
    *   **Real-time Push:** Allows the server to push "Radiation Leaks" and "Rank Updates" to *all* clients instantly without them asking.
    *   **Lower Latency:** No TCP handshake overhead per command.
    *   **State Synchronization:** The "Ship Systems" (Shields, Warp) are synced across all 700+ users in real-time.
*   **Cons:** Higher server memory footprint to maintain open connections.

### Proposed: HTTP (`/api/chat`)
The proposed architecture uses a standard REST pattern.
*   **Pros:** Simpler to scale (stateless); standard request/response model.
*   **Cons:**
    *   **No Real-time Events:** You cannot push a "Radiation Leak" event to the client unless the client is constantly polling (which kills battery/performance).
    *   **Latency:** Higher "Time to First Byte" due to connection setup for every voice command.

### **Conclusion**
**Do NOT switch to HTTP.** The "Game" nature of the application (Shared Shield Health, Radiation Leaks, Multiplayer 2FA) *requires* the event-driven capabilities of WebSockets. Switching to HTTP would break the "Live" feel of the bridge simulation.

---

## 2. Audio Processing (Microphone & Output)

### Current: Basic Web Speech
*   **Input:** `webkitSpeechRecognition` with `continuous = true`.
*   **Mobile Behavior:** Likely fails to capture audio via Bluetooth headsets on iOS; `continuous` mode often times out unpredictably on Safari.
*   **Output:** `speechSynthesis` uses the default voice with no fallback priority.

### Proposed: Mobile-Optimized
*   **Input:**
    *   **Bluetooth Priming:** `initializeBluetoothAudio()` activates `getUserMedia` briefly to force iOS to route audio to AirPods/Headsets before recognition starts.
    *   **Platform Specifics:** Explicitly uses `continuous: false` for iOS Safari (restarting manually) to avoid the known Safari "silence" bug.
*   **Output:**
    *   **Voice Selection:** Explicit priority list (Zira -> Samantha -> Google UK).
    *   **iOS Warmup:** Handles the user-gesture requirement for audio playback more robustly.

### **Conclusion**
**Adopt the Proposed Audio Logic.** The current implementation is functional for Desktop/Android but will likely fail or provide a poor experience on iPhones (Safari). The "Bluetooth Prime" and "Voice Priority" logic are significant UX performance improvements.

---

## 3. Frontend Framework: Vanilla JS vs. React

### Current: Vanilla JS (`index.html`)
*   **Performance:** Extremely lightweight. No virtual DOM overhead. Instant load time.
*   **Complexity:** Logic is tightly coupled in one file. Harder to maintain as complexity grows.

### Proposed: React + TypeScript
*   **Performance:** Adds bundle size overhead (React runtime).
*   **Benefits:** Better state management (Redux/Context) and type safety.

### **Conclusion**
**Keep Current (Vanilla JS) for now.** For a single-view terminal interface, the performance overhead of React outweighs its organizational benefits. The current raw DOM manipulation is optimal for the "low-latency" feel required by the LCARS interface.

---

## 4. AI Provider: vLLM vs. Gemini

### Current: vLLM (Phi-3)
*   **Integration:** Uses `httpx` to POST to an OpenAI-compatible endpoint.
*   **Logic:** Enforces a strict JSON schema via System Prompt.

### Proposed: Google Gemini 2.5 Flash
*   **Integration:** Uses Google's API.
*   **Benefits:** Gemini 2.5 Flash is significantly faster and smarter than a local Phi-3 model.

### **Compatibility & Feasibility**
The current backend *is* compatible with Gemini if using Google's **OpenAI Compatibility Layer**.
*   **Action:** You can switch providers *without* changing code by setting the environment variables:
    *   `VLLM_HOST`: `https://generativelanguage.googleapis.com/v1beta/openai/`
    *   `VLLM_API_KEY`: `[Your Gemini Key]`
    *   `MODEL_NAME`: `gemini-2.0-flash` (or similar)

*Note: You may need to adjust the System Prompt slightly if Gemini refuses to output raw JSON without more coaxing.*

---

## Final Plan

Based on this analysis, I propose the following roadmap:

1.  **Retain the WebSocket Architecture:** It is superior for the multiplayer requirements.
2.  **Refactor Audio Logic:** Port the "Bluetooth Initialization" and "Voice Selection" logic from the proposed architecture into the current `index.html`.
3.  **Upgrade to Gemini (Optional):** Update the `run_container.sh` or `.env` to point to Gemini's OpenAI endpoint if superior model performance is desired.
