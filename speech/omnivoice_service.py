#!/usr/bin/env python3
"""Persistent loopback-only OmniVoice synthesis service.

The model is loaded once. Voice identity is supplied by an allow-listed designed
VoiceProfile from the Node speech router; arbitrary reference audio is rejected.
"""
from __future__ import annotations

import io
import json
import os
import random
import threading
import time
import wave
import base64
import subprocess
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.getenv("OMNIVOICE_HOST", "127.0.0.1")
PORT = int(os.getenv("OMNIVOICE_PORT", "18776"))
MODEL_ID = os.getenv("OMNIVOICE_MODEL", "k2-fsa/OmniVoice")
DEVICE = os.getenv("OMNIVOICE_DEVICE", "cuda:0")
MAX_TEXT = int(os.getenv("OMNIVOICE_MAX_TEXT", "4000"))
UPSTREAM_URL = os.getenv("OMNIVOICE_UPSTREAM_URL", "").rstrip("/")
UPSTREAM_TOKEN = os.getenv("OMNIVOICE_UPSTREAM_TOKEN", "")
ALLOWED_IDS = {"omnivoice-moderator", "omnivoice-challenger", "omnivoice-analyst"}

_lock = threading.Lock()
_model = None
_torch = None
_np = None
_loaded_ms = None
_upstream_voice = None


def _load():
    global _model, _torch, _np, _loaded_ms
    if _model is not None:
        return
    began = time.perf_counter()
    import numpy as np
    import torch
    from omnivoice import OmniVoice
    _torch, _np = torch, np
    _model = OmniVoice.from_pretrained(MODEL_ID, device_map=DEVICE, dtype=torch.float16)
    _loaded_ms = round((time.perf_counter() - began) * 1000)


def _audio_array(result):
    value = result[0] if isinstance(result, (list, tuple)) else result
    if hasattr(value, "detach"):
        value = value.detach().float().cpu().numpy()
    value = _np.asarray(value, dtype=_np.float32).squeeze()
    if value.ndim != 1 or value.size == 0:
        raise RuntimeError("OmniVoice returned invalid audio")
    return _np.clip(value, -1.0, 1.0)


def _wav(audio, sample_rate=24000):
    pcm = (audio * 32767.0).astype("<i2").tobytes()
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        target.writeframes(pcm)
    return output.getvalue(), len(audio) / sample_rate


def _upstream(path, payload=None):
    headers = {"authorization": f"Bearer {UPSTREAM_TOKEN}"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["content-type"] = "application/json"
    request = urllib.request.Request(f"{UPSTREAM_URL}{path}", data=data, headers=headers, method="POST" if data else "GET")
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read())


def _proxy_synthesize(text, profile_id, speed):
    global _upstream_voice
    if not UPSTREAM_TOKEN:
        raise RuntimeError("OMNIVOICE_UPSTREAM_TOKEN is required in proxy mode")
    if _upstream_voice is None:
        _upstream_voice = _upstream("/health")["voice"]
    began = time.perf_counter()
    result = _upstream("/synthesize", {"text": text, "voice": _upstream_voice, "format": "wav"})
    source = base64.b64decode(result["audio"], validate=True)
    # The existing worker owns one original designed performer. Fixed, documented
    # pitch transforms create three stable and audibly distinct show identities.
    factor = {"omnivoice-moderator": 0.92, "omnivoice-challenger": 1.12, "omnivoice-analyst": 0.82}[profile_id]
    tempo = max(0.5, min(2.0, speed / factor))
    audio = subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-f", "wav", "-i", "pipe:0",
        "-af", f"asetrate=24000*{factor},aresample=24000,atempo={tempo}",
        "-ac", "1", "-ar", "24000", "-f", "wav", "pipe:1",
    ], input=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=60).stdout
    elapsed = round((time.perf_counter() - began) * 1000)
    with wave.open(io.BytesIO(audio), "rb") as value:
        duration_ms = round(value.getnframes() / value.getframerate() * 1000)
    upstream_metrics = result.get("metrics") or {}
    return audio, {
        "x-tts-model": str(upstream_metrics.get("model", MODEL_ID)),
        "x-tts-load-ms": "0",
        "x-tts-generation-ms": str(round(upstream_metrics.get("elapsedMs", elapsed))),
        "x-tts-audio-duration-ms": str(duration_ms),
        "x-tts-rtf": f"{float(upstream_metrics.get('elapsedMs', elapsed)) / max(1, duration_ms):.4f}",
        "x-tts-peak-vram-mb": str(round(float(upstream_metrics.get("peakAllocatedBytes") or 0) / 1048576)),
        "x-tts-upstream": "existing-worker",
    }


def synthesize(payload):
    text = str(payload.get("text", "")).strip()
    profile = payload.get("voiceProfile") or {}
    profile_id = str(profile.get("id", ""))
    voice_data = profile.get("providerVoiceData") or {}
    settings = profile.get("generationSettings") or {}
    if not text or len(text) > MAX_TEXT:
        raise ValueError(f"Text must be 1-{MAX_TEXT} characters")
    if profile_id not in ALLOWED_IDS or voice_data.get("mode") != "design":
        raise ValueError("Only built-in original designed voice profiles are accepted")
    instruct = str(voice_data.get("instruct", "")).strip()
    if not instruct or len(instruct) > 500:
        raise ValueError("Invalid voice design instruction")
    seed = max(0, int(settings.get("seed", 0)))
    steps = max(8, min(64, int(settings.get("numStep", 32))))
    speed = max(0.7, min(1.4, float(payload.get("speechRate", 1.0))))
    if UPSTREAM_URL:
        return _proxy_synthesize(text, profile_id, speed)
    with _lock:
        _load()
        random.seed(seed)
        _np.random.seed(seed % (2**32 - 1))
        _torch.manual_seed(seed)
        if _torch.cuda.is_available():
            _torch.cuda.manual_seed_all(seed)
            _torch.cuda.reset_peak_memory_stats()
            _torch.cuda.empty_cache()
        began = time.perf_counter()
        with _torch.inference_mode():
            result = _model.generate(text=text, language="English", instruct=instruct, speed=speed, num_step=steps)
        generated_ms = round((time.perf_counter() - began) * 1000)
        sample_rate = int(getattr(_model, "sampling_rate", 24000))
        wav, duration = _wav(_audio_array(result), sample_rate)
        peak_vram = round(_torch.cuda.max_memory_allocated() / 1048576) if _torch.cuda.is_available() else 0
        if _torch.cuda.is_available():
            _torch.cuda.empty_cache()
    return wav, {
        "x-tts-model": MODEL_ID,
        "x-tts-load-ms": str(_loaded_ms or 0),
        "x-tts-generation-ms": str(generated_ms),
        "x-tts-audio-duration-ms": str(round(duration * 1000)),
        "x-tts-rtf": f"{generated_ms / max(1, duration * 1000):.4f}",
        "x-tts-peak-vram-mb": str(peak_vram),
    }


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            return self._json(404, {"error": "Not found"})
        try:
            if UPSTREAM_URL:
                state = _upstream("/health")
                return self._json(200, {"status": "ok", "available": True, "engine": "omnivoice-existing-worker-proxy", "upstream": state.get("state"), "voices": sorted(ALLOWED_IDS)})
            _load()
            self._json(200, {"status": "ok", "available": True, "engine": "omnivoice", "model": MODEL_ID, "device": DEVICE, "load_ms": _loaded_ms, "voices": sorted(ALLOWED_IDS)})
        except Exception as error:
            self._json(503, {"status": "error", "available": False, "error": str(error)})

    def do_POST(self):
        if self.path != "/synthesize":
            return self._json(404, {"error": "Not found"})
        try:
            size = int(self.headers.get("content-length", "0"))
            if size <= 0 or size > 20000:
                raise ValueError("Invalid request size")
            payload = json.loads(self.rfile.read(size))
            audio, metrics = synthesize(payload)
            self.send_response(200)
            self.send_header("content-type", "audio/wav")
            self.send_header("content-length", str(len(audio)))
            for key, value in metrics.items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(audio)
        except Exception as error:
            self._json(400 if isinstance(error, (ValueError, TypeError)) else 503, {"error": str(error)})

    def log_message(self, pattern, *args):
        print(f"omnivoice {self.address_string()} {pattern % args}", flush=True)


if __name__ == "__main__":
    print(f"OmniVoice service listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
