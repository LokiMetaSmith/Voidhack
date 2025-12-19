# Replit Secrets Template

To run this project on Replit with an external LLM provider, add the following Secrets to your Repl:

## Required

*   **`REDIS_PASSWORD`**
    *   *Description:* Password for the local Redis instance.
    *   *Default (if not set):* `lcars_override_739`
    *   *Note:* The application will default to `lcars_override_739` if this secret is missing, but it is good practice to set it.

*   **`VLLM_API_KEY`**
    *   *Description:* Your API Key for the LLM provider (OpenAI, Google Gemini, etc.).

*   **`VLLM_HOST`**
    *   *Description:* The base URL for the LLM API.
    *   *Format:* Just the base domain (e.g., `https://api.openai.com` or `https://generativelanguage.googleapis.com`). The application logic will append `/v1/chat/completions` or similar paths automatically.

## Configuration Examples

### OpenAI
*   **`VLLM_HOST`**: `https://api.openai.com`
*   **`VLLM_API_KEY`**: `sk-...` (your OpenAI key)
*   **`MODEL_NAME`**: `gpt-3.5-turbo` (or `gpt-4o`, etc.)

### Google Gemini (via OpenAI Compatibility)
*   **`VLLM_HOST`**: `https://generativelanguage.googleapis.com/v1beta/openai`
*   **`VLLM_API_KEY`**: `...` (your Google AI Studio key)
*   **`MODEL_NAME`**: `gemini-1.5-flash` (or `gemini-2.0-flash-exp`)

### Local/Custom (if applicable)
*   **`VLLM_HOST`**: `http://your-custom-host:port`
