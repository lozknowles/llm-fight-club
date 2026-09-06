# OmniVoice integration and physical qualification

Date: 2026-09-06. Host: `hpubuntu`. GPU: Quadro P5000 16 GB. Branch: `feature/omnivoice-provider`. Starting revision: `cf0abb4eca292c8e0b7c8efb7bbb7c54f131748c`.

## Implementation

`OmniVoiceSpeechProvider` is an optional provider in the existing speech router. `VoiceProfile` remains independent of model, role and `PersonalityProfile`; the selected public profile is snapshotted into every transcript turn. Three original application identities are provided: Rowan (moderator), Elara (challenger), and Bram (analyst). The UI retains voice preview, per-participant rate, distinct-voice validation and playback-completion gating, and adds Text, Voice and Text + voice modes.

Direct mode loads `k2-fsa/OmniVoice` once behind a serialized loopback service. The qualified hpubuntu path used the operator-authorized existing OmniVoice worker through an authenticated local adapter, avoiding a second GPU model load. That worker exposes one original designed performer; the adapter applies stable pitch/rate treatments of 0.92, 1.12 and 0.82 for the three show identities. This is not real-person cloning. Direct design mode remains the route to independently generated timbres.

## Physical show

Conversation `489c6e7a-d873-403a-9f26-0330213b2fee` ran through the actual `ConversationEngine`, local Qwen LLM, speech router, OmniVoice adapter, per-turn archive and MP3 assembler. The subject was: “Should artificial intelligence make important decisions without human oversight?” It produced six turns across a host and two panelists.

- Result: PASS for provider routing, three persistent identities, profile metadata, WAV archival, transcript preservation and completed MP3.
- Model load: 7,675 ms (existing worker cold startup measurement).
- Warm TTS synthesis: 1,335–2,706 ms for ordinary turns; 6,370 ms for the 21.256 s introduction.
- TTS real-time factor: 0.300–0.384.
- Peak allocated GPU memory: 3,881 MiB.
- Worker resident memory: 1,946 MiB.
- LLM latency: 700–1,427 ms.
- Final spoken audio: 57.631 s; assembled MP3: 59.45 s including five 350 ms programme gaps and encoder padding.
- Preview WAVs: three, each approximately 3.42 s, routed by OmniVoice.
- Signal check: no clipped samples in the standard previews; leading silence about 81–86 ms. One 0.889 s quiet interval was detected in the completed programme, at the end of the long introduction plus assembly gap.

The run was processed to completion through the same playback-acknowledgement API used by the browser, and the assembled archive contains no overlapping segments. Deterministic tests verify that the next turn is rejected until playback completion; the existing browser path performs that acknowledgement only when media playback ends. The scripted qualification did not wait in real time between acknowledgements, and this environment did not provide the agent with an acoustic listening channel. Final live-browser timing, subjective naturalness and “immediately distinguishable” acceptance therefore belong to the supplied human-listenable MP3 and previews rather than an automated claim.

## Failure and fallback

With only the Fight Club OmniVoice adapter stopped (the existing worker was not altered), the same `omnivoice-moderator` request returned HTTP 200 from `ffmpeg-flite`, a valid WAV, and `x-tts-fallback: true`. A separate physical two-turn `TEXT` run completed with two transcript rows and zero audio files. Speech failure therefore does not discard generated text or prevent text-only operation.

## Evidence

- hpubuntu: `/fast/work/llm-fight-club-omnivoice-qualification-final/qualification.json`
- hpubuntu per-turn and preview WAVs: `/fast/work/llm-fight-club-omnivoice-qualification-final/`
- hpubuntu MP3: `/fast/work/llm-fight-club-omnivoice-qualification-data/audio/489c6e7a-d873-403a-9f26-0330213b2fee/conversation.mp3`
- MSI copy: `outputs/omnivoice-qualification/`

## Limitations and release decision

The worker-reuse path produces distinguishable treatments of one designed performer, not three independently designed base timbres. The MP3 needs human listening acceptance. OmniVoice code is Apache-2.0, while the published pretrained checkpoint is CC-BY-NC; do not use this checkpoint for a commercial/public release without a licensing decision. The implementation is committed but deliberately not pushed, merged, tagged, released or deployed.
