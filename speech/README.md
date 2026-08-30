# Provider-neutral speech layer

The conversation engine does not know how speech is synthesized. It records a participant's voice identity and compact delivery hints. The browser sends those values to the speech router after the LLM turn is generated.

```text
ConversationEngine
  -> persistent browser audio element
     -> SpeechRouter
        -> NaturalTTSProvider (Qwen3-TTS VoiceDesign)
        -> ExistingTTSProvider (FFmpeg/Flite fallback)
```

`speech/providers/speech-provider.mjs` defines the provider boundary. The HTTP implementation can later point at a cloud, streaming or real-time backend without changing conversation turn policy.

## Voice identity and delivery

Natural voice identities are fixed application identifiers:

- `natural-interviewer`: original measured British male radio interviewer.
- `natural-guest`: original lighter British male comic character.
- `natural-referee`: original British female host/referee.

None is intended to imitate a real person. Delivery hints are sent separately and appended to the identity instruction only for the current line.

The fallback catalog (`awb`, `kal`, `kal16`, `rms`, `slt`) remains available. If the natural backend fails, the router maps natural interviewer/guest/referee to `awb`/`slt`/`rms`, returns a valid WAV and marks `x-tts-fallback: true`.

## Runtime

- Public-to-Tailscale router: `100.125.120.114:18772`.
- Natural backend: loopback `127.0.0.1:18773`.
- Existing Flite backend: loopback `127.0.0.1:18774`.
- Natural model: `/fast/models/qwen3-tts-12hz-1.7b-voicedesign`.

Start with `scripts/start-natural-speech.sh`. Restore the previous Flite-only listener with `scripts/restore-flite-fallback.sh`.

The Qwen backend uses FP16 and PyTorch SDPA because the Quadro P5000 does not support BF16 or FlashAttention 2. A resource guard refuses model loading below 7,600 MiB free GPU memory, and the process is capped to 45% of total GPU memory. After five idle minutes the backend unloads the model and releases its CUDA cache; the next natural-voice request reloads it behind the same provider API. Flite remains immediately available while Qwen is unloaded or unable to reload.
