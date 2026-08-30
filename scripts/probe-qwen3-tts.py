#!/usr/bin/env python3
import json
import os
import subprocess
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path("/fast/work/llm-fight-club-20260829")
MODEL = Path("/fast/models/qwen3-tts-12hz-1.7b-voicedesign")
OUTPUT = ROOT / ".run-v2" / "natural-tts-probe"
OUTPUT.mkdir(parents=True, exist_ok=True)

TEXT = "So you're saying the entire economic strategy depends upon nobody actually asking that question?"
INSTRUCTION = (
    "An original British male radio interviewer in his late fifties. Educated southern English accent, "
    "warm low baritone, precise diction and restrained dry wit. Deliver this line slowly and conversationally, "
    "with controlled incredulity and emphasis on 'entire' and 'nobody actually asking'. Natural pauses; never theatrical. "
    "Do not imitate any real person."
)


def gpu_snapshot():
    command = [
        "nvidia-smi",
        "--query-gpu=memory.used,memory.free",
        "--format=csv,noheader,nounits",
    ]
    used, free = subprocess.check_output(command, text=True).strip().split(",")
    return {"used_mib": int(used.strip()), "free_mib": int(free.strip())}


baseline = gpu_snapshot()
if baseline["free_mib"] < 7600:
    raise SystemExit(f"Resource guard: need 7600 MiB free, found {baseline['free_mib']}")

torch.cuda.set_per_process_memory_fraction(0.45, 0)
torch.manual_seed(4711)
torch.cuda.manual_seed_all(4711)
torch.cuda.reset_peak_memory_stats()

load_started = time.perf_counter()
model = Qwen3TTSModel.from_pretrained(
    str(MODEL),
    device_map="cuda:0",
    dtype=torch.float16,
    attn_implementation="sdpa",
)
load_seconds = time.perf_counter() - load_started
after_load = gpu_snapshot()

generate_started = time.perf_counter()
wavs, sample_rate = model.generate_voice_design(
    text=TEXT,
    language="English",
    instruct=INSTRUCTION,
    do_sample=True,
    temperature=0.8,
    top_p=0.95,
)
torch.cuda.synchronize()
synthesis_seconds = time.perf_counter() - generate_started

wave = np.asarray(wavs[0], dtype=np.float32)
audio_seconds = len(wave) / sample_rate
output_path = OUTPUT / "interviewer-smoke.wav"
sf.write(output_path, wave, sample_rate, subtype="PCM_16")

metrics = {
    "status": "PASS",
    "model": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "model_path": str(MODEL),
    "dtype": "float16",
    "attention": "sdpa",
    "gpu": torch.cuda.get_device_name(0),
    "compute_capability": list(torch.cuda.get_device_capability(0)),
    "baseline_gpu": baseline,
    "after_load_gpu": after_load,
    "process_peak_allocated_mib": round(torch.cuda.max_memory_allocated() / 1048576, 1),
    "process_peak_reserved_mib": round(torch.cuda.max_memory_reserved() / 1048576, 1),
    "startup_model_load_seconds": round(load_seconds, 3),
    "synthesis_seconds": round(synthesis_seconds, 3),
    "audio_seconds": round(audio_seconds, 3),
    "real_time_factor": round(synthesis_seconds / audio_seconds, 3),
    "sample_rate": sample_rate,
    "text": TEXT,
    "instruction": INSTRUCTION,
    "output": str(output_path),
}
(OUTPUT / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
print(json.dumps(metrics, indent=2))
