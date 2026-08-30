#!/usr/bin/env bash
set -euo pipefail
root=/fast/work/llm-fight-club-20260829
run="$root/.run-v2"
if [[ -f "$run/app.pid" ]]; then pid=$(<"$run/app.pid"); [[ "$pid" =~ ^[0-9]+$ ]] && kill -TERM "$pid" 2>/dev/null || true; fi
sleep 2
routes='{"qwen3-8b":"http://127.0.0.1:18780/v1","qwen2.5-3b":"http://127.0.0.1:18781/v1"}'
cd "$root"
nohup env HOST=100.125.120.114 PORT=18770 FIGHT_CLUB_MODEL_ROUTES="$routes" node server-show.mjs >"$run/app.log" 2>&1 & echo $! >"$run/app.pid"
sleep 2
curl -fsS http://100.125.120.114:18770/api/health
ss -ltnp | grep 18770
