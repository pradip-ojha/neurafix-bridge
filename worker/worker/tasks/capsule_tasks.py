"""
Phase 7: Daily capsule generation task.
Placeholder — full implementation in Phase 7.
"""
from worker.celery_app import app


@app.task(name="worker.tasks.capsule_tasks.generate_daily_capsules")
def generate_daily_capsules():
    """Generate daily capsules for all active students. Implemented in Phase 7."""
    print("[capsule_tasks] generate_daily_capsules — placeholder, implemented in Phase 7")
    return {"status": "placeholder"}
