#!/usr/bin/env bash
set -euo pipefail
root=/fast/work/llm-fight-club-20260829
run="$root/.run-v2"
mkdir -p "$run"

for file in natural-tts.pid speech-router.pid flite-fallback.pid; do
  if [[ -f "$run/$file" ]]; then
    pid=$(<"$run/$file")
    [[ "$pid" =~ ^[0-9]+$ ]] && kill -TERM "$pid" 2>/dev/null || true
  fi
done
sleep 1

if ss -ltn | grep -q ':18773 '; then
  echo 'port 18773 already in use' >&2
  exit 1
fi
if ss -ltn | grep -q ':18774 '; then
  echo 'port 18774 already in use' >&2
  exit 1
fi

cd "$root"
nohup env FLITE_HOST=127.0.0.1 FLITE_PORT=18774 FLITE_ALLOWED_ORIGIN=http://100.125.120.114:18770 \
  node flite-service.mjs >"$run/flite-fallback.log" 2>&1 &
echo $! >"$run/flite-fallback.pid"
for attempt in {1..20}; do
  curl -fsS --max-time 2 http://127.0.0.1:18774/health >/dev/null && break
  sleep 1
done
curl -fsS http://127.0.0.1:18774/health >/dev/null

nohup "$root/.venv-natural-tts/bin/python" "$root/speech/natural_tts_service.py" >"$run/natural-tts.log" 2>&1 &
echo $! >"$run/natural-tts.pid"
for attempt in {1..60}; do
  curl -fsS --max-time 2 http://127.0.0.1:18773/health >/dev/null && break
  sleep 1
done
curl -fsS http://127.0.0.1:18773/health >/dev/null

if [[ -f "$run/flite.pid" ]]; then
  pid=$(<"$run/flite.pid")
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -TERM "$pid" 2>/dev/null || true
fi
for attempt in {1..20}; do
  ss -ltn | grep -q ':18772 ' || break
  sleep 1
done

nohup env SPEECH_ROUTER_HOST=100.125.120.114 SPEECH_ROUTER_PORT=18772 \
  SPEECH_ALLOWED_ORIGIN=http://100.125.120.114:18770 \
  NATURAL_TTS_URL=http://127.0.0.1:18773 FLITE_TTS_URL=http://127.0.0.1:18774 \
  node speech/speech-router.mjs >"$run/speech-router.log" 2>&1 &
echo $! >"$run/speech-router.pid"
for attempt in {1..20}; do
  curl -fsS --max-time 2 http://100.125.120.114:18772/health >/dev/null && break
  sleep 1
done
curl -fsS http://100.125.120.114:18772/health
