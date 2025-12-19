#!/bin/bash

# Kill any existing processes on ports 8000 (App) and 6379 (Redis)
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :6379 | xargs kill -9 2>/dev/null || true

# Default Redis Password if not set in Secrets
export REDIS_PASSWORD=${REDIS_PASSWORD:-lcars_override_739}

echo "Starting Redis..."
# Start Redis in the background, bound to localhost, with the specified password
redis-server --port 6379 --bind 127.0.0.1 --requirepass "$REDIS_PASSWORD" --daemonize yes

echo "Installing Dependencies..."
pip install -r requirements.txt

echo "Starting Application..."
# Start the FastAPI app
uvicorn main:app --host 0.0.0.0 --port 8000
