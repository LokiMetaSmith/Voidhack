#!/bin/bash
set -e

# 1. Ensure Model Exists
echo "Checking for LLM model..."
python3 download_model.py

# 2. Detect Hardware
echo "Detecting hardware..."

HAS_NVIDIA=false

if command -v nvidia-smi &> /dev/null; then
    if nvidia-smi &> /dev/null; then
        echo "NVIDIA GPU detected."
        HAS_NVIDIA=true
    else
        echo "nvidia-smi found but returned error (driver issue?). Defaulting to CPU/llama.cpp."
    fi
else
    echo "No NVIDIA GPU detected."
fi

# 3. Launch Docker Compose
if [ "$HAS_NVIDIA" = true ]; then
    echo "Starting in NVIDIA mode (vLLM)..."
    export PROFILE="nvidia"
    docker compose --profile nvidia up --build
else
    echo "Starting in CPU/Generic mode (llama.cpp)..."
    export PROFILE="cpu"
    # Ensure local directory permissions if needed for the container to read the model
    chmod -R 755 models/
    docker compose --profile cpu up --build
fi
