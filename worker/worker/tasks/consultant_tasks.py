"""
Consultant review task (formerly planner_tasks).
Runs at end of day (23:00 NPT = 17:15 UTC).
Reads each user's consultant chat and updates overall summary / timeline if needed.
"""
import logging

import httpx

from worker.celery_app import app
from worker.config import settings

logger = logging.getLogger(__name__)

_HEADERS = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}


@app.task(name="worker.tasks.consultant_tasks.run_consultant_review")
def run_consultant_review():
    """Review consultant chats and update summaries/timelines for all active students."""
    ai_url = settings.AI_SERVICE_URL

    try:
        resp = httpx.get(f"{ai_url}/api/internal/active-users", headers=_HEADERS, timeout=30)
        resp.raise_for_status()
        user_ids = resp.json().get("user_ids", [])
    except Exception as exc:
        logger.error("Failed to fetch active users: %s", exc)
        return {"status": "error", "error": str(exc)}

    logger.info("Running consultant review for %d users", len(user_ids))
    success, failed = 0, 0

    for user_id in user_ids:
        try:
            r = httpx.post(
                f"{ai_url}/api/internal/personalization/review-consultant",
                json={"user_id": user_id},
                headers=_HEADERS,
                timeout=120,
            )
            if r.status_code == 200:
                success += 1
            else:
                logger.warning("Consultant review failed user=%s status=%d", user_id, r.status_code)
                failed += 1
        except Exception as exc:
            logger.error("Consultant review error user=%s: %s", user_id, exc)
            failed += 1

    logger.info("Consultant review complete: success=%d failed=%d", success, failed)
    return {"status": "ok", "success": success, "failed": failed}
