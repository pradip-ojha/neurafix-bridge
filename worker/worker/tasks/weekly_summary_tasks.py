"""
Weekly summary regeneration task.
Runs daily at 06:00 NPT (00:15 UTC).
Regenerates weekly summaries from last 7 daily summaries for all users.
"""
import logging
import time

import httpx

from worker.celery_app import app
from worker.config import settings
from worker.notify import notify_if_high_failure

logger = logging.getLogger(__name__)

_ALL_SUBJECTS = [
    "compulsory_math",
    "optional_math",
    "compulsory_english",
    "compulsory_science",
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


@app.task(name="worker.tasks.weekly_summary_tasks.regenerate_weekly_summaries")
def regenerate_weekly_summaries():
    """Regenerate weekly summaries for all users."""
    ai_url = settings.AI_SERVICE_URL

    try:
        resp = httpx.get(f"{ai_url}/api/internal/active-users", headers=_HEADERS, timeout=30)
        resp.raise_for_status()
        user_ids = resp.json().get("user_ids", [])
    except Exception as exc:
        logger.error("Failed to fetch active users: %s", exc)
        return {"status": "error", "error": str(exc)}

    logger.info("Regenerating weekly summaries for %d users", len(user_ids))
    success, failed = 0, 0

    for user_id in user_ids:
        for subject in _ALL_SUBJECTS:
            try:
                r = _post_with_retry(
                    f"{ai_url}/api/internal/personalization/regenerate-weekly-summary",
                    json_body={"user_id": user_id, "subject": subject},
                    timeout=120,
                )
                if r is not None and r.status_code == 200:
                    success += 1
                else:
                    status_code = r.status_code if r is not None else "n/a"
                    logger.warning("Weekly summary failed user=%s subject=%s status=%s", user_id, subject, status_code)
                    failed += 1
            except Exception as exc:
                logger.error("Weekly summary error user=%s subject=%s: %s", user_id, subject, exc)
                failed += 1

    logger.info("Weekly summary regeneration complete: success=%d failed=%d", success, failed)
    notify_if_high_failure("weekly_summary", success, failed)
    return {"status": "ok", "success": success, "failed": failed}
