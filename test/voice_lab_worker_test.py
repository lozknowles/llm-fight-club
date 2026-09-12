"""No model load. These regression checks are NOT physical qualification."""
import base64
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import wave
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'speech'))
from voice_lab_worker_extension import decode_reference, validate_prompt, extend_handler


class WorkerTests(unittest.TestCase):
    def test_reference_requires_pcm_and_duration(self):
        out = io.BytesIO()
        with wave.open(out, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(b'\x00\x01' * 72000)
        self.assertEqual(len(decode_reference(base64.b64encode(out.getvalue()))), 144000)
        with self.assertRaises(Exception):
            decode_reference(base64.b64encode(b'invalid'))

    def test_prompt_uses_safe_bounded_numeric_json(self):
        good = {'format': 'omnivoice-conditioning-v1', 'tokens': [[1, 2, 3]], 'text': 'A reference.', 'rms': .1}
        self.assertEqual(validate_prompt(json.dumps(good)), good)
        for changes in ({'tokens': [['execute']]}, {'rms': float('nan')}, {'tokens': [[1], [2, 3]]}, {'format': 'pickle'}, {'tokens': [[999999]]}):
            with self.assertRaises(ValueError):
                validate_prompt(json.dumps({**good, **changes}))

    def test_extension_requires_its_own_key(self):
        with self.assertRaises(ValueError):
            extend_handler(object, {}, '')

    def test_new_routes_require_separate_auth_and_legacy_routes_still_dispatch(self):
        class Legacy:
            def do_GET(self): self.legacy_called = True
            def do_POST(self): self.legacy_called = True
            def respond(self, status, value): self.response = (status, value)
        with patch('voice_lab_worker_extension.version', return_value='fixture-only'):
            handler = extend_handler(Legacy, {'voice': {'modelRevision': 'test-only'}}, 'z' * 40)
        request = handler()
        request.command = 'GET'; request.path = '/voice-lab/health'; request.headers = {'Authorization': 'Bearer old-worker-token'}
        request.do_GET(); self.assertEqual(request.response[0], 401)
        request.headers = {'Authorization': 'Bearer ' + 'z' * 40}
        request.do_GET(); self.assertEqual(request.response[0], 200)
        self.assertTrue(request.response[1]['shared_existing_model'])
        request.path = '/health'; request.do_GET(); self.assertTrue(request.legacy_called)


if __name__ == '__main__':
    unittest.main()
