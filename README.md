# LLM Fight Club / Spoken AI Studio

A general turn-based spoken multi-agent conversation engine. Debate was the first format; v0.2 also supports interview, panel and cross-examination formats with reusable personality profiles, compact character state, dynamic interviewer follow-ups, durable transcripts and browser-controlled audio sequencing.

The intended experience is asynchronous generation followed by real-time listening: the user starts a programme, waits while each line is generated and synthesized, then hears it play at natural speed. Playback completion—not a timer—authorizes the next LLM turn.

## Current stack

- Two local OpenAI-compatible LLM endpoints.
- `ConversationEngine` plus format-specific turn policies.
- Provider-neutral `SpeechProvider` boundary.
- Qwen3-TTS 12Hz 1.7B VoiceDesign for natural voices and per-line delivery hints.
- FFmpeg/Flite `awb`, `slt` and `rms` voices as an automatic fallback.
- Persistent JSON/Markdown transcripts and turn telemetry.

The built-in natural performers are original synthetic characters. The application does not clone or imitate real people.

## Run

The qualified hpubuntu runtime uses the scripts in `scripts/` and the deployment units in `deploy/systemd/`. For a direct development start:

```bash
FIGHT_CLUB_MODEL_ROUTES='{"qwen3-8b":"http://127.0.0.1:18780/v1","qwen2.5-3b":"http://127.0.0.1:18781/v1"}' \
FIGHT_CLUB_SPEECH_URL=http://127.0.0.1:18772 \
HOST=127.0.0.1 PORT=18770 node server-spoken.mjs
```

Open `/audio.html`. The browser uses same-origin `/api/` and `/tts/` routes, so the application works beneath an unlisted reverse-proxy prefix without exposing the internal model or speech services.

## Verification

```bash
npm test
node scripts/qualify-speech-router.mjs
node scripts/qualify-natural-live-loop.mjs
```

See `NATURAL-TTS-QUALIFICATION.md`, `QUALIFICATION-V2.md` and `ARCHITECTURE.md` for evidence and design details.

## Privacy and release

Conversation transcripts are stored server-side under the configured data directory. An unlisted URL is not authentication; production operators should add authentication or rate limiting before treating the service as private. No homepage or navigation link is required.
