# Architecture

```text
Browser
  -> Conversation HTTP API
     -> ConversationEngine
        -> ConversationFormat policy
        -> ConversationDirector
        -> ContextManager / CharacterState
        -> ModelProvider -> local or cloud LLM
     -> TranscriptStore / TelemetryRecorder
  -> same-origin speech proxy
     -> SpeechProvider router
        -> NaturalTTSProvider (Qwen3-TTS VoiceDesign)
        -> ExistingTTSProvider (FFmpeg/Flite fallback)
  <- WAV playback
  -> playback-complete acknowledgement
  -> next turn
  -> TurnAudioStore -> per-turn WAV
                    -> FFmpeg assembler -> conversation.mp3
```

## Conversation model

`PersonalityProfile` is independent of participant role, model and voice. It carries worldview, objectives, assumptions, expertise, blind spots, temperament, rhetoric, verbal habits and private character notes. `CharacterState` retains claims, commitments, contradictions, anecdotes, relationships, emotional state, running jokes and concessions without keeping the entire raw transcript in every model context.

Formats implement ordering and prompting policy:

- `DebateFormat`: opposing positions and optional referee.
- `InterviewFormat`: private answer analysis followed by an unscripted question.
- `PanelFormat`: a host dynamically rotates among multiple personalities.
- `CrossExaminationFormat`: rigorous examiner/witness turns with inconsistency tracking.

The engine owns state transitions. Neither an LLM nor speech provider can advance the programme.

## Speech and playback

Voice identity, synthesis pace and playback pace are separate. A participant chooses a stable synthetic voice identity plus an independently bounded 0.7×–1.4× speech rate; the public presets expose 0.75×–1.25×. Each generated turn also supplies compact delivery hints such as measured, dry, defensive or rapid. The speech router follows an explicit profile: `LIVE_FAST` starts with OpenAI streaming PCM, `STUDIO` starts with local Qwen VoiceDesign, and both retain distinct Flite voices as the final fallback.

The LIVE path also accepts an allow-listed delivery intensity (`PASSIONATE`, `BALANCED` or `RESTRAINED`) plus format and role. The OpenAI provider combines these with the stable voice identity to direct emotional range, intonation, pace and emphasis. No raw provider prompt or API credential is exposed to the browser.

Participant speech rate travels with the participant and is copied onto every generated turn. OpenAI and Qwen express it as model performance direction; the Flite fallback uses FFmpeg `atempo`. This synthesis rate is baked into the saved WAV. By contrast, the completed-programme player changes only `HTMLMediaElement.playbackRate` (0.75×–2×) and requests pitch preservation, leaving the canonical MP3 unchanged.

The LIVE transport streams raw 24 kHz PCM from compatible providers into a Web Audio scheduler; container providers use the persistent audio element. The browser calls `complete-playback` only after the scheduled audio ends. Slow generation therefore delays a turn but never shortens or overlaps its real-time playback. After three seconds without headers the UI explicitly reports that the voice is still preparing. Router first-byte and stream-idle deadlines prevent a provider from hanging a programme indefinitely and allow pre-playback fallback to the next qualified provider.

The same-origin application proxy tees each successful turn into `TurnAudioStore`. Raw PCM is wrapped in a canonical WAV header; other containers are preserved when already WAV or normalized with FFmpeg. On completion, `ConversationAudioAssembler` resamples the ordered turn files to 24 kHz mono, inserts a 350 ms pause between speakers and encodes `conversation.mp3`. This archive path is downstream of `ConversationEngine`: it cannot advance turns and does not alter provider selection or live playback causality.

Conversation length is a user-supplied turn limit bounded to 2–40. Per-turn WAV routes and the final MP3 route validate conversation and turn identifiers against the conversation registry before reading the configured data directory. The registry is restored from persisted conversation JSON during application startup, preserving export URLs across service restarts.

## Deployment boundary

Only the conversation application is reverse-proxied publicly. LLM and speech-provider ports remain on loopback or the private Tailscale interface. Browser speech calls pass through the application's same-origin `/tts/` proxy, allowing deployment under an unlisted URL prefix without CORS exposure.

The LozKnowles.com deployment remains unlinked and emits `X-Robots-Tag: noindex, nofollow, noarchive`. The unlisted path is discoverability reduction rather than authentication; the API key stays exclusively in the hpubuntu speech-router service environment.

Agent Control is not imported or modified. Its protected services remain operationally separate.

## LIVE streaming extension

The bake-off branch adds a streaming transport without changing ConversationEngine:

```text
turn text -> speech profile -> provider-neutral router
  LIVE_FAST    -> OpenAI PCM -> ElevenLabs stream -> Flite
  LIVE_QUALITY -> OpenAI PCM -> ElevenLabs stream -> Qwen -> Flite
  STUDIO       -> Qwen -> cloud alternatives -> Flite
  OFFLINE      -> Qwen -> Flite
                    |
                    v
        same-origin chunked response
             /              \
            v                v
 TurnAudioStore       Web Audio PCM scheduler
      |                       |
      v                       v
 per-turn WAV          playback-complete acknowledgement
      |
      v
 FFmpeg + 350 ms gaps -> conversation.mp3
```

While turn A is audible, the server may prepare turn B on a cloned conversation snapshot containing A's final text. The prepared result is committed only after A's playback acknowledgement and only if the selected participant and transcript length still match. This preserves causal ordering while removing most next-turn LLM latency from the audible gap.

The application router is a qualified prototype, not a replacement for Agent Control. Its profile/capability vocabulary maps directly to Agent Control provider resources and a future verified `speech.synthesize@1` job action.
