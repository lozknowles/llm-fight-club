"""Optional routes on the EXISTING serialized OmniVoice worker/model.

No second model load, arbitrary paths, pickle uploads, ASR downloads or training.
Enable only at an approved worker activation. This module has no startup effects.
"""
import base64
import hashlib
import io
import json
import math
import time
import wave
from importlib.metadata import version
from hmac import compare_digest

MAX_BYTES = 2_100_000


def decode_reference(encoded):
    data = base64.b64decode(encoded, validate=True)
    if len(data) > 720044:
        raise ValueError('reference_too_large')
    with wave.open(io.BytesIO(data), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 24000, 'NONE'):
            raise ValueError('canonical_pcm_required')
        frames = wav.getnframes()
        if not 72000 <= frames <= 360000:
            raise ValueError('reference_duration')
        pcm = wav.readframes(frames)
        if len(pcm) != frames * 2:
            raise ValueError('truncated_reference')
    return pcm


def encode_prompt(prompt):
    # Portable supported VoiceClonePrompt fields, safe JSON instead of pickle.
    return json.dumps({'format': 'omnivoice-conditioning-v1',
                       'tokens': prompt.ref_audio_tokens.detach().cpu().tolist(),
                       'text': prompt.ref_text, 'rms': float(prompt.ref_rms)},
                      separators=(',', ':')).encode()


def validate_prompt(data):
    p = json.loads(data)
    if p.get('format') != 'omnivoice-conditioning-v1':
        raise ValueError('representation_version')
    if not isinstance(p.get('text'), str) or not 1 <= len(p['text']) <= 600:
        raise ValueError('reference_text')
    if not isinstance(p.get('rms'), (int, float)) or not math.isfinite(p['rms']) or not 0 < p['rms'] <= 1:
        raise ValueError('reference_rms')
    tokens = p.get('tokens')
    if not isinstance(tokens, list) or not 1 <= len(tokens) <= 64:
        raise ValueError('token_channels')
    length = len(tokens[0]) if isinstance(tokens[0], list) else 0
    if not 1 <= length <= 4000:
        raise ValueError('token_duration')
    if any(not isinstance(row, list) or len(row) != length or
           any(type(v) is not int or not 0 <= v < 65536 for v in row) for row in tokens):
        raise ValueError('token_values')
    return p


class VoiceLabRuntime:
    def __init__(self, namespace):
        self.ns = namespace
        self.version = 'omnivoice-' + version('omnivoice') + '/' + namespace['voice']['modelRevision'] + '/conditioning-v1'

    def create(self, payload):
        np, torch, model = self.ns['np'], self.ns['torch'], self.ns['model']
        text = payload.get('text')
        if not isinstance(text, str) or not 1 <= len(text) <= 600:
            raise ValueError('reference_text')
        pcm = decode_reference(payload.get('audio', ''))
        audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
        if np.sqrt(np.mean(audio * audio)) < .015 or np.mean(np.abs(audio) >= .995) > .001:
            raise ValueError('reference_quality')
        with torch.inference_mode():
            prompt = model.create_voice_clone_prompt(ref_audio=(audio, 24000), ref_text=text)
        representation = encode_prompt(prompt)
        validate_prompt(representation)
        return {'representation': base64.b64encode(representation).decode(), 'version': self.version,
                'method': 'Zero-shot reference-audio token conditioning; one deterministic reference clip; no weight updates'}

    def synthesize(self, payload):
        from omnivoice import VoiceClonePrompt
        torch, np, model = self.ns['torch'], self.ns['np'], self.ns['model']
        if payload.get('version') != self.version:
            raise ValueError('provider_version_changed')
        text = payload.get('text')
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 1200:
            raise ValueError('invalid_text')
        p = validate_prompt(base64.b64decode(payload.get('representation', ''), validate=True))
        prompt = VoiceClonePrompt(ref_audio_tokens=torch.tensor(p['tokens'], dtype=torch.long), ref_text=p['text'], ref_rms=p['rms'])
        began = time.perf_counter()
        torch.manual_seed(3901)
        self.ns['synchronize']()
        with torch.inference_mode():
            audio = model.generate(text=text, voice_clone_prompt=prompt, num_step=16)[0]
        self.ns['synchronize']()
        elapsed = (time.perf_counter() - began) * 1000
        if not np.isfinite(audio).all() or not 2400 <= len(audio) <= 24000 * 90:
            raise ValueError('invalid_audio')
        buf = io.BytesIO()
        self.ns['sf'].write(buf, audio, 24000, format='WAV', subtype='PCM_16')
        seconds = len(audio) / 24000
        return {'audio': base64.b64encode(buf.getvalue()).decode(), 'version': self.version,
                'metrics': {'generation_ms': elapsed, 'duration_s': seconds, 'rtf': elapsed / 1000 / seconds,
                            'streaming': False, 'method': 'cached reference conditioning',
                            'existing_worker_model_load_ms': self.ns.get('startup_ms'),
                            'process_rss_bytes': self.ns['psutil'].Process().memory_info().rss,
                            'cuda_allocated_bytes_after': torch.cuda.memory_allocated() if self.ns['args'].device.startswith('cuda') else None,
                            'cuda_process_peak_bytes_since_worker_start': torch.cuda.max_memory_allocated() if self.ns['args'].device.startswith('cuda') else None,
                            'representation_sha256': hashlib.sha256(json.dumps(p, sort_keys=True).encode()).hexdigest()}}


def extend_handler(base_handler, namespace, key):
    if len(key) < 32:
        raise ValueError('Dedicated Voice Lab worker token required')
    runtime = VoiceLabRuntime(namespace)

    class VoiceLabHandler(base_handler):
        def voice_lab(self):
            if not self.path.startswith('/voice-lab/'):
                return False
            if not compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + key):
                self.respond(401, {'error': 'unauthorized'})
                return True
            try:
                if self.command == 'GET' and self.path == '/voice-lab/health':
                    result = {'available': True, 'version': runtime.version, 'capability': 'reference-conditioning', 'shared_existing_model': True}
                elif self.command == 'POST' and self.path in ('/voice-lab/create', '/voice-lab/synthesize'):
                    size = int(self.headers.get('Content-Length', '0'))
                    if not 0 < size <= MAX_BYTES:
                        raise ValueError('request_size')
                    payload = json.loads(self.rfile.read(size))
                    result = runtime.create(payload) if self.path.endswith('/create') else runtime.synthesize(payload)
                else:
                    self.respond(404, {'error': 'not_found'})
                    return True
                self.respond(200, result)
            except Exception:
                # No transcripts, reference material, paths or tokens in logs.
                self.respond(422, {'error': 'voice_lab_request_failed'})
            return True

        def do_GET(self):
            if not self.voice_lab():
                super().do_GET()

        def do_POST(self):
            if not self.voice_lab():
                super().do_POST()

    return VoiceLabHandler
