# Server speech qualification

## Qualified vertical slice

The live private build uses this turn-based sequence:

1. `ConversationEngine` chooses a participant according to the selected format.
2. That participant's configured real model generates one spoken turn.
3. The browser requests a WAV from the isolated FFmpeg/Flite speech service using the participant's distinct assigned voice.
4. A persistent HTML audio element plays the WAV.
5. Its `ended` event records playback duration, speech provider, speech latency, and skip state in the transcript before requesting the next model turn.

This deliberately does not attempt full-duplex speech.

## 2026-08-29 evidence

`scripts/qualify-spoken-loop.mjs` completed a two-turn `INTERVIEW` using:

- Mara Vale: Qwen3 8B, voice `awb`.
- Cedric Pump: Qwen2.5 3B, voice `slt`.
- TTS: FFmpeg's local Flite filter, PCM signed 16-bit mono at 22,050 Hz.

The qualification asserts two model identities, two voice identities, valid WAV output, playback-duration calculation, completed state, and a durable transcript. The generated transcript records both LLM and TTS latency plus the actual `ffmpeg-flite` provider.

The audio-first UI is `http://100.125.120.114:18770/audio.html` on the private Tailscale network. Its automatic continuation is driven by the persistent audio element's `ended` callback.

## Boundary

The deterministic HTTP/model/TTS/transcript loop is qualified. The current Windows Codex browser-control runtime fails before launch with a DPAPI credential-decryption error, so automated browser autoplay observation is not claimed. The page is left live for direct human listening. This is a tooling limitation, not an app-server or TTS failure.

No voice is cloned or intended to imitate a real person. The Flite voices are fixed synthetic voices. The authoritative Agent Control checkout is not modified.
