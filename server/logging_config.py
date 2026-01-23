import logging
import json
import datetime
import sys

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": datetime.datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "funcName": record.funcName,
            "lineno": record.lineno,
        }
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_record)

def setup_logging():
    # Create the root logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Remove existing handlers to avoid duplication (e.g. from uvicorn default config)
    if logger.handlers:
        for handler in logger.handlers:
            logger.removeHandler(handler)

    # Create console handler with JSON formatter
    handler = logging.StreamHandler(sys.stdout)
    formatter = JSONFormatter()
    handler.setFormatter(formatter)

    logger.addHandler(handler)

    # Configure uvicorn loggers to use the same handler or propagate
    # Note: Uvicorn usually configures its own logging, so we might need to override it
    # or just let it be if we only care about application logs.
    # But usually one wants unified JSON logging.

    # Force uvicorn access and error logs to propagate to root or attach our handler
    for log_name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
        log = logging.getLogger(log_name)
        log.handlers = [] # clear default handlers
        log.propagate = True # let it bubble up to root which has JSON formatter
