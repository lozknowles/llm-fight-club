"""Optional isolated CSM adapter. Reuses installed FP16 artifacts; never downloads.

Stdout is JSON-lines protocol only. Model packages are not dependencies of Fight Club.
Generated synthetic anchors are private runtime assets, not recordings of people.
"""
import base64
import contextlib
import hashlib
import io
import json
import os
import pathlib
import queue
import subprocess
import sys
import threading
import time
import wave

protocol = sys.stdout
sys.stdout = sys.stderr
import numpy as np
import torch
from transformers import AutoProcessor, CsmForConditionalGeneration, StoppingCriteria, StoppingCriteriaList


def emit(value):
    protocol.write(json.dumps(value) + '\n')
    protocol.flush()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def gpu():
    values = subprocess.check_output(['nvidia-smi', '--query-gpu=memory.free,utilization.gpu', '--format=csv,noheader,nounits'], text=True).splitlines()[0].split(',')
    return int(values[0]), int(values[1])


# Fail closed, never stop or evict somebody else's model.
for _ in range(3):
    free, utilisation = gpu()
    if free < 6000 or utilisation > 10:
        raise RuntimeError('CSM admission denied: wait for stable free VRAM and idle GPU')
    time.sleep(1)

model_dir = pathlib.Path(os.environ['CSM_MODEL_DIR'])
anchor_dir = pathlib.Path(os.environ['CSM_ANCHOR_DIR'])
anchor_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
checkpoint = os.environ['CSM_CHECKPOINT_SHA256']
with open(model_dir / 'model.safetensors', 'rb') as source:
    if hashlib.file_digest(source, 'sha256').hexdigest() != checkpoint:
        raise RuntimeError('checkpoint_hash_mismatch')
loaded_at = time.perf_counter()
processor = AutoProcessor.from_pretrained(model_dir, local_files_only=True)
model = CsmForConditionalGeneration.from_pretrained(model_dir, torch_dtype=torch.float16, local_files_only=True).to('cuda').eval()
torch.cuda.synchronize()
load_ms = (time.perf_counter() - loaded_at) * 1000
sample_rate = int(getattr(processor, 'sampling_rate', 24000))
settings = {'temperature': 0.9, 'do_sample': True, 'seed': 520000, 'max_new_tokens': 2048, 'precision': 'float16'}


class Cancelled(StoppingCriteria):
    def __init__(self, event):
        self.event = event

    def __call__(self, *args, **kwargs):
        return self.event.is_set()


def generate(text, seed, anchor=None, event=None):
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    conversation = []
    if anchor:
        conversation.append({'role': '0', 'content': [{'type': 'text', 'text': anchor['text']}, {'type': 'audio', 'audio': anchor['pcm']}]})
    conversation.append({'role': '0', 'content': [{'type': 'text', 'text': text}]})
    inputs = processor.apply_chat_template(conversation, tokenize=True, return_dict=True).to('cuda')
    if 'input_values' in inputs:
        inputs['input_values'] = inputs['input_values'].to(dtype=torch.float16)
    with torch.inference_mode():
        audio = model.generate(**inputs, output_audio=True, do_sample=True, temperature=0.9, max_new_tokens=2048,
                               stopping_criteria=StoppingCriteriaList([Cancelled(event or threading.Event())]))
    torch.cuda.synchronize()
    if event and event.is_set():
        raise RuntimeError('speech_cancelled')
    samples = audio[0].detach().float().cpu().numpy().reshape(-1)
    if not np.isfinite(samples).all() or samples.size < sample_rate // 5:
        raise RuntimeError('invalid_waveform')
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
    return buffer.getvalue(), len(samples) / sample_rate


def read_anchor(data, text):
    with wave.open(io.BytesIO(data), 'rb') as handle:
        if (handle.getframerate(), handle.getnchannels(), handle.getsampwidth()) != (sample_rate, 1, 2):
            raise RuntimeError('anchor_format_mismatch')
        pcm = np.frombuffer(handle.readframes(handle.getnframes()), dtype='<i2').astype(np.float32) / 32767
    return {'text': text, 'pcm': pcm}


anchors = {}
voices = []
anchor_text = 'This is an original synthetic voice. Let us consider the evidence and hear a different point of view.'
for name, seed in [('fighter-a', 71001), ('fighter-b', 92003), ('mallow', 414011)]:
    wav_path = anchor_dir / (name + '.wav')
    meta_path = anchor_dir / (name + '.json')
    if wav_path.exists() and meta_path.exists():
        data = wav_path.read_bytes()
        meta = json.loads(meta_path.read_text())
        if meta['sha256'] != digest(data) or meta['checkpoint'] != checkpoint:
            raise RuntimeError('anchor_integrity_failed')
        text = meta['text']
    else:
        if name == 'mallow':
            data = pathlib.Path(os.environ['CSM_MALLOW_SEED_WAV']).read_bytes()
            if digest(data) != os.environ['CSM_MALLOW_SEED_SHA256']:
                raise RuntimeError('mallow_seed_hash_mismatch')
            text = "Hello, I'm Mallow, a locally generated voice."
        else:
            text = anchor_text
            data, _ = generate(text, seed)
        meta = {'sha256': digest(data), 'checkpoint': checkpoint, 'text': text, 'provenance': 'original-generated-synthetic', 'seed': seed}
        wav_path.write_bytes(data)
        meta_path.write_text(json.dumps(meta))
        wav_path.chmod(0o600)
        meta_path.chmod(0o600)
    anchors[name] = read_anchor(data, text)
    voices.append({'id': name, 'revision': digest(data), 'provenance': 'original-generated-synthetic'})

emit({'ready': True, 'capabilities': {'backend': 'csm-fp16', 'checkpoint': checkpoint, 'codecVersion': 'wav-pcm16-mono-24000-v1',
      'voices': voices, 'settings': settings, 'streaming': False, 'cancellation': 'cooperative-token-boundary; decode may finish before cancellation',
      'watermark': 'NOT_APPLIED', 'exportAllowed': False, 'modelLoadMs': load_ms}})

jobs = queue.Queue(maxsize=16)
events = {}


def reader():
    for line in sys.stdin:
        try:
            item = json.loads(line)
            if 'cancel' in item:
                event = events.get(item['cancel'])
                if event:
                    event.set()
            else:
                events[item['id']] = threading.Event()
                jobs.put(item)
        except Exception:
            emit({'error': 'invalid_worker_request'})
    jobs.put(None)


threading.Thread(target=reader, daemon=True).start()
while True:
    job = jobs.get()
    if job is None:
        break
    try:
        event = events[job['id']]
        if event.is_set():
            raise RuntimeError('speech_cancelled')
        if job['voice'] not in anchors or not isinstance(job['text'], str) or len(job['text']) > 1500:
            raise RuntimeError('invalid_worker_input')
        start = time.perf_counter()
        audio, duration = generate(job['text'], settings['seed'], anchors[job['voice']], event)
        emit({'id': job['id'], 'audio': base64.b64encode(audio).decode(), 'durationSeconds': duration, 'watermark': 'NOT_APPLIED',
              'metrics': {'modelLoadMs': load_ms, 'engineGenerationMs': (time.perf_counter() - start) * 1000,
                          'peakAllocatedBytes': torch.cuda.max_memory_allocated(), 'streaming': False}})
    except Exception as error:
        emit({'id': job['id'], 'error': 'speech_cancelled' if events.get(job['id'], threading.Event()).is_set() else 'speech_generation_failed'})
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
    finally:
        events.pop(job['id'], None)
