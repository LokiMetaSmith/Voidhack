# Use a lightweight Python base image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies (including openssl just in case, though usually present)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies
# We copy requirements.txt first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY mock_redis.py .
COPY profiling_utils.py .
COPY index.html .
COPY audio_processor.wasm .
COPY audio_processor.b64 .
COPY entrypoint.sh .

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

# Expose the application port
EXPOSE 8000

# Command to run the application
CMD ["./entrypoint.sh"]
