import json
import logging
import pytest
from server.logging_config import JSONFormatter

def test_json_formatter():
    formatter = JSONFormatter()
    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Test message",
        args=(),
        exc_info=None
    )

    formatted = formatter.format(record)
    data = json.loads(formatted)

    assert data["message"] == "Test message"
    assert data["level"] == "INFO"
    assert "timestamp" in data
    assert "module" in data
    assert data["lineno"] == 10

def test_json_formatter_exception():
    formatter = JSONFormatter()
    try:
        raise ValueError("Test Error")
    except ValueError:
        import sys
        exc_info = sys.exc_info()

    record = logging.LogRecord(
        name="test_logger",
        level=logging.ERROR,
        pathname="test.py",
        lineno=20,
        msg="Error occurred",
        args=(),
        exc_info=exc_info
    )

    formatted = formatter.format(record)
    data = json.loads(formatted)

    assert data["message"] == "Error occurred"
    assert "exception" in data
    assert "ValueError: Test Error" in data["exception"]
