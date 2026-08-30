#!/usr/bin/env python3
import io
import gc
import json
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HOST = '127.0.0.1'
PORT = 18773
IDLE_SECONDS = int(os.environ.get('NATURAL_TTS_IDLE_SECONDS', '300'))
MODEL_PATH = '/fast/models/qwen3-tts-12hz-1.7b-voicedesign'
MODEL_ID = 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign'
VOICES = ['natural-interviewer', 'natural-guest', 'natural-referee']
IDENTITIES = {
    'natural-interviewer': (
        'An original British male radio interviewer in his late fifties. Educated southern English accent, '
        'warm low baritone, precise diction, restrained dry wit and calm professional authority. '
        'Natural close-microphone studio delivery. Do not imitate any real person.'
    ),
    'natural-guest': (
        'An original British male comic character in his early sixties. A noticeably different, lighter tenor voice, '
        'polished Midlands English accent, genial but pompously self-assured, with elastic conversational rhythm. '
        'Natural close-microphone studio delivery. Do not imitate any real person.'
    ),
    'natural-referee': (
        'An original British female programme host in her forties. Clear northern English accent, composed alto voice, '
        'brisk timing and amused authority. Natural close-microphone studio delivery. Do not imitate any real person.'
    ),
}
DEFAULT_DELIVERY = {
    'natural-interviewer': 'Measured, dry, conversational and professionally curious.',
    'natural-guest': 'Pompously self-assured, conversational and lightly defensive when challenged.',
    'natural-referee': 'Authoritative, concise and amused without sounding theatrical.',
}
SEEDS = {'natural-interviewer': 4711, 'natural-guest': 8128, 'natural-referee': 1946}


def gpu_snapshot():
    output = subprocess.check_output([
        'nvidia-smi', '--query-gpu=memory.used,memory.free', '--format=csv,noheader,nounits'
    ], text=True).strip()
    used, free = output.split(',')
    return {'used_mib': int(used.strip()), 'free_mib': int(free.strip())}


baseline = gpu_snapshot()
if baseline['free_mib'] < 7600:
    raise SystemExit(f"Resource guard: need 7600 MiB free, found {baseline['free_mib']}")
torch.cuda.set_per_process_memory_fraction(0.45, 0)
torch.cuda.reset_peak_memory_stats()
MODEL_LOCK = threading.Lock()
model = None
LOAD_MS = None
LAST_USED = time.monotonic()


def ensure_model():
    global model, LOAD_MS, LAST_USED
    if model is None:
        capacity = gpu_snapshot()
        if capacity['free_mib'] < 7600:
            raise RuntimeError(f"Resource guard: need 7600 MiB free, found {capacity['free_mib']}")
        load_started = time.perf_counter()
        model = Qwen3TTSModel.from_pretrained(
            MODEL_PATH, device_map='cuda:0', dtype=torch.float16, attn_implementation='sdpa'
        )
        LOAD_MS = round((time.perf_counter() - load_started) * 1000)
    LAST_USED = time.monotonic()
    return model


def idle_reaper():
    global model
    while True:
        time.sleep(min(30, max(2, IDLE_SECONDS // 4)))
        with MODEL_LOCK:
            if model is not None and time.monotonic() - LAST_USED >= IDLE_SECONDS:
                print(f'natural-tts unloading model after {IDLE_SECONDS}s idle', flush=True)
                model = None
                gc.collect()
                torch.cuda.empty_cache()


class Handler(BaseHTTPRequestHandler):
    server_version = 'NaturalSpeech/0.1'

    def log_message(self, pattern, *args):
        print(f"natural-tts {self.address_string()} {pattern % args}", flush=True)

    def send_json(self, status, value):
        raw = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == '/health':
            return self.send_json(200, {
                'status': 'ok', 'engine': 'qwen3-tts-voicedesign', 'model': MODEL_ID,
                'dtype': 'float16', 'attention': 'sdpa', 'voices': VOICES,
                'loaded': model is not None, 'load_ms': LOAD_MS, 'idle_unload_seconds': IDLE_SECONDS,
                'gpu': gpu_snapshot(),
                'process_peak_reserved_mib': round(torch.cuda.max_memory_reserved() / 1048576, 1),
            })
        if self.path == '/voices':
            return self.send_json(200, {'voices': VOICES})
        return self.send_json(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path != '/synthesize':
            return self.send_json(404, {'error': 'Not found'})
        try:
            length = int(self.headers.get('content-length', '0'))
            if length < 1 or length > 20000:
                raise ValueError('Invalid request size')
            payload = json.loads(self.rfile.read(length))
            text = str(payload.get('text', '')).strip()
            voice = str(payload.get('voice', ''))
            hints = payload.get('deliveryHints') or payload.get('delivery_hints') or []
            speech_rate = max(0.7, min(1.4, float(payload.get('speechRate', 1) or 1)))
            if not text or len(text) > 4000:
                raise ValueError('Text must be 1-4000 characters')
            if voice not in VOICES:
                raise ValueError('Unknown voice')
            if isinstance(hints, str):
                hints = [hints]
            hints = [str(value).strip() for value in hints if str(value).strip()][:8]
            delivery = ', '.join(hints) if hints else DEFAULT_DELIVERY[voice]
            instruction = f"{IDENTITIES[voice]} Delivery for this line: {delivery}. Speak at approximately {speech_rate:.2f} times natural conversational speed while preserving natural pitch and phrasing."
            with MODEL_LOCK:
                active_model = ensure_model()
                torch.manual_seed(SEEDS[voice])
                torch.cuda.manual_seed_all(SEEDS[voice])
                started = time.perf_counter()
                wavs, sample_rate = active_model.generate_voice_design(
                    text=text, language='English', instruct=instruction,
                    do_sample=True, temperature=0.8, top_p=0.95,
                )
                torch.cuda.synchronize()
                latency_ms = round((time.perf_counter() - started) * 1000)
            wave = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
            duration_ms = round(len(wave) / sample_rate * 1000)
            buffer = io.BytesIO()
            sf.write(buffer, wave, sample_rate, format='WAV', subtype='PCM_16')
            raw = buffer.getvalue()
            self.send_response(200)
            self.send_header('content-type', 'audio/wav')
            self.send_header('content-length', str(len(raw)))
            self.send_header('x-tts-provider', 'qwen3-tts-voicedesign')
            self.send_header('x-tts-model', MODEL_ID)
            self.send_header('x-tts-voice', voice)
            self.send_header('x-tts-latency-ms', str(latency_ms))
            self.send_header('x-tts-audio-duration-ms', str(duration_ms))
            self.send_header('x-tts-rtf', f'{latency_ms / duration_ms:.3f}')
            self.send_header('x-tts-vram-mib', f'{torch.cuda.max_memory_reserved() / 1048576:.1f}')
            self.end_headers()
            self.wfile.write(raw)
        except Exception as error:
            print(f'natural-tts error: {error}', flush=True)
            self.send_json(400, {'error': str(error)})


with MODEL_LOCK:
    ensure_model()
threading.Thread(target=idle_reaper, daemon=True).start()
print(json.dumps({
    'status': 'ready', 'model': MODEL_ID, 'load_ms': LOAD_MS, 'baseline_gpu': baseline,
    'loaded_gpu': gpu_snapshot(), 'voices': VOICES, 'idle_unload_seconds': IDLE_SECONDS,
}), flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
