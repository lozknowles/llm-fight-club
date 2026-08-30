#!/usr/bin/env bash
set -euo pipefail
root=/fast/work/llm-fight-club-20260829
run="$root/.run-v2"
mkdir -p "$run"
for port in 18770 18780 18781; do if ss -ltn | grep -q ":$port "; then echo "port $port already in use" >&2; exit 1; fi; done
free_mib=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | tr -d ' ')
if (( free_mib < 9000 )); then echo "need at least 9000 MiB free VRAM; found $free_mib" >&2; exit 1; fi
nohup /fast/repos/llama.cpp/build-cuda/bin/llama-server -m /fast/models/gguf/qwen3/qwen3-8b-q4_k_m.gguf --host 127.0.0.1 --port 18780 -ngl 99 -c 4096 --parallel 1 >"$run/qwen3.log" 2>&1 & echo $! >"$run/qwen3.pid"
nohup /fast/repos/llama.cpp/build-cuda/bin/llama-server -m /fast/models/gguf/qwen2.5/qwen2.5-3b-instruct-q4_k_m.gguf --host 127.0.0.1 --port 18781 -ngl 99 -c 4096 --parallel 1 >"$run/qwen25.log" 2>&1 & echo $! >"$run/qwen25.pid"
for port in 18780 18781; do for attempt in {1..60}; do curl -fsS --max-time 2 "http://127.0.0.1:$port/health" >/dev/null && break; sleep 1; done; curl -fsS --max-time 2 "http://127.0.0.1:$port/health" >/dev/null; done
routes='{"qwen3-8b":"http://127.0.0.1:18780/v1","qwen2.5-3b":"http://127.0.0.1:18781/v1"}'
cd "$root"
nohup env HOST=127.0.0.1 PORT=18770 FIGHT_CLUB_MODEL_ROUTES="$routes" node server-show.mjs >"$run/app.log" 2>&1 & echo $! >"$run/app.pid"
for attempt in {1..20}; do curl -fsS --max-time 2 http://127.0.0.1:18770/api/health >/dev/null && break; sleep 1; done
curl -fsS http://127.0.0.1:18770/api/health
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader
