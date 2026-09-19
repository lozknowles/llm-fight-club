# Changelog

## Unreleased — Phase 8 prepared speech (2026-09-19)

- Add an opt-in prepared-battle interface; seal exact model responses and independent text judging before background speech generation.
- Add provider-neutral speech capabilities, durable hash-bound audio caching, fixed original-synthetic fighter/host identities, blind projections and separate speech evidence.
- Add manual/continuous playback, approximate captions, mute/text-only, cancellation and fallback, byte-range WAV playback and a replay-only local viewer.
- Qualify real local/local, API/API and local/API CSM battles; retain synthetic fixtures as separate regression evidence.
- Keep keys server-side, exclude private runtime state and voice assets, and document incomplete watermark/export and physical-mobile qualification. No live deployment or new release tag.
- Handle the existing faster route's declared raw PCM as a complete WAV without silent voice substitution.

## 1.2.0 — 2026-09-12

- Prepare next-turn audio as well as text while the current speaker plays. No transcript advancement before playback completion. Invalidation on heat, pause, stop, skip and human/model interruptions discards obsolete work.
- Pin built-in OmniVoice performers to private original synthetic reference anchors, using the existing installed worker. Recorded user profiles are unchanged. Refuse silent provider/voice substitution.
- Remove speaker labels and acting/posture directions from generated dialogue; enforce spoken word budgets and clarify who the other participant is.
- Fix playback accounting to use media duration, not page uptime; guard stale completion events by turn ID and playback generation. Add speech retry without generating a different turn.
- Add HTTP pipeline regression coverage for overlap, invalidation, fallback refusal, output cleaning and stable anchor routing.

## 1.1.0 — 2026-09-12

- Added saved-profile **Available in Fight Club** opt-in and clear recorded-voice labels at the top of participant voice menus.
- Accepted, explicitly enabled voices use the existing OmniVoice worker through a provider-neutral adapter, with pitch-preserving voice speed and existing turn WAV / conversation MP3 storage.
- Recheck acceptance/availability on every generation; reject stale IDs without falling back to someone else's voice. Reset revokes availability. Recorded names are rendered as text, not HTML.
- Opt-in is off by default for all profiles and requires an additional private-deployment switch. Existing reference data, consent, acceptance and protected access are preserved.

## 1.0.0 — 2026-09-12

- First versioned GitHub release combining the spoken conversation engine and consent-driven Voice Lab, including four guided recordings, explicit saving, custom-sentence synthesis and original/synthetic comparison.
- Operator completed USB-microphone enrolment, original/synthetic playback, explicit voice acceptance and announcer/commentator assignment. Those private assets are retained outside source control.
- Added a versioned health response and visible Voice Lab release label. Protected-site deployment reuses the existing File Store password/SMS gate and existing OmniVoice worker.
- No claim of full-duplex speech, multi-reference model training, commercial model licensing, or an accepted-voice qualification bout. See release notes for limitations.

## 2026-09-12 — Enter a sentence and Generate voice

- Added a 500-character sentence box and counter to the original/synthetic comparison, with the requested Generate voice label. Blank input still uses a suggested phrase.
- The existing authenticated test endpoint forwards validated plain text to the existing OmniVoice profile and stores that exact text with the generated audio. No second provider/model is introduced.
- Accepted profiles can also generate previews without changing their accepted reference, acceptance evidence or role assignments. New/unqualified profiles still require both listening reports and explicit acceptance.
- Tests cover custom-text propagation, bounds, invalid input, fallback text, UI label/playback readiness and preservation of prior acceptance. Real custom-sentence listening is left to the operator.

## 2026-09-12 — Explicit recording save and adjacent guide

- Rename Accept sample to Accept and save recording, show UNSAVED/NOT SAVED inline, and report the server-returned saved count after success. Failed saves retain the take and do not advance.
- Block sentence/profile changes, new recording and qualification while a take is unsaved; explicit discard asks for confirmation, and page exit warns about unsaved work.
- Hide Reopen recording during recording and reject redundant add-sample requests on the server. Reopening qualification is no longer presented as a way to save a take.
- Move microphone setup before Read and record, place displayed sentence immediately above transport controls, and put guided progress directly beneath the recording block.
- Regression tests cover failed-save retention, save receipts, navigation blocking, redundant reopen rejection and layout order. Live diagnosis found no saved samples in either current profile; earlier click outcomes cannot be reconstructed from that fact alone.

## 2026-09-12 — Four-sentence guided voice enrolment

- Four original displayed sentences cover warm conversation, curiosity, firm disagreement and reflective reassurance, each with separate delivery guidance.
- Save/listen/confirm one take at a time; an explicit Ready for sentence N button advances the guide without starting the microphone or recording. Saved progress resumes at the first missing sentence; optional retakes remain available.
- Pin prompt text to each profile. Existing recorded legacy profiles retain their six original prompts; empty legacy profiles adopt four on their next save. No recordings are deleted or relabelled. Stale browser sample uploads are rejected rather than assigning the wrong text.
- Software tests cover the complete four-save UI progression, legacy compatibility, recording limits and stale-guide protection. Physical four-sentence capture remains operator-qualified.

## 2026-09-12 — Noisy microphone capture troubleshooting

- Default new captures to browser speech cleanup (noise suppression and echo cancellation), with raw studio capture still selectable. Automatic gain stays off to avoid raising noise alongside faint speech.
- Show the selected input and actual processing settings reported by the browser; add an explicit microphone-off button. Changing cleanup mode stops monitoring and requires Enable microphone again.
- Explain the magnified input meter, display RMS dBFS, and replace the misleading GOOD verdict with level-check-only wording and an explicit clear-voice listening confirmation.
- Regression-tested worklet sample preservation and processing selection. Real microphone noise reduction still requires an operator-recorded comparison; no existing samples are modified.

## 2026-09-12 — Voice Lab unlock feedback

- Replaced the ambiguous authorisation error with separate missing-key and rejected-key messages. Credentials are never echoed or logged; authentication remains fail-closed.
- Verified on the private preview that the browser's entered key was received but rejected, while the saved MSI Voice Lab key authenticated successfully. No microphone capture or voice acceptance was performed.
- Added regression checks for both errors and non-disclosure of submitted/configured keys.

## 2026-09-12 — Approved private Voice Lab browser access

- Added only loopback destination 127.0.0.1:18891 to loz's explicitly approved SSH forwarding list, preserving existing entries and SSH port 2222.
- Validated configuration, retained a recoverable backup and reloaded SSH without restarting it.
- Verified Voice Lab browser access and authenticated installed-worker health through the MSI tunnel. Operator consent, microphone recording and likeness acceptance remain pending.

## 2026-09-12 — Approved private worker activation

- Activated the optional enrolment extension on the existing shared OmniVoice worker after explicit operator approval; preserved original source/model/legacy routes and existing service limits.
- Verified real reference conditioning with a new original synthetic reference: 7.12 s generated speech in 4.41 s. This is not human enrolment or likeness qualification.
- Started an isolated loopback-only Voice Lab preview. MSI access awaits approval for one additional SSH forwarding destination; no SSH access policy or public website route changed.

## 2026-09-12 — Voice Lab (isolated development, physical qualification pending)

- Added optional, consent-driven microphone enrolment with six guided categories,
  up to six additional takes, input meter, local capture and server-side PCM quality checks.
- Added provider-neutral private voice profiles, deterministic reference selection,
  integrity hashes, A/B tests, explicit user acceptance, deletion and requalification.
- Prepared a separately authenticated extension to the existing OmniVoice worker;
  reuses its model and reference conditioning without fine-tuning or a second model load.
- Added permitted announcer/commentator roles, synthetic disclosure, a real-bout
  qualification runner and operator-started video capture with measured resolution.
- Added security/state tests and physical qualification checklist. No user voice
  recorded, no acceptance inferred, no live worker restarted, no deployment performed.

## 2026-09-06 — Optional OmniVoice provider

- Added a provider-neutral OmniVoice adapter and persistent loopback synthesis service.
- Added Rowan, Elara and Bram as original deterministic designed profiles with explicit provenance and no real-person reference.
- Preserved OpenAI, ElevenLabs, Qwen, classic and Flite fallbacks.
- Added Text, Voice and Text + voice modes while retaining canonical transcripts.
- Added load, synthesis, duration, real-time-factor and peak-VRAM telemetry.
- Added a source-pinned isolated installer and service example; this change is not deployed.
- Documented the checkpoint's non-commercial licensing constraint and pending P5000 qualification.
- Physically qualified a six-turn, three-identity P5000 show, three previews, final MP3, resource telemetry, text-only mode and Flite outage fallback through the existing operator-authorized worker.

## 2026-08-30 — Live Conversation Heat

- Added a sticky live `Docile` → `Furious` Conversation Heat control above the programme.
- Heat now changes counterargument strength, patience, expressive delivery hints, interruption thresholds and audible-prefix checkpoint frequency.
- Heated/Furious prompts favour explicit reasoned disagreement, contextual exasperation and selective vocal emphasis while preventing empty shouting, abuse and repetitive canned phrases.
- Added a private debate-position guard and stance retry so raising heat cannot make a speaker reverse its assigned side.
- ElevenLabs v3 receives heat-priority performance tags; other providers retain provider-neutral delivery hints.
- Restored the currently healthy OpenAI live performers as defaults while leaving ElevenLabs clearly selectable; the configured ElevenLabs key is presently quota-limited and otherwise falls back to Flite.
- Heat changes are revisioned, persisted, exported and recorded in telemetry, and invalidate stale prefetched dialogue.
- Moved the transcript beneath the control area into a fixed-height, automatically advancing scroll window.
- Added focused engine, UI-source and ElevenLabs routing tests.
- Added a real two-turn Furious qualification covering opposing positions, expressive OpenAI audio, live heat revision and provider telemetry.

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
