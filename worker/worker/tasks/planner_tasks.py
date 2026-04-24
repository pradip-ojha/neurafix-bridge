"""
Phase 7: Daily planner review task.
Placeholder — full implementation in Phase 7.
"""
from worker.celery_app import app


@app.task(name="worker.tasks.planner_tasks.run_daily_planner_review")
def run_daily_planner_review():
    """Run non-interactive planner review for active students. Implemented in Phase 7."""
    print("[planner_tasks] run_daily_planner_review — placeholder, implemented in Phase 7")
    return {"status": "placeholder"}
