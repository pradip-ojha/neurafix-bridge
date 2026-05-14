#!/bin/sh
# Run as celery worker (default) or beat scheduler.
# Set CELERY_MODE=beat in the container to run the scheduler.
if [ "$CELERY_MODE" = "beat" ]; then
    echo "Starting Celery Beat scheduler..."
    exec celery -A worker.celery_app beat --loglevel=info
else
    echo "Starting Celery Worker..."
    exec celery -A worker.celery_app worker --loglevel=info --concurrency=2
fi
