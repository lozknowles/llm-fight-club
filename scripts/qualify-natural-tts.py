#!/usr/bin/env python3
import hashlib
import json
import subprocess
import time
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path("/fast/work/llm-fight-club-20260829")
MODEL_PATH = Path("/fast/models/qwen3-tts-12hz-1.7b-voicedesign")
OUTPUT = ROOT / ".run-v2" / "natural-tts-qualification"
OUTPUT.mkdir(parents=True, exist_ok=True)
FLITE_URL = "http://100.125.120.114:18772/synthesize"

IDENTITIES = {
    "interviewer": (
        "An original British male radio interviewer in his late fifties. Educated southern English accent, "
        "warm low baritone, precise diction, restrained dry wit and calm professional authority. "
        "Natural close-microphone studio delivery. Do not imitate any real person."
    ),
    "guest": (
        "An original British male comic character in his early sixties. A noticeably different, lighter tenor voice, "
        "polished Midlands English accent, genial but pompously self-assured, with elastic conversational rhythm. "
        "Natural close-microphone studio delivery. Do not imitate any real person."
    ),
    "referee": (
        "An original British female programme host in her forties. Clear northern English accent, composed alto voice, "
        "brisk timing and amused authority. Natural close-microphone studio delivery. Do not imitate any real person."
    ),
}

AB_TRANSCRIPT = [
    {
        "speaker": "INTERVIEWER",
        "voice": "interviewer",
        "flite_voice": "awb",
        "text": "So you're saying the entire economic strategy depends upon nobody actually asking that question?",
        "delivery": "Measured, dry and conversational. Controlled incredulity; stress 'entire' and 'nobody actually asking'. End with a genuine rhetorical question.",
    },
    {
        "speaker": "GUEST",
        "voice": "guest",
        "flite_voice": "slt",
        "text": "No, no. That's a complete misunderstanding. It depends upon nobody asking several questions.",
        "delivery": "Self-assured correction with two quick opening interjections, then slow down pompously. Deadpan emphasis on 'several questions'.",
    },
]

LONG_TRANSCRIPT = [
    {
        "speaker": "INTERVIEWER", "voice": "interviewer",
        "text": "Professor Pump, your institute says the economy can be stabilised by replacing forecasts with what you call confident-looking diagrams. What makes a diagram confident?",
        "delivery": "Measured and professionally curious, with a faintly sceptical lift on 'confident-looking diagrams'.",
    },
    {
        "speaker": "GUEST", "voice": "guest",
        "text": "Primarily the arrows. A nervous diagram has arrows pointing everywhere. Ours point firmly towards Thursday, which is traditionally where growth keeps its appointments.",
        "delivery": "Warm, pompous certainty. Brief explanatory pause after 'arrows'. Treat the absurd conclusion as settled expertise.",
    },
    {
        "speaker": "INTERVIEWER", "voice": "interviewer",
        "text": "Thursday is a day, not an economic destination. And last month you told us growth had been moved to Tuesday for maintenance.",
        "delivery": "Dry correction, slightly quicker. Calmly expose the contradiction; do not become theatrical.",
    },
    {
        "speaker": "GUEST", "voice": "guest",
        "text": "Temporarily, yes. Tuesday proved structurally unable to support optimism. People kept arriving at Wednesday and noticing nothing had happened.",
        "delivery": "Mildly defensive at first, then recover into fluent bureaucratic confidence. A tiny pause before the final clause.",
    },
    {
        "speaker": "INTERVIEWER", "voice": "interviewer",
        "text": "So the policy failed because the public continued to experience the week in the conventional order?",
        "delivery": "Concise, deadpan incredulity. Slow slightly on 'conventional order'.",
    },
    {
        "speaker": "GUEST", "voice": "guest",
        "text": "Failed is an unnecessarily chronological word. The policy succeeded later than expected, in a period we have not yet selected.",
        "delivery": "Irritated by the word 'failed', then soothing and expansive. Land the final phrase with serene confidence.",
    },
    {
        "speaker": "INTERVIEWER", "voice": "interviewer",
        "text": "Isn't that simply a promise with no date, no evidence and no means of discovering whether it happened?",
        "delivery": "Firm investigative cadence, still controlled. Build emphasis across the three missing things.",
    },
    {
        "speaker": "GUEST", "voice": "guest",
        "text": "I prefer to call it a flexible historical achievement. A date would only encourage people to attend, and then we'd need chairs.",
        "delivery": "Pompous, relieved and conversational. Finish the chair remark as an obvious practical concern, with a restrained amused undertone.",
    },
]


def gpu_snapshot():
    output = subprocess.check_output([
        "nvidia-smi", "--query-gpu=memory.used,memory.free", "--format=csv,noheader,nounits"
    ], text=True).strip()
    used, free = output.split(",")
    return {"used_mib": int(used.strip()), "free_mib": int(free.strip())}


def pcm_hash(wave):
    return hashlib.sha256(np.asarray(wave, dtype=np.float32).tobytes()).hexdigest()


def concatenate(items, sample_rate, silence_seconds=0.28):
    silence = np.zeros(int(sample_rate * silence_seconds), dtype=np.float32)
    parts = []
    for index, item in enumerate(items):
        if index:
            parts.append(silence)
        parts.append(np.asarray(item, dtype=np.float32).reshape(-1))
    return np.concatenate(parts)


def flite_line(item, index):
    payload = json.dumps({"text": item["text"], "voice": item["flite_voice"]}).encode()
    request = urllib.request.Request(FLITE_URL, data=payload, headers={"content-type": "application/json"})
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read()
        provider_latency_ms = int(response.headers.get("x-tts-latency-ms", "0"))
    synthesis = time.perf_counter() - started
    path = OUTPUT / f"a-flite-{index + 1}-{item['voice']}.wav"
    path.write_bytes(raw)
    wave, sr = sf.read(path, dtype="float32")
    duration = len(wave) / sr
    return wave, sr, {
        "speaker": item["speaker"], "voice": item["flite_voice"], "text": item["text"],
        "file": str(path), "synthesis_seconds": round(synthesis, 3),
        "provider_latency_ms": provider_latency_ms, "audio_seconds": round(duration, 3),
        "real_time_factor": round(synthesis / duration, 3), "sha256_pcm": pcm_hash(wave),
    }


def qwen_line(model, item, index, prefix):
    seed = {"interviewer": 4711, "guest": 8128, "referee": 1946}[item["voice"]]
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    instruction = f"{IDENTITIES[item['voice']]} Delivery for this line: {item['delivery']}"
    started = time.perf_counter()
    wavs, sr = model.generate_voice_design(
        text=item["text"], language="English", instruct=instruction,
        do_sample=True, temperature=0.8, top_p=0.95,
    )
    torch.cuda.synchronize()
    synthesis = time.perf_counter() - started
    wave = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
    duration = len(wave) / sr
    path = OUTPUT / f"{prefix}-{index + 1}-{item['voice']}.wav"
    sf.write(path, wave, sr, subtype="PCM_16")
    return wave, sr, {
        "speaker": item["speaker"], "voice": f"qwen-british-{item['voice']}", "text": item["text"],
        "delivery": item["delivery"], "file": str(path),
        "synthesis_seconds": round(synthesis, 3), "audio_seconds": round(duration, 3),
        "real_time_factor": round(synthesis / duration, 3), "sha256_pcm": pcm_hash(wave),
    }


baseline = gpu_snapshot()
if baseline["free_mib"] < 7600:
    raise SystemExit(f"Resource guard: need 7600 MiB free, found {baseline['free_mib']}")

flite_audio = []
flite_metrics = []
flite_sr = None
for index, item in enumerate(AB_TRANSCRIPT):
    wave, sr, metrics = flite_line(item, index)
    if flite_sr is not None and flite_sr != sr:
        raise RuntimeError("Flite sample rates differ")
    flite_sr = sr
    flite_audio.append(wave)
    flite_metrics.append(metrics)
flite_combined = concatenate(flite_audio, flite_sr)
flite_path = OUTPUT / "A-existing-flite-identical-transcript.wav"
sf.write(flite_path, flite_combined, flite_sr, subtype="PCM_16")

torch.cuda.set_per_process_memory_fraction(0.45, 0)
torch.cuda.reset_peak_memory_stats()
load_started = time.perf_counter()
model = Qwen3TTSModel.from_pretrained(
    str(MODEL_PATH), device_map="cuda:0", dtype=torch.float16, attn_implementation="sdpa"
)
startup_seconds = time.perf_counter() - load_started
after_load = gpu_snapshot()

natural_audio = []
natural_metrics = []
natural_sr = None
for index, item in enumerate(AB_TRANSCRIPT):
    wave, sr, metrics = qwen_line(model, item, index, "b-natural")
    natural_sr = natural_sr or sr
    if natural_sr != sr:
        raise RuntimeError("Natural TTS sample rates differ")
    natural_audio.append(wave)
    natural_metrics.append(metrics)
natural_combined = concatenate(natural_audio, natural_sr)
natural_path = OUTPUT / "B-qwen3-natural-identical-transcript.wav"
sf.write(natural_path, natural_combined, natural_sr, subtype="PCM_16")

long_audio = []
long_metrics = []
for index, item in enumerate(LONG_TRANSCRIPT):
    wave, sr, metrics = qwen_line(model, item, index, "long")
    if sr != natural_sr:
        raise RuntimeError("Long interview sample rate differs")
    long_audio.append(wave)
    long_metrics.append(metrics)
long_combined = concatenate(long_audio, natural_sr, silence_seconds=0.32)
long_path = OUTPUT / "qwen3-natural-long-interview.wav"
sf.write(long_path, long_combined, natural_sr, subtype="PCM_16")

result = {
    "status": "PASS",
    "selected_model": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "model_path": str(MODEL_PATH),
    "runtime": {"dtype": "float16", "attention": "sdpa", "device": torch.cuda.get_device_name(0)},
    "baseline_gpu": baseline,
    "after_load_gpu": after_load,
    "process_peak_allocated_mib": round(torch.cuda.max_memory_allocated() / 1048576, 1),
    "process_peak_reserved_mib": round(torch.cuda.max_memory_reserved() / 1048576, 1),
    "startup_model_load_seconds": round(startup_seconds, 3),
    "a_existing": {
        "provider": "ffmpeg-flite", "file": str(flite_path),
        "audio_seconds": round(len(flite_combined) / flite_sr, 3), "turns": flite_metrics,
    },
    "b_natural": {
        "provider": "qwen3-tts-voicedesign", "file": str(natural_path),
        "audio_seconds": round(len(natural_combined) / natural_sr, 3), "turns": natural_metrics,
    },
    "long_interview": {
        "provider": "qwen3-tts-voicedesign", "file": str(long_path),
        "audio_seconds": round(len(long_combined) / natural_sr, 3), "turns": long_metrics,
    },
    "identities": IDENTITIES,
    "ab_transcript": AB_TRANSCRIPT,
    "long_transcript": LONG_TRANSCRIPT,
}
metrics_path = OUTPUT / "qualification.json"
metrics_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))
