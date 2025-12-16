import os
import sys
import urllib.request
import urllib.error

MODEL_DIR = "models"
MODEL_FILENAME = "Phi-3-mini-4k-instruct-q4.gguf"
MODEL_URL = "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf"
MODEL_PATH = os.path.join(MODEL_DIR, MODEL_FILENAME)
MIN_FILE_SIZE_MB = 100  # Minimum valid size to consider "downloaded"

def download_file(url, destination):
    print(f"Downloading {url} to {destination}...")
    try:
        with urllib.request.urlopen(url) as response:
            total_size = int(response.getheader("Content-Length", 0))
            downloaded = 0
            block_size = 8192

            with open(destination, "wb") as f:
                while True:
                    chunk = response.read(block_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size:
                        percent = (downloaded / total_size) * 100
                        sys.stdout.write(f"\rProgress: {percent:.2f}%")
                        sys.stdout.flush()
        print("\nDownload complete.")
    except Exception as e:
        print(f"\nError downloading model: {e}")
        # Clean up partial or failed download
        if os.path.exists(destination):
            os.remove(destination)
        sys.exit(1)

def main():
    if not os.path.exists(MODEL_DIR):
        os.makedirs(MODEL_DIR)
        print(f"Created directory: {MODEL_DIR}")

    if os.path.exists(MODEL_PATH):
        file_size_mb = os.path.getsize(MODEL_PATH) / (1024 * 1024)
        if file_size_mb > MIN_FILE_SIZE_MB:
            print(f"Model already exists at {MODEL_PATH} ({file_size_mb:.2f} MB). Skipping download.")
            return
        else:
            print(f"Found incomplete or invalid model file ({file_size_mb:.2f} MB). Re-downloading...")
            os.remove(MODEL_PATH)

    download_file(MODEL_URL, MODEL_PATH)

if __name__ == "__main__":
    main()
