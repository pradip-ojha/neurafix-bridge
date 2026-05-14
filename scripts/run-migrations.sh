#!/usr/bin/env bash
# Run Alembic migrations for main_backend and ai_service.
# Run this once before starting containers in a new environment,
# or as an init container / release job in your Azure deployment.
#
# Requires DATABASE_URL to be set in the environment (or sourced from .env).

set -euo pipefail

if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo "==> Running main_backend migrations..."
cd main_backend
alembic upgrade head
cd ..

echo "==> Running ai_service migrations..."
cd ai_service
alembic upgrade head
cd ..

echo "All migrations complete."
