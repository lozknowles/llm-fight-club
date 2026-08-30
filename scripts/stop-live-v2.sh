#!/usr/bin/env bash
set -euo pipefail
run=/fast/work/llm-fight-club-20260829/.run-v2
for name in app qwen25 qwen3; do file="$run/$name.pid"; if [[ -f "$file" ]]; then pid=$(<"$file"); if [[ "$pid" =~ ^[0-9]+$ ]]; then kill -TERM "$pid" 2>/dev/null || true; fi; fi; done
sleep 3
ss -ltnp | grep -E ':(18770|18780|18781)' || true
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader
