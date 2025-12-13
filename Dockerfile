# Use a lightweight Python base image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

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

# Expose the application port
EXPOSE 8000

# Command to run the application
# We use 0.0.0.0 to bind to all interfaces inside the container
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
