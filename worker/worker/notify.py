"""Helper to send worker failure alerts to main_backend admin-notify endpoint."""
import logging

import httpx

from worker.config import settings

logger = logging.getLogger(__name__)

_HEADERS = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
_FAILURE_THRESHOLD = 0.1  # 10%


def notify_if_high_failure(task_name: str, success: int, failed: int) -> None:
    total = success + failed
    if total == 0 or failed / total <= _FAILURE_THRESHOLD:
        return
    try:
        httpx.post(
            f"{settings.MAIN_BACKEND_URL}/api/internal/admin-notify",
            json={
                "type": "worker_failure",
                "payload": {
                    "task": task_name,
                    "success": success,
                    "failed": failed,
                    "total": total,
                    "failure_rate": round(failed / total, 3),
                },
            },
            headers=_HEADERS,
            timeout=10,
        )
    except Exception as exc:
        logger.warning("Failed to send admin notification: %s", exc)
