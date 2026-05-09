"""
End-of-day summary task.
Fetches active users from ai_service, then generates daily summaries for each user × subject.
"""
import logging
import time
from datetime import datetime, timezone

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


@app.task(name="worker.tasks.summary_tasks.run_end_of_day_summary_update")
def run_end_of_day_summary_update():
    """Generate daily personalization summaries for all active students."""
    today = datetime.now(timezone.utc).date().isoformat()
    ai_url = settings.AI_SERVICE_URL

    try:
        resp = httpx.get(f"{ai_url}/api/internal/active-users", headers=_HEADERS, timeout=30)
        resp.raise_for_status()
        user_ids = resp.json().get("user_ids", [])
    except Exception as exc:
        logger.error("Failed to fetch active users: %s", exc)
        return {"status": "error", "error": str(exc)}

    logger.info("Running daily summary update for %d users", len(user_ids))
    success, failed = 0, 0

    for user_id in user_ids:
        for subject in _ALL_SUBJECTS:
            try:
                r = _post_with_retry(
                    f"{ai_url}/api/internal/personalization/generate-daily-summary",
                    json_body={"user_id": user_id, "subject": subject, "date": today},
                    timeout=120,
                )
                if r is not None and r.status_code == 200:
                    success += 1
                else:
                    status_code = r.status_code if r is not None else "n/a"
                    logger.warning("Daily summary failed user=%s subject=%s status=%s", user_id, subject, status_code)
                    failed += 1
            except Exception as exc:
                logger.error("Daily summary error user=%s subject=%s: %s", user_id, subject, exc)
                failed += 1

    logger.info("Daily summary update complete: success=%d failed=%d", success, failed)
    notify_if_high_failure("daily_summary", success, failed)
    return {"status": "ok", "success": success, "failed": failed}
