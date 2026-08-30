#!/usr/bin/env python3
"""Loopback-only stock MeloTTS adapter; deliberately contains no voice cloning."""
import argparse, json, os, tempfile, time, traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
os.environ.setdefault('NLTK_DATA','/fast/models/openvoice-v2/nltk-data')
import torch
from melo.api import TTS
MODEL_ROOT=Path(os.getenv('MELO_MODEL_ROOT','/fast/models/openvoice-v2/melotts-english')); DEVICE=os.getenv('MELO_DEVICE','cuda')
if DEVICE=='cuda' and (not torch.cuda.is_available() or torch.cuda.mem_get_info()[0] < 2*1024**3): raise SystemExit('CUDA unavailable or less than 2GiB free; refusing to displace protected workloads')
tts=TTS(language='EN',device=DEVICE,config_path=str(MODEL_ROOT/'config.json'),ckpt_path=str(MODEL_ROOT/'checkpoint.pth')); voices={'EN-BR','EN-US','EN-AU','EN_INDIA','EN-Default'}
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path!='/health': self.send_error(404); return
  payload=json.dumps({'status':'ok','engine':'MeloTTS','device':DEVICE,'voices':sorted(voices)}).encode(); self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',len(payload));self.end_headers();self.wfile.write(payload)
 def do_POST(self):
  if self.path!='/synthesize': self.send_error(404); return
  try:
   size=int(self.headers.get('Content-Length','0')); data=json.loads(self.rfile.read(size)); text=str(data.get('text','')).strip(); voice=str(data.get('voice','EN-BR')); speed=max(.7,min(1.3,float(data.get('speed',1))))
   if not text or len(text)>4096 or voice not in voices: raise ValueError('invalid text or stock voice')
   with tempfile.NamedTemporaryFile(suffix='.wav') as out:
    started=time.perf_counter(); tts.tts_to_file(text,tts.hps.data.spk2id[voice],out.name,speed=speed,quiet=True); audio=Path(out.name).read_bytes()
   self.send_response(200);self.send_header('Content-Type','audio/wav');self.send_header('Content-Length',len(audio));self.send_header('X-Melo-Voice',voice);self.send_header('X-Melo-Latency-Ms',round((time.perf_counter()-started)*1000));self.end_headers();self.wfile.write(audio)
  except Exception as exc: traceback.print_exc(); self.send_error(500,str(exc))
parser=argparse.ArgumentParser();parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=18768);args=parser.parse_args();ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()
