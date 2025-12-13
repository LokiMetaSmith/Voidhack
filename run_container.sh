#!/bin/bash

# Function to prompt for input
prompt_input() {
    read -p "$1" input
    echo "$input"
}

echo "=== Protocol: Omega Container Launcher ==="
echo ""
echo "Please choose the LLM backend mode:"
echo "1) Local vLLM (Requires NVIDIA GPU & Docker NVIDIA Runtime)"
echo "2) External API (OpenAI compatible, e.g., Groq, OpenAI, or remote vLLM)"
echo ""

read -p "Enter choice [1/2]: " mode

if [ "$mode" == "1" ]; then
    echo "Starting in LOCAL mode..."
    # Set default host for internal container networking
    export VLLM_HOST="http://vllm:8000"

    # Run with gpu profile
    docker compose --profile gpu up --build
else
    echo "Starting in EXTERNAL API mode..."

    default_url="https://api.openai.com"
    read -p "Enter External API URL (default: $default_url): " input_url
    export VLLM_HOST="${input_url:-$default_url}"

    read -s -p "Enter API Key: " input_key
    echo ""
    export VLLM_API_KEY="$input_key"

    # Run without gpu profile
    docker compose up --build
fi
