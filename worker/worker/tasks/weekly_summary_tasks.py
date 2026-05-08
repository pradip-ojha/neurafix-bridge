"""
Weekly summary regeneration task.
Runs daily at 06:00 NPT (00:15 UTC).
Regenerates weekly summaries from last 7 daily summaries for all users.
"""
import logging

import httpx

from worker.celery_app import app
from worker.config import settings

logger = logging.getLogger(__name__)

_ALL_SUBJECTS = [
    "compulsory_math",
    "optional_math",
    "compulsory_english",
    "compulsory_science",
]

_HEADERS = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}


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
                r = httpx.post(
                    f"{ai_url}/api/internal/personalization/regenerate-weekly-summary",
                    json={"user_id": user_id, "subject": subject},
                    headers=_HEADERS,
                    timeout=120,
                )
                if r.status_code == 200:
                    success += 1
                else:
                    logger.warning("Weekly summary failed user=%s subject=%s status=%d", user_id, subject, r.status_code)
                    failed += 1
            except Exception as exc:
                logger.error("Weekly summary error user=%s subject=%s: %s", user_id, subject, exc)
                failed += 1

    logger.info("Weekly summary regeneration complete: success=%d failed=%d", success, failed)
    return {"status": "ok", "success": success, "failed": failed}
