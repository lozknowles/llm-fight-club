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

Voice identity and delivery are separate. A participant chooses a stable synthetic voice identity while each generated turn supplies compact hints such as measured, dry, defensive or rapid. The speech router prefers Qwen and maps to a distinct Flite voice if natural synthesis is unavailable.

The LIVE path also accepts an allow-listed delivery intensity (`PASSIONATE`, `BALANCED` or `RESTRAINED`) plus format and role. The OpenAI provider combines these with the stable voice identity to direct emotional range, intonation, pace and emphasis. No raw provider prompt or API credential is exposed to the browser.

The v0.2 transport returns a complete WAV. The browser plays it through one persistent audio element and calls `complete-playback` only after the `ended` event. Slow generation therefore delays a turn but never shortens or overlaps its real-time playback. The provider boundary permits future chunked/streaming speech, microphone input and interruption without changing conversation policy.

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
                    |
                    v
      Web Audio PCM scheduler / audio element
                    |
                    v
       playback-complete acknowledgement
```

While turn A is audible, the server may prepare turn B on a cloned conversation snapshot containing A's final text. The prepared result is committed only after A's playback acknowledgement and only if the selected participant and transcript length still match. This preserves causal ordering while removing most next-turn LLM latency from the audible gap.

The application router is a qualified prototype, not a replacement for Agent Control. Its profile/capability vocabulary maps directly to Agent Control provider resources and a future verified `speech.synthesize@1` job action.
