#!/usr/bin/env bash
set -euo pipefail

worker_environment="${OMNIVOICE_WORKER_ENVIRONMENT:?Set OMNIVOICE_WORKER_ENVIRONMENT to the existing worker environment file}"
set -a
# shellcheck disable=SC1090
source "$worker_environment"
set +a
export OMNIVOICE_UPSTREAM_URL="${OMNIVOICE_UPSTREAM_URL:-http://127.0.0.1:19194}"
export OMNIVOICE_UPSTREAM_TOKEN="${AGENT_CONTROL_SPEECH_TOKEN:?Existing worker token is unavailable}"
exec "${PYTHON:-/usr/bin/python3}" speech/omnivoice_service.py
