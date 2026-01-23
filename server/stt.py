from faster_whisper import WhisperModel
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Load model once on GPU
# "medium.en" is a great balance of speed/accuracy for a 3090
try:
    model = WhisperModel("medium.en", device="cuda", compute_type="float16")
except Exception as e:
    print(f"Warning: Could not load Whisper model on CUDA: {e}")
    print("Falling back to CPU (or failing if CPU not supported by logic)")
    # Fallback to CPU for development environment where CUDA might be missing
    try:
        model = WhisperModel("medium.en", device="cpu", compute_type="int8")
    except Exception as e2:
        print(f"Critical: Could not load Whisper model on CPU either: {e2}")
        model = None

executor = ThreadPoolExecutor(max_workers=1)

def _transcribe(audio_path):
    if model is None:
        return "Error: Speech recognition model unavailable."
    segments, _ = model.transcribe(audio_path, beam_size=5)
    return " ".join([segment.text for segment in segments])

async def transcribe_audio(file_path):
    loop = asyncio.get_running_loop()
    text = await loop.run_in_executor(executor, _transcribe, file_path)
    return text.strip()
