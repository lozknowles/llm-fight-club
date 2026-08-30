# Changelog

## 2026-08-30 - Conversation audio archive

- Save every successfully synthesized turn as an individually downloadable WAV file.
- Assemble completed or deliberately stopped conversations into a normalized 128 kbps MP3 with 350 ms inter-speaker gaps.
- Add `conversation.mp3` and per-turn WAV download links alongside JSON and Markdown exports.
- Replace the fixed 4/8-turn selector with a user-defined 2–40 turn length.
- Restore saved conversation records at application startup so existing audio exports survive service restarts.
- Add regression coverage for audio archival, MP3 assembly and turn-limit bounds.

## 2026-08-30 - Speech stall recovery

- Show an explicit `VOICE STILL PREPARING` state when a natural speech request takes longer than three seconds.
- Bound provider first-byte and mid-stream waits so an upstream TTS connection cannot hang indefinitely.
- Surface recoverable voice errors while keeping `Skip speech` available to advance the conversation.
- Add regression coverage for stalled speech streams.

## 2026-08-30 - Browser preview PCM compatibility

- Wrap raw 24 kHz mono PCM responses in a WAV container before voice-preview playback.
- Preserve the existing low-latency Web Audio streaming path for live conversation turns.
- Add a regression test for the generated WAV header and PCM payload.

## Unreleased — LIVE TTS bake-off

- Added passionate, balanced and restrained delivery controls without changing participant voice identity.
- Added format-aware OpenAI performance direction so debates, interviews, panels and cross-examinations sound emotionally responsive rather than read aloud.
- Prepared the qualified streaming build for an unlisted LozKnowles.com route with backend-only credentials and local fallbacks.
- Added `LIVE_FAST`, `LIVE_QUALITY`, `STUDIO` and `OFFLINE` speech purpose profiles.
- Added backend-only OpenAI `gpt-4o-mini-tts` streaming PCM with distinct cedar, marin and coral identities.
- Added a fail-closed ElevenLabs Flash v2.5 streaming provider ready for configured voice IDs.
- Added chunk-preserving same-origin proxying and browser Web Audio PCM scheduling.
- Added first-byte, first-decodable, first-playable, stream-complete, fallback-attempt and inter-speaker-silence telemetry.
- Added bounded provider circuit breaking with explicit fallback evidence.
- Added causality-safe LLM turn prefetch during the preceding participant's playback.
- Added identical-script provider benchmark audio and browser acceptance evidence.
- Retained Qwen as STUDIO and Flite as offline/final fallback.
- Did not modify Agent Control.

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
