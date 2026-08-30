# Changelog

## Unreleased — LIVE TTS bake-off

- Added `LIVE_FAST`, `LIVE_QUALITY`, `STUDIO` and `OFFLINE` speech purpose profiles.
- Added backend-only OpenAI `gpt-4o-mini-tts` streaming PCM with distinct cedar, marin and coral identities.
- Added a fail-closed ElevenLabs Flash v2.5 streaming provider ready for configured voice IDs.
- Added chunk-preserving same-origin proxying and browser Web Audio PCM scheduling.
- Added first-byte, first-decodable, first-playable, stream-complete, fallback-attempt and inter-speaker-silence telemetry.
- Added bounded provider circuit breaking with explicit fallback evidence.
- Added causality-safe LLM turn prefetch during the preceding participant's playback.
- Added identical-script provider benchmark audio and browser acceptance evidence.
- Retained Qwen as STUDIO and Flite as offline/final fallback.
- Did not deploy publicly or modify Agent Control.

## 0.2.0 — 2026-08-30

- Generalised the debate prototype into a spoken multi-agent conversation engine.
- Added interview, panel and cross-examination formats.
- Added first-class personality profiles, compact character state and dynamic interviewer analysis.
- Integrated two real local LLM routes with playback-gated alternating turns.
- Added Qwen3-TTS VoiceDesign as the natural speech provider with three original, distinguishable British character voices.
- Kept FFmpeg/Flite voices as an automatic provider-level fallback.
- Separated voice identity from personality-derived delivery hints.
- Added persistent transcripts, telemetry, exports and browser audio controls.
- Added same-origin speech proxying and prefix-safe browser URLs for an unlisted reverse-proxy deployment.
- Hardened playback completion with an `ended`-state watcher for throttled/background browser tabs.
- Added controlled A/B, long-interview, live-loop, fallback, acoustic and browser qualifications.
- Added an idle GPU unload guard and preserved protected hpubuntu workloads.

## 0.1.0 — 2026-08-29

- Initial standalone spoken-debate vertical slice.
- Explicit turn state machine, bounded context, referee and audience intervention.
- Provider-neutral model contract and basic synthetic TTS implementation.
- Browser-confirmed audio queue sequencing and persisted transcript/telemetry.
