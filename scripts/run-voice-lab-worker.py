#!/usr/bin/env python3
"""Opt-in launcher: reuse unchanged worker source and its ONE model instance.

Usage: existing-venv/python scripts/run-voice-lab-worker.py ABSOLUTE_WORKER.py
       --model EXISTING_MODEL --state EXISTING_STATE [existing worker arguments]
Not run by default. Requires approved replacement of that worker's startup command.
"""
import http.server
import os
from pathlib import Path
import runpy
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'speech'))
from voice_lab_worker_extension import extend_handler


def main():
    if len(sys.argv) < 2:
        raise SystemExit('An existing worker source path is required')
    worker = Path(sys.argv[1])
    if not worker.is_absolute() or not worker.is_file():
        raise SystemExit('Worker path must be an existing absolute file')
    key = os.environ.get('VOICE_LAB_WORKER_TOKEN', '')
    if len(key) < 32:
        raise SystemExit('Set a dedicated Voice Lab worker token before activation')
    original_server = http.server.HTTPServer

    class SharedWorkerServer(original_server):
        def __init__(self, address, handler, *args, **kwargs):
            if address[0] != '127.0.0.1':
                raise RuntimeError('The shared worker must remain loopback-only')
            namespace = handler.do_POST.__globals__
            for required in ('model', 'voice', 'np', 'torch', 'sf', 'synchronize'):
                if required not in namespace:
                    raise RuntimeError('Existing worker contract changed; activation refused')
            super().__init__(address, extend_handler(handler, namespace, key), *args, **kwargs)

    http.server.HTTPServer = SharedWorkerServer
    sys.argv = sys.argv[1:]
    try:
        runpy.run_path(str(worker), run_name='__main__')
    finally:
        http.server.HTTPServer = original_server


if __name__ == '__main__':
    main()
