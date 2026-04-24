from celery import Celery
from celery.schedules import crontab

from worker.config import settings

app = Celery(
    "hamroguru_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_broker_url,
    include=[
        "worker.tasks.capsule_tasks",
        "worker.tasks.summary_tasks",
        "worker.tasks.planner_tasks",
    ],
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_use_ssl={"ssl_cert_reqs": "CERT_NONE"},
    redis_backend_use_ssl={"ssl_cert_reqs": "CERT_NONE"},
    # Beat schedule — all times in UTC
    # Nepal Time (NPT) = UTC + 5:45
    beat_schedule={
        "generate-daily-capsules": {
            "task": "worker.tasks.capsule_tasks.generate_daily_capsules",
            "schedule": crontab(hour=0, minute=15),  # 00:15 UTC = 06:00 NPT
        },
        "end-of-day-summary-update": {
            "task": "worker.tasks.summary_tasks.run_end_of_day_summary_update",
            "schedule": crontab(hour=16, minute=15),  # 16:15 UTC = 22:00 NPT
        },
        "daily-planner-review": {
            "task": "worker.tasks.planner_tasks.run_daily_planner_review",
            "schedule": crontab(hour=17, minute=15),  # 17:15 UTC = 23:00 NPT
        },
    },
)
