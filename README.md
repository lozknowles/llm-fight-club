# LLM Fight Club / Spoken AI Studio

A general turn-based spoken multi-agent conversation engine. Debate was the first format; v0.2 also supports interview, panel and cross-examination formats with reusable personality profiles, compact character state, dynamic interviewer follow-ups, durable transcripts and browser-controlled audio sequencing.

The intended experience is asynchronous generation followed by real-time listening: the user starts a programme, waits while each line is generated and synthesized, then hears it play at natural speed. Playback completion—not a timer—authorizes the next LLM turn.

## Current stack

- Two local OpenAI-compatible LLM endpoints.
- `ConversationEngine` plus format-specific turn policies.
- Provider-neutral `SpeechProvider` boundary.
- OpenAI `gpt-4o-mini-tts` streaming PCM for the live natural voice identities.
- Qwen3-TTS 12Hz 1.7B VoiceDesign for natural voices and per-line delivery hints.
- FFmpeg/Flite `awb`, `slt` and `rms` voices as an automatic fallback.
- Persistent JSON/Markdown transcripts, per-turn WAV recordings, a stitched conversation MP3 and turn telemetry.

The built-in natural performers are original synthetic characters. The application does not clone or imitate real people.

## Run

The qualified hpubuntu runtime uses the scripts in `scripts/` and the deployment units in `deploy/systemd/`. For a direct development start:

```bash
FIGHT_CLUB_MODEL_ROUTES='{"qwen3-8b":"http://127.0.0.1:18780/v1","qwen2.5-3b":"http://127.0.0.1:18781/v1"}' \
FIGHT_CLUB_SPEECH_URL=http://127.0.0.1:18772 \
HOST=127.0.0.1 PORT=18770 node server-spoken.mjs
```

Open `/audio.html`. The browser uses same-origin `/api/` and `/tts/` routes, so the application works beneath an unlisted reverse-proxy prefix without exposing the internal model or speech services.

The delivery selector defaults to `PASSIONATE`. It changes performance direction—emotional commitment, emphasis, pace and rebuttal energy—while keeping the selected synthetic voice identity stable. `BALANCED` and `RESTRAINED` are available for interviews or quieter programmes.

Each participant also has an independent voice-speed setting from 0.75× to 1.25×. It is part of the participant performance configuration, not the base voice identity: OpenAI and Qwen receive explicit pace direction, while the Flite fallback uses pitch-preserving FFmpeg tempo adjustment. The selected rate is stored in the transcript and telemetry and is therefore baked into each turn WAV and the assembled MP3.

The public deployment runs its Flite fallback as `spoken-ai-public-flite.service` on loopback port 18874. This keeps speed-aware fallback changes isolated from the authoritative shared TTS checkout.

Length is user-defined from 2 to 40 turns. Every synthesized turn is archived as an individual WAV. When a conversation completes—or is stopped after at least one recorded turn—the server uses FFmpeg to normalize the saved turns, inserts a 350 ms inter-speaker pause and publishes `conversation.mp3`. JSON, Markdown, per-turn WAV and MP3 downloads remain separate exports. The completed-conversation player offers 0.75×–2× listening speed without rewriting the archived MP3 and preserves voice pitch where the browser supports it. Saved conversations are restored from the configured data directory when the application restarts, so their export URLs remain valid.

## Verification

```bash
npm test
node scripts/qualify-speech-router.mjs
node scripts/qualify-natural-live-loop.mjs
```

The test suite also verifies PCM-to-WAV archival, bounded speech-stream reads and MP3 assembly arguments. Runtime MP3 production requires FFmpeg with `libmp3lame` support.

See `NATURAL-TTS-QUALIFICATION.md`, `QUALIFICATION-V2.md` and `ARCHITECTURE.md` for evidence and design details.

## LIVE speech bake-off

The isolated `feature/tts-latency-bakeoff` branch adds purpose profiles, OpenAI streaming PCM, an ElevenLabs streaming adapter, circuit-breaker fallback telemetry, browser Web Audio playback and causality-safe next-turn prefetch. The slow Qwen renderer remains the STUDIO path. See `TTS-LATENCY-BAKEOFF.md` for the measured result and blockers.

The hidden deployment also exposes three explicitly labelled ElevenLabs v3 choices: Daniel (British broadcaster) for interviewer, Lily (British character voice) for guest, and George (British storyteller) for host/referee. Their provider voice IDs and API credential live only in `.env.local`; selecting one of these identities routes to ElevenLabs while retaining the local speech fallback chain. Personality delivery hints are translated into non-spoken v3 performance directions without changing transcript text.

## Privacy and release

Conversation transcripts and generated audio are stored server-side under the configured data directory. An unlisted URL is not authentication; production operators should add authentication, retention controls or rate limiting before treating the service as private. No homepage or navigation link is required.
