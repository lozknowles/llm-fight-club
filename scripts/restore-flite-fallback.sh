#!/usr/bin/env bash
set -euo pipefail
root=/fast/work/llm-fight-club-20260829
run="$root/.run-v2"
for file in speech-router.pid natural-tts.pid flite-fallback.pid; do
  if [[ -f "$run/$file" ]]; then
    pid=$(<"$run/$file")
    [[ "$pid" =~ ^[0-9]+$ ]] && kill -TERM "$pid" 2>/dev/null || true
  fi
done
sleep 2
cd "$root"
nohup env FLITE_HOST=100.125.120.114 FLITE_PORT=18772 FLITE_ALLOWED_ORIGIN=http://100.125.120.114:18770 \
  node flite-service.mjs >"$run/flite.log" 2>&1 &
echo $! >"$run/flite.pid"
for attempt in {1..20}; do
  curl -fsS --max-time 2 http://100.125.120.114:18772/health >/dev/null && break
  sleep 1
done
curl -fsS http://100.125.120.114:18772/health
