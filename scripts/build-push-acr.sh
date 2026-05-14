#!/usr/bin/env bash
# Build all service images and push to Azure Container Registry.
#
# Usage:
#   ./scripts/build-push-acr.sh <ACR_NAME> [TAG]
#
# Example:
#   ./scripts/build-push-acr.sh hamroguruacr v1.0.0
#   ./scripts/build-push-acr.sh hamroguruacr latest
#
# Prerequisites:
#   az login
#   az acr login --name <ACR_NAME>

set -euo pipefail

ACR_NAME="${1:?Usage: $0 <ACR_NAME> [TAG]}"
TAG="${2:-latest}"
REGISTRY="${ACR_NAME}.azurecr.io"

echo "==> Registry : ${REGISTRY}"
echo "==> Tag      : ${TAG}"
echo ""

build_and_push() {
    local service="$1"
    local context="$2"
    local image="${REGISTRY}/hamroguru-${service}:${TAG}"
    echo "--- Building ${service} ---"
    docker build -t "${image}" "${context}"
    echo "--- Pushing  ${service} ---"
    docker push "${image}"
    echo "--- Done: ${image}"
    echo ""
}

build_and_push "frontend"     "./frontend"
build_and_push "main-backend" "./main_backend"
build_and_push "ai-service"   "./ai_service"
build_and_push "worker"       "./worker"

echo "All images pushed to ${REGISTRY}"
echo ""
echo "Image list:"
echo "  ${REGISTRY}/hamroguru-frontend:${TAG}"
echo "  ${REGISTRY}/hamroguru-main-backend:${TAG}"
echo "  ${REGISTRY}/hamroguru-ai-service:${TAG}"
echo "  ${REGISTRY}/hamroguru-worker:${TAG}   (set CELERY_MODE=beat for the scheduler)"
