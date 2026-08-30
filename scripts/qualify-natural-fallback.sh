#!/usr/bin/env bash
set -euo pipefail
root=/fast/work/llm-fight-club-20260829
run="$root/.run-v2"
result_dir="$run/natural-fallback-qualification"
mkdir -p "$result_dir"

start_natural() {
  cd "$root"
  nohup "$root/.venv-natural-tts/bin/python" "$root/speech/natural_tts_service.py" >"$run/natural-tts.log" 2>&1 &
  echo $! >"$run/natural-tts.pid"
  for attempt in {1..60}; do
    curl -fsS --max-time 2 http://127.0.0.1:18773/health >/dev/null && return 0
    sleep 1
  done
  return 1
}

pid=$(<"$run/natural-tts.pid")
[[ "$pid" =~ ^[0-9]+$ ]] && kill -TERM "$pid"
for attempt in {1..20}; do
  ss -ltn | grep -q ':18773 ' || break
  sleep 1
done

trap start_natural EXIT
curl -fsS -D "$result_dir/headers.txt" -o "$result_dir/fallback.wav" \
  -H 'content-type: application/json' \
  --data '{"text":"This request deliberately proves the preserved fallback voice.","voice":"natural-interviewer","deliveryHints":["measured"]}' \
  http://100.125.120.114:18772/synthesize
grep -qi '^x-tts-provider: ffmpeg-flite' "$result_dir/headers.txt"
grep -qi '^x-tts-fallback: true' "$result_dir/headers.txt"
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels,duration -of json "$result_dir/fallback.wav" >"$result_dir/ffprobe.json"

start_natural
trap - EXIT
curl -fsS http://127.0.0.1:18773/health
