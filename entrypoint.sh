#!/bin/bash
set -e

# Default to HTTP unless USE_SSL is set to true (case insensitive)
USE_SSL=${USE_SSL:-false}
echo "Detected USE_SSL value: '$USE_SSL'"

# Check for true (case insensitive)
if [[ "${USE_SSL,,}" == "true" ]]; then
    # Generate self-signed certificate if not exists
    if [ ! -f cert.pem ]; then
        echo "Generating self-signed certificate..."
        # Using a generic subject to avoid interactive prompts
        openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=loki-llm.local'
    fi

    # Execute the main application with SSL enabled
    echo "Starting uvicorn with SSL..."
    exec uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
else
    # Execute the main application in HTTP mode
    echo "Starting uvicorn in HTTP mode..."
    exec uvicorn main:app --host 0.0.0.0 --port 8000
fi
