# Autonomous Barge-In Qualification

## Implemented milestone

Spoken AI Studio now keeps a lightweight listener loop active while another participant is audibly speaking. It is not audio-native full duplex: the speaker's text exists before TTS, and the browser releases only a playback-synchronised prefix to a small local monitor at 32%, 56% and 79% checkpoints.

The monitor emits a typed decision:

```text
action: LISTEN | PREPARE | INTERRUPT
reasonCode: FACTUAL_CHALLENGE | DIRECT_CONTRADICTION | MISREPRESENTATION |
            STRONG_DISAGREEMENT | CLARIFICATION | EVASION |
            COMIC_OPPORTUNITY | POINT_OF_ORDER
urgency: 0..1
confidence: 0..1
suggestedOpening: optional text
```

Natural and Polite modes require an explicit `INTERRUPT`. Argumentative and Chaos may escalate a high-confidence `PREPARE` after enough of the claim is audible. This is needed because the qualified Qwen monitor reliably prepared strong challenges but was overly reluctant to choose the literal interrupt action.

## Audible-text integrity

The browser sends a turn ID plus heard-word count, not the complete text. The server reconstructs the canonical prefix. The monitor context contains earlier completed turns and that prefix only; it explicitly excludes the current full utterance. At commit, the browser supplies a fresh playback-position count to include words that became audible during decision latency.

The interrupted transcript row is replaced by that heard prefix. The unused suffix is retained in private persistence fields for diagnosis, never fed into subsequent conversation context, and removed from conversation API and JSON export responses. The full pre-rendered source audio is deleted from the turn archive because it would misrepresent what was heard.

ElevenLabs container audio supplies a real media duration once loaded. Raw PCM uses a defensible estimate of 2.45 words per second adjusted by participant speech rate. Provider word timestamps would improve this approximation.

## State and priority

On commit the director invalidates stale prefetch, records the interruption, forces the interrupter's concise reaction, then forces the interrupted speaker to respond. Those two turns cannot themselves be autonomously interrupted, preventing immediate recursive loops.

Human `Throw a Grenade` always wins. It cancels pending model events, stops playback, truncates the transcript to the currently heard prefix, invalidates prefetch and installs the existing all-participant response obligation.

Hard cut stops playback immediately. Natural duck fades the speaker over about 165 ms and then stops it before synthesising the listener. The latter sounds less mechanical but does not yet produce genuine simultaneous audio; recorded overlap is therefore zero and fade time is recorded as cancel latency.

## Live qualification — 2026-08-30

The isolated hpubuntu qualification used the proposition “Local AI is inherently more secure than cloud AI.” It exercised the real Qwen model routes and speech router. The router selected its local FFmpeg/Flite fallback during this run, so these measurements prove orchestration and cancellation, not premium-voice quality.

| Case | Result | Decision latency | LLM interruption generation | TTS generation | Approx. decision-to-audio | Monitor tokens |
|---|---:|---:|---:|---:|---:|---:|
| Participant interruption | passed | 2,134 ms | 2,487 ms | 272 ms | 2,759 ms | 2,164 across 5 checks |
| Referee interruption | passed | 1,750 ms | 2,469 ms | 269 ms | 2,738 ms | 460 across 1 check |
| Human grenade | passed | immediate policy path | responses generated for both debaters | real TTS for both | not browser-timed | no monitor call |

Participant evidence retained conversation `38aed8a0-7175-4380-91fe-e8d05be55af0`; referee evidence retained `2b6d8921-d799-419d-afb2-2f3e97e754d2`; grenade evidence retained `3542975c-ad6e-4ae1-9dac-88de6d7763b6` in the isolated qualification data directory. The participant run contained four normal turns and one interrupted turn. The referee run contained three normal turns and one interrupted turn.

The participant acted on only this heard prefix:

> You can’t outsource security to a third party—cloud AI is a liability. Local AI gives

The referee acted on only:

> Cloud AI doesn’t spread vulnerabilities—it centralizes

Both were exact canonical prefixes; public conversation objects contained no private unspoken field. Focused and regression tests pass 37/37.

### Public browser timing

A post-deployment browser run at the hidden LozKnowles.com route used Argumentative mode, natural duck and an enabled referee. Conversation `26f189ff-f5fa-46f9-92d3-599825e602d2` produced a referee interruption and the interrupted speaker's reaction without a client console warning or error.

- Decision prefix: “So, specifically, Cedric—when your data’s bouncing between”
- Final actually-heard prefix after decision and duck latency: “So, specifically, Cedric—when your data’s bouncing between servers in 17 countries, how secure is”
- Monitor decision latency: 2,773 ms
- Duck/cancel latency: 360 ms
- Simultaneous audio overlap: 0 ms
- Decision to referee first audible audio: 4,184 ms
- Original claim playback start to referee first audible audio: 10,146 ms
- Referee TTS first-playable latency: 754 ms
- Monitor work: 2 evaluations, 1,418 tokens, self-hosted cost basis
- Public export private-suffix check: passed

The speech router selected FFmpeg/Flite fallback for this run despite the premium voice identities being selected. Barge-in behavior is therefore publicly qualified, while ElevenLabs provider availability remains a separate runtime/provider concern.

The monitor is self-hosted, so its metered API cost is recorded as USD 0 with a local-compute cost basis. False-positive quality still requires human listening review and is reported as such rather than invented.

## Key UX metric

The browser records `claimToListenerAudioMs` and `decisionToListenerAudioMs` when the interruption voice first becomes playable. The non-browser harness measured the constituent decision, generation and TTS stages above; a browser session is authoritative for end-to-end audible timing because autoplay, device buffering and actual playback position are client concerns.

## Future true duplex

The current ConversationEngine, PersonalityProfile, CharacterState, TranscriptStore and director events remain useful if text/TTS is replaced by an audio-native provider. A future adapter can implement `speech.listen`, `conversation.interruption.evaluate`, `speech.cancel` and `speech.synthesize.live` while preserving the engine state contract.

OpenAI's current Realtime model supports realtime audio and text input/output over WebRTC, WebSocket and SIP. The official documentation also exposes voice-activity detection and server-side controls. That makes it a credible future provider for native audio-in/audio-out turn detection and barge-in, but it should be added as another provider rather than coupled to ConversationEngine. See [official OpenAI Realtime model documentation](https://developers.openai.com/api/docs/models/gpt-realtime).

Before adopting it, qualify multi-character identity stability, interruption cancellation semantics, transcript alignment, cost, regional/network dependency, sideband director control and whether independent simultaneous agent sessions can preserve the same compact character state.
