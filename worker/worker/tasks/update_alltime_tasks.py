"""
All-time summary update task.
Runs weekly on Monday at 06:00 NPT (00:15 UTC).
Updates all-time summaries by merging new daily summaries with previous all-time content.
"""
import logging
import time

import httpx

from worker.celery_app import app
from worker.config import settings
from worker.notify import notify_if_high_failure

logger = logging.getLogger(__name__)

_ALL_SUBJECTS = [
    "mathematics",
    "optional_math",
    "english",
    "science",
]

_HEADERS = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}


def _post_with_retry(url: str, json_body: dict, timeout: int) -> httpx.Response | None:
    for attempt in range(3):
        try:
            r = httpx.post(url, json=json_body, headers=_HEADERS, timeout=timeout)
            return r
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    return None


@app.task(name="worker.tasks.update_alltime_tasks.update_alltime_summaries")
def update_alltime_summaries():
    """Update all-time summaries and overall student summaries for all users."""
    ai_url = settings.AI_SERVICE_URL

    try:
        resp = httpx.get(f"{ai_url}/api/internal/active-users", headers=_HEADERS, timeout=30)
        resp.raise_for_status()
        user_ids = resp.json().get("user_ids", [])
    except Exception as exc:
        logger.error("Failed to fetch active users: %s", exc)
        return {"status": "error", "error": str(exc)}

    logger.info("Updating all-time summaries for %d users", len(user_ids))
    success, failed = 0, 0

    for user_id in user_ids:
        for subject in _ALL_SUBJECTS:
            try:
                r = _post_with_retry(
                    f"{ai_url}/api/internal/personalization/update-alltime-summary",
                    json_body={"user_id": user_id, "subject": subject},
                    timeout=120,
                )
                if r is not None and r.status_code == 200:
                    success += 1
                else:
                    status_code = r.status_code if r is not None else "n/a"
                    logger.warning("All-time summary failed user=%s subject=%s status=%s", user_id, subject, status_code)
                    failed += 1
            except Exception as exc:
                logger.error("All-time summary error user=%s subject=%s: %s", user_id, subject, exc)
                failed += 1

    logger.info("All-time summary update complete: success=%d failed=%d", success, failed)
    notify_if_high_failure("alltime_summary", success, failed)
    return {"status": "ok", "success": success, "failed": failed}
