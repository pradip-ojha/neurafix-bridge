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
        "worker.tasks.consultant_tasks",
        "worker.tasks.weekly_summary_tasks",
        "worker.tasks.update_alltime_tasks",
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
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Beat schedule — all times in UTC
    # Nepal Time (NPT) = UTC + 5:45
    beat_schedule={
        "end-of-day-summaries": {
            "task": "worker.tasks.summary_tasks.run_end_of_day_summary_update",
            "schedule": crontab(hour=16, minute=15),   # 22:00 NPT daily
        },
        "generate-capsules": {
            "task": "worker.tasks.capsule_tasks.generate_daily_capsules",
            "schedule": crontab(hour=16, minute=45),   # 22:30 NPT daily
        },
        "consultant-review": {
            "task": "worker.tasks.consultant_tasks.run_consultant_review",
            "schedule": crontab(hour=17, minute=15),   # 23:00 NPT daily
        },
        "regenerate-weekly-summaries": {
            "task": "worker.tasks.weekly_summary_tasks.regenerate_weekly_summaries",
            "schedule": crontab(hour=0, minute=15),    # 06:00 NPT daily
        },
        "update-alltime-summaries": {
            "task": "worker.tasks.update_alltime_tasks.update_alltime_summaries",
            "schedule": crontab(hour=0, minute=15, day_of_week=1),  # 06:00 NPT Monday
        },
    },
)
