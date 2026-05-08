"""
All-time summary update task.
Runs weekly on Monday at 06:00 NPT (00:15 UTC).
Updates all-time summaries by merging new daily summaries with previous all-time content.
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
                r = httpx.post(
                    f"{ai_url}/api/internal/personalization/update-alltime-summary",
                    json={"user_id": user_id, "subject": subject},
                    headers=_HEADERS,
                    timeout=120,
                )
                if r.status_code == 200:
                    success += 1
                else:
                    logger.warning("All-time summary failed user=%s subject=%s status=%d", user_id, subject, r.status_code)
                    failed += 1
            except Exception as exc:
                logger.error("All-time summary error user=%s subject=%s: %s", user_id, subject, exc)
                failed += 1

    logger.info("All-time summary update complete: success=%d failed=%d", success, failed)
    return {"status": "ok", "success": success, "failed": failed}
