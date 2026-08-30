#!/usr/bin/env bash
set -euo pipefail
root=/fast/work/llm-fight-club-20260829
run="$root/.run-v2"
if ss -ltn | grep -q ':18772 '; then echo 'port 18772 already in use' >&2; exit 1; fi
cd "$root"
nohup env FLITE_HOST=100.125.120.114 FLITE_PORT=18772 FLITE_ALLOWED_ORIGIN=http://100.125.120.114:18770 node flite-service.mjs >"$run/flite.log" 2>&1 & echo $! >"$run/flite.pid"
sleep 2
curl -fsS http://100.125.120.114:18772/health
