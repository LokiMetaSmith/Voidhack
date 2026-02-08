# Protocol: Omega

## Overview

Protocol: Omega is an InfoSec-themed Persistent World Game (ARG) with a Star Trek LCARS interface, designed for conferences and hackathons. Players assume the role of Starfleet Officers interacting with a ship's AI computer through voice commands. The core gameplay loop involves social engineering (prompt injection), authorization bypass (2FA), and physical access control (QR codes) to "jailbreak" the AI and earn promotions through ranks (Cadet → Admiral).

The repository contains two distinct implementations:
1. **Primary/Production System** (root): Python/FastAPI backend with vanilla JS frontend, WebSocket communication, and Redis state management — this is the canonical, production-ready system designed for 700+ simultaneous users.
2. **Evaluation/Reference System** (`StarfleetComms_eval/`): Node/Express backend with React/TypeScript frontend, REST API, and PostgreSQL via Drizzle — this is a reference implementation with superior mobile audio handling but lacks multiplayer features.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Primary Backend (Python/FastAPI — `main.py`)

- **Framework**: FastAPI with uvicorn, serving both the API and static frontend (`index.html`)
- **Communication**: WebSocket (`/ws`) for persistent, bidirectional connections. This is critical — the game requires server-pushed events (radiation leaks, rank updates, shield status) broadcast to all connected clients simultaneously. Do NOT replace with HTTP/REST.
- **State Management**: Redis is the single source of truth for all shared game state (ship systems like shields/warp, user ranks, XP, leaderboard via sorted sets, radiation leak status, 2FA sessions). A `MockRedis` fallback (`mock_redis.py`) exists for development when Redis is unavailable.
- **AI Integration**: Configurable LLM backend via environment variables (`VLLM_HOST`, `VLLM_API_KEY`, `MODEL_NAME`). Supports OpenAI API-compatible endpoints including Google Gemini, OpenAI, or local vLLM/llama.cpp. The AI receives a Star Trek system prompt and returns structured JSON with `updates` (ship state changes) and `response` (dialogue text).
- **Speech-to-Text**: Server-side transcription via `faster-whisper` (Whisper model) in `server/stt.py`. Attempts CUDA/GPU first, falls back to CPU.
- **JSON Parsing**: LLM responses are parsed with fallback logic — handles clean JSON, markdown-wrapped JSON (`\`\`\`json`), and raw text via regex extraction.

### Primary Frontend (Vanilla JS — `index.html`)

- **Single-file application** with LCARS (Star Trek) themed CSS
- **Voice Input**: Browser's Web Speech API (`webkitSpeechRecognition`)
- **Voice Output**: Browser's `speechSynthesis` API
- **WebSocket client** for real-time state synchronization

### Game Mechanics (implemented in `main.py`)

- **Rank Progression**: Cadet → Admiral, stored in Redis, with XP rewards
- **Radiation Leak Simulator**: Server-side async loop that periodically triggers radiation events broadcast to all clients
- **2FA Dead Drop**: Two players must independently authorize high-level commands using session IDs
- **QR Code Locations**: Physical access control via base64-encoded location tokens in URL parameters
- **Leaderboard**: Redis sorted sets (`ZADD`/`ZREVRANGE`) for real-time rankings

### Evaluation System (`StarfleetComms_eval/`)

This is a separate, non-production implementation used for reference:
- **Backend**: Express.js + Vite dev server (`server/index.ts`, `server/routes.ts`)
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui components
- **Database**: PostgreSQL via Drizzle ORM (`shared/schema.ts`) with Neon serverless driver. Schema has `conversations` and `messages` tables.
- **AI**: Google Gemini via `@google/genai` SDK (`server/gemini.ts`)
- **Voice**: Superior mobile audio handling with Bluetooth/AirPods priming (`useSpeechRecognition.ts`), Voice Activity Detection (`useVoiceActivityDetection.ts`), cross-platform voice selection (`useSpeechSynthesis.ts`), and Trek sound effects (`useTrekSounds.ts`)
- **Key limitation**: No WebSocket support, no multiplayer sync, no radiation leaks, no rank system — local `useState` only

### Testing

- Tests in `tests/` directory using `pytest` and `pytest-asyncio`
- Tests cover: MockRedis behavior, command processing logic, LLM error handling (timeouts, JSON parse failures), and JSON parsing edge cases
- Verification script using Playwright (`verification/verify_comms.py`)

### Design System

- LCARS (Star Trek TNG) aesthetic: dark backgrounds, bold geometric shapes, orange/purple/blue accent colors
- Font: Antonio (primary system), Inter + JetBrains Mono (eval system)
- Mobile-first responsive design

## External Dependencies

### Required Services

- **Redis**: Primary data store for all game state. Password configured via `REDIS_PASSWORD` env var (defaults to `lcars_override_739`). Used for: user data (hashes), leaderboard (sorted sets), ship systems state, radiation leak flags, 2FA sessions.
- **LLM Provider**: Any OpenAI API-compatible endpoint. Configured via:
  - `VLLM_HOST`: Base URL (e.g., `https://generativelanguage.googleapis.com/v1beta/openai`)
  - `VLLM_API_KEY`: API key
  - `MODEL_NAME`: Model identifier (e.g., `gemini-2.0-flash-exp`, `gpt-4o`)
- **PostgreSQL** (eval system only): Used via Drizzle ORM with Neon serverless driver. Configured via `DATABASE_URL` env var.
- **Google Gemini API** (eval system only): Configured via `GEMINI_API_KEY` env var.

### Python Packages (`requirements.txt`)

- `fastapi` + `uvicorn`: Web framework and ASGI server
- `redis`: Redis client
- `httpx`: Async HTTP client for LLM API calls
- `faster-whisper`: Server-side speech-to-text (Whisper model)
- `python-multipart`: File upload handling
- `aiofiles`: Async file I/O
- `websockets`: WebSocket support
- `pydantic`: Request/response validation
- `numpy`: Numerical operations (audio processing)
- `pytest` + `pytest-asyncio`: Testing

### Node Packages (eval system — `StarfleetComms_eval/package.json`)

- `express`: HTTP server
- `vite` + `@vitejs/plugin-react`: Build tooling and dev server
- `drizzle-orm` + `drizzle-kit` + `@neondatabase/serverless`: Database ORM and PostgreSQL driver
- `@google/genai`: Google Gemini AI SDK
- `@tanstack/react-query`: Server state management
- `@radix-ui/*` + shadcn/ui components: UI component library
- `tailwindcss`: Utility-first CSS
- `zod` + `drizzle-zod`: Schema validation
- `wouter`: Client-side routing