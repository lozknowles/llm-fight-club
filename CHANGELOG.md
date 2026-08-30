# Changelog

## 2026-08-30 — State-aware transport controls

- Transport buttons now expose only actions valid for the current conversation state.
- `Resume` is disabled while active, `Pause` is disabled while paused, and `Skip speech` is available only during active playback.
- All transport and audience-intervention controls become visibly disabled after completion, stop or error.
- Added focused tests for active playback, preparation, pause and terminal states.

## 2026-08-30 — Non-stalling grenade recovery

- Route intervention validation through the stronger local Qwen3 model.
- If a participant repeatedly fails to address an audience grenade, retry through Qwen3 while preserving the selected personality and exact audience wording.
- Add a final grounded direct-response safety path so a failed evaluator can never halt the programme with pending intervention obligations.
- Added a visible `Retry response` control for unrelated transient generation errors.

## 2026-08-30 — Panel programme introducer

- Relabelled the panel host as `Introducer / Host` in setup.
- Added an audible opening that states the subject, introduces every selected panel personality by name and asks the first question.
- Protected the programme introduction from autonomous interruption while keeping all subsequent panel discussion interruptible.

## 2026-08-30 — Autonomous LLM barge-in

- Added typed `LISTEN`, `PREPARE` and `INTERRUPT` listener decisions driven by a small local monitor at three playback-synchronised checkpoints.
- Added Off, Polite, Natural, Argumentative and Chaos policies plus per-personality patience, assertiveness, politeness, argumentativeness, interruption-frequency and comic-timing traits.
- Added hard-cut and natural duck-to-stop playback cancellation policies.
- Preserve the exact heard prefix, keep unspoken generated text private, invalidate stale prefetch and force an interrupter/reaction turn pair.
- Added an optional distinct-voice debate referee capable of factual and point-of-order interruptions.
- Added interruption timestamps, typed reason, latency, token, cost-basis, cancel, overlap and normal/interrupted-turn telemetry.
- Kept typed and speech-input Throw a Grenade as the highest-priority interruption source.
- Added live participant, referee and human-grenade qualification plus focused state-machine tests.

## 2026-08-30 — Genuine grenade responses

- Give the interrupted speaker the immediate next turn before the remaining participants respond.
- Require a specific, natural response to the audience member's wording and tone rather than a canned acknowledgement.
- Added private response evaluation so unrelated turns can no longer clear the intervention obligation.

## 2026-08-30 — Live Throw a Grenade intervention

- Added typed and browser speech-recognised audience curve balls during a running show.
- Throwing a grenade now stops playback, invalidates prefetch and requires every participant to address the intervention.
- Added intervention history, pending-acknowledgement status and JSON/Markdown export persistence.

## 2026-08-30 — Participant personality prompts

- Added a bounded free-form personality prompt for every participant, layered over the selected reusable profile.
- Added Theodore Gridley, Crispin Bell and Morris Fenn as original fictional comic archetypes.
- Added profile summaries in the setup UI and explicit safeguards against real-person, voice or protected-character imitation.

## 2026-08-30 — ElevenLabs v3 premium voices

- Added three clearly labelled British ElevenLabs v3 voice identities for interviewer, guest and host/referee.
- Added expressive v3 performance direction derived from delivery hints while preserving canonical transcript text.
- Kept API credentials and provider voice IDs in protected runtime configuration, with local TTS fallbacks retained.

## 2026-08-30 - Classic local TTS comparison voices

- Add isolated eSpeak NG 1.51 and Festival 2.5 speech providers without changing the qualified default voices.
- Expose two clearly labelled eSpeak British variants and two Festival US voices as explicit `TEST` options.
- Preserve independent participant speed controls and normalize classic output to browser-compatible 24 kHz mono WAV.
- Add provider health, model and voice telemetry plus regression coverage for unique test voice identities.

## 2026-08-30 - Conversation repetition guard

- Detect near-verbatim and heavily paraphrased repetition against each participant's recent turns.
- Retry rejected drafts with a compact prompt that forbids exhausted lines and requires a new conversational angle.
- Give long interviews a 20-stage progression through evidence, incentives, consequences, failure, accountability, concession and closure.
- Compact and deduplicate character-state claims before returning them to model context.
- Record repetition scores and retry counts in turn telemetry.
- Add regression coverage for looping dialogue, legitimate new angles and claim compaction.

## 2026-08-30 - Voice and programme speed controls

- Add an independent 0.75×–1.25× synthesis-speed selector to every participant.
- Persist participant speed on the conversation, transcript, telemetry, per-turn WAV and assembled MP3.
- Direct OpenAI and Qwen performance pace without coupling it to synthetic voice identity.
- Apply pitch-preserving FFmpeg tempo adjustment when Flite is used as the final fallback.
- Add a completed-conversation player with adjustable 0.75×–2× playback speed while keeping the downloadable MP3 canonical.
- Add regression coverage for speed bounds and OpenAI pace direction.
- Add a speed-aware public Flite fallback service isolated from the authoritative shared TTS checkout.

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
