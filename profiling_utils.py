import time
import logging
from functools import wraps
from contextlib import contextmanager

# Configure a specific logger for profiling
# Using print for simplicity to ensure it appears in uvicorn logs without complex config
def log_profile(msg):
    print(f"[PROFILER] {msg}")

def profile_time(func):
    """Decorator to measure execution time of a function."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        duration = (end_time - start_time) * 1000  # in ms
        log_profile(f"Function '{func.__name__}' took {duration:.2f} ms")
        return result
    return wrapper

@contextmanager
def profile_block(name):
    """Context manager to measure execution time of a code block."""
    start_time = time.time()
    try:
        yield
    finally:
        end_time = time.time()
        duration = (end_time - start_time) * 1000  # in ms
        log_profile(f"Block '{name}' took {duration:.2f} ms")
