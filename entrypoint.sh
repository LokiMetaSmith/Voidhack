#!/bin/bash
set -e

# Generate self-signed certificate if not exists
if [ ! -f cert.pem ]; then
    echo "Generating self-signed certificate..."
    # Using a generic subject to avoid interactive prompts
    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=loki-llm.local'
fi

# Execute the main application with SSL enabled
echo "Starting uvicorn with SSL..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
