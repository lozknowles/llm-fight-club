# LLM Fight Club / Spoken AI Studio

## Optional Voice Lab (development branch; private preview only)

Consent-driven guided enrolment, private reusable OmniVoice reference conditioning,
original/synthetic comparisons, explicit operator acceptance and ANNOUNCER /
COMMENTATOR presentation roles. Uses the existing installed OmniVoice capability;
no second model installation or conventional training. See [VOICE-LAB.md](VOICE-LAB.md)
for setup, security, storage/deletion, physical qualification and remaining gates.

New enrolments use four displayed sentences with contrasting delivery hints. Record,
listen and accept each take, then choose **Ready for sentence N** to continue.
Nothing records automatically. Existing recorded six-prompt profiles retain their guide.
**Accept and save recording** is the save action; the checkbox alone does not save.
An unsaved take blocks moving on until it is saved or explicitly discarded. The
count labelled SAVED ON SERVER reflects successful server responses, not prompt numbers.

A general spoken multi-agent conversation engine. Debate was the first format; v0.3 also supports interview, panel and cross-examination formats with reusable personality profiles, compact character state, dynamic interviewer follow-ups, durable transcripts, browser-controlled audio sequencing and model-initiated barge-in.

The intended experience is asynchronous generation followed by real-time listening: the user starts a programme, waits while each line is generated and synthesized, then hears it play at natural speed. Playback completion—not a timer—authorizes the next LLM turn.

## Current stack

- Two local OpenAI-compatible LLM endpoints.
- `ConversationEngine` plus format-specific turn policies.
- Provider-neutral `SpeechProvider` boundary.
- OpenAI `gpt-4o-mini-tts` streaming PCM for the live natural voice identities.
- Qwen3-TTS 12Hz 1.7B VoiceDesign for natural voices and per-line delivery hints.
- FFmpeg/Flite `awb`, `slt` and `rms` voices as an automatic fallback.
- Persistent JSON/Markdown transcripts, per-turn WAV recordings, a stitched conversation MP3 and turn telemetry.

The built-in natural performers are original synthetic characters. Optional Voice Lab
enrolment supports only the operator's own or explicitly authorised voice through
affirmative consent and acceptance; it is disabled by default.

## OmniVoice evaluation backend

OmniVoice is available as an optional provider with three original designed identities: Rowan (measured British moderator), Elara (energetic British challenger) and Bram (dry British analyst). Select them directly, or open `/audio.html?profile=OMNIVOICE` to make them the defaults. The output selector supports Text, Voice and Text + voice; the canonical transcript remains stored and exportable in every mode.

Install the source-pinned, isolated runtime with `scripts/install-omnivoice.sh`, then adapt and enable `deploy/systemd/llm-fight-club-omnivoice.service`. The service is loopback-only, loads the model once and serializes GPU requests. OmniVoice source code is Apache-2.0, but the published pretrained checkpoint is CC-BY-NC because of its training data. Treat it as evaluation-only until the intended release has passed a licensing review.

On a GPU already hosting the authenticated OmniVoice worker, set `OMNIVOICE_UPSTREAM_URL` and `OMNIVOICE_UPSTREAM_TOKEN` only in the private service environment. The adapter reuses that worker's designed synthetic performer and applies fixed local pitch/rate treatments to expose three stable, distinguishable programme identities without loading the checkpoint twice. The token is never served to the browser or committed.

For an existing worker whose bearer token is already held in a protected environment file, start the adapter with `OMNIVOICE_WORKER_ENVIRONMENT=/protected/path.env scripts/run-omnivoice-worker-proxy.sh`. The script transfers the token only through process environment and does not print or copy it.

## Live Conversation Heat

The sticky `Conversation Heat` control remains available above the show and can be changed while a conversation is running. `Docile`, `Calm`, `Balanced`, `Heated` and `Furious` jointly control dialogue direction, expressive TTS hints and the autonomous-listener threshold. Heated speakers seek a concrete counter-position and state it directly; Furious speakers may use varied natural exasperation, selective emphasis and earlier contextual barge-in. The prompts explicitly prohibit empty shouting, abuse, fabricated disagreement and repetitive catchphrases. A private debate-position evaluator retries any heated draft that reverses or muddles its assigned side.

Each change is persisted with a heat revision and timestamp in JSON telemetry and Markdown export. It invalidates stale next-turn prefetch and restarts the audible-prefix listener against the current heat revision, without revealing unspoken text. The transcript sits below the pinned control area in a fixed-height window and automatically scrolls upward as new turns arrive.

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
node scripts/qualify-conversation-heat.mjs
```

The test suite also verifies PCM-to-WAV archival, bounded speech-stream reads and MP3 assembly arguments. Runtime MP3 production requires FFmpeg with `libmp3lame` support.

See `NATURAL-TTS-QUALIFICATION.md`, `QUALIFICATION-V2.md` and `ARCHITECTURE.md` for evidence and design details.

See `OMNIVOICE-QUALIFICATION.md` for the provider setup, P5000 measurements, fallback test, evidence paths, limitations and licensing boundary.

## LIVE speech bake-off

The isolated `feature/tts-latency-bakeoff` branch adds purpose profiles, OpenAI streaming PCM, an ElevenLabs streaming adapter, circuit-breaker fallback telemetry, browser Web Audio playback and causality-safe next-turn prefetch. The slow Qwen renderer remains the STUDIO path. See `TTS-LATENCY-BAKEOFF.md` for the measured result and blockers.

The hidden deployment also exposes three explicitly labelled ElevenLabs v3 choices: Daniel (British broadcaster) for interviewer, Lily (British character voice) for guest, and George (British storyteller) for host/referee. Their provider voice IDs and API credential live only in `.env.local`; selecting one of these identities routes to ElevenLabs while retaining the local speech fallback chain. Personality delivery hints are translated into non-spoken v3 performance directions without changing transcript text.

Every participant can now combine a built-in original fictional profile with an optional free-form personality prompt. The prompt is bounded, stored with the conversation and applied as character direction without changing model, role or voice identity. Built-in comic archetypes use broad mechanisms such as reclusive puzzle logic, erudite digression and anxious existential escalation; they do not impersonate named performers or reproduce protected characters.

During a live show, `Throw a Grenade` accepts a typed comment or browser speech recognition. Throwing it interrupts current playback, discards any prefetched next reply and gives the interrupted participant the immediate response. Every other participant then responds in turn. A private semantic check prevents unrelated continuation from being falsely marked as acknowledgement.

Grenade response generation is fail-safe: after ordinary retries, the system uses the stronger local model to repair a reply while retaining the selected personality and exact audience comment. A final grounded direct-response path prevents a strict semantic evaluator from leaving the programme stalled. Transient non-intervention generation failures expose a `Retry response` control.

## Autonomous barge-in

Conversation Heat maps internally to the existing `Off`, `Polite`, `Natural`, `Argumentative` and `Chaos` listener policies. While a turn is playing, the browser opens a heat-dependent bounded set of listener checkpoints—none for Docile and at most five for Furious. Each checkpoint sends the server the word count corresponding to the current playback position; the server reconstructs that prefix itself, so neither the small local monitor nor the interrupting participant sees the unspoken suffix.

The monitor returns a typed `LISTEN`, `PREPARE` or `INTERRUPT` decision with a reason category, urgency and confidence. If an interruption commits, the current transcript row is reduced to the words actually heard, stale prefetch is deleted, the interrupter receives the next turn and the interrupted speaker receives the following reaction turn. The generated-but-unspoken suffix remains private in the persistence record and is removed from API and export responses. Human `Throw a Grenade` input cancels any pending model interruption and remains highest priority.

Debate can optionally add a third, distinct-voice referee. The referee participates only when the listener policy identifies evasion, contradiction, missing factual grounding or a point of order. Per-personality interruption frequency, patience, assertiveness, politeness, argumentativeness and comic timing influence the director threshold without becoming deterministic rules.

Panel mode begins with an audible programme introduction from the selected host voice. The introducer states the subject, names each selected panel personality with a brief faithful description, and asks the opening question. Autonomous listeners cannot barge into this opening; normal panel interruption policy begins with the first substantive response.

Run the focused live qualification with:

```bash
QUALIFICATION_BASE_URL=http://127.0.0.1:18770 node scripts/qualify-barge-in.mjs
```

See `DUPLEX-BARGE-IN.md` for the state machine, telemetry, measured qualification and current timing limitation.

## Privacy and release

Conversation transcripts and generated audio are stored server-side under the configured data directory. An unlisted URL is not authentication; production operators should add authentication, retention controls or rate limiting before treating the service as private. No homepage or navigation link is required.
