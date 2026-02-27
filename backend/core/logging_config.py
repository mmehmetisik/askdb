"""
logging_config.py  —  Centralized logging setup.
Supports text/JSON output, request ID tracing, and optional file rotation.
"""
import os
import json
import logging
from logging.handlers import RotatingFileHandler
from contextvars import ContextVar

# Request ID context variable (set by middleware, read by formatter)
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

LOG_FORMAT = os.getenv("LOG_FORMAT", "text")        # "text" or "json"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FILE = os.getenv("LOG_FILE", "")                 # e.g. "logs/app.log"
LOG_MAX_BYTES = int(os.getenv("LOG_MAX_BYTES", str(10 * 1024 * 1024)))  # 10 MB
LOG_BACKUP_COUNT = int(os.getenv("LOG_BACKUP_COUNT", "5"))


class _RequestIdFilter(logging.Filter):
    """Inject request_id into every log record."""
    def filter(self, record):
        record.request_id = request_id_var.get("-")
        return True


class _TextFormatter(logging.Formatter):
    def __init__(self):
        super().__init__("%(asctime)s [%(levelname)s] [%(request_id)s] %(message)s")


class _JSONFormatter(logging.Formatter):
    def format(self, record):
        entry = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "rid": getattr(record, "request_id", "-"),
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0]:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup_logging() -> logging.Logger:
    """Configure logging once at startup. Returns the 'text2sql' logger."""
    logger = logging.getLogger("text2sql")
    logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    logger.handlers.clear()

    formatter = _JSONFormatter() if LOG_FORMAT == "json" else _TextFormatter()
    rid_filter = _RequestIdFilter()

    # Console handler
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    console.addFilter(rid_filter)
    logger.addHandler(console)

    # Optional file handler with rotation
    if LOG_FILE:
        os.makedirs(os.path.dirname(LOG_FILE) or ".", exist_ok=True)
        fh = RotatingFileHandler(
            LOG_FILE, maxBytes=LOG_MAX_BYTES, backupCount=LOG_BACKUP_COUNT,
            encoding="utf-8",
        )
        fh.setFormatter(formatter)
        fh.addFilter(rid_filter)
        logger.addHandler(fh)

    return logger
