# Live TTS latency bake-off — 2026-08-30

## Verdict

The streaming and prefetch architecture is implemented and browser-qualified, but a natural cloud LIVE voice is not yet financially qualified.

- OpenAI `gpt-4o-mini-tts`: integrated with streaming 24 kHz PCM and three distinct synthetic voice identities. Real requests reached the API, but the selected Platform project returned HTTP 429 `no credits remaining`. No OpenAI audio result is claimed.
- ElevenLabs Flash v2.5: streaming provider implemented fail-closed. No credential was configured, so no ElevenLabs measurement is claimed.
- Qwen3-TTS VoiceDesign: retained and requalified as the high-quality STUDIO renderer.
- FFmpeg/Flite: retained and browser-qualified as the fast offline/final fallback.

The unchanged STUDIO application left approximately 26.3–35.0 seconds of inter-speaker silence in the four-turn browser run. The isolated LIVE path, using text prefetch plus Flite after the cloud billing failure, measured 0.633, 1.824 and 0.694 seconds (mean 1.050 seconds; median 0.694 seconds). This proves the routing, prefetch, fallback, telemetry and playback-gating design, not the desired natural cloud voice quality.

## Identical material

Every provider received exactly the same two lines:

**INTERVIEWER:** “So you're saying the entire economic strategy depends upon nobody actually asking that question? I hesitate to call that a plan.”

**GUEST:** “No, no. That's a complete misunderstanding. It depends upon nobody asking several questions—three before lunch, perhaps four after. Frankly, the numbers are the reassuring part.”

The total input is 305 characters. Voices are original AI-generated performers; no real person was cloned or imitated.

## Controlled provider measurements

Times are measured at the benchmark client on hpubuntu. “First playable estimate” is the first complete PCM sample for raw PCM or a complete decodable WAV header. Browser AudioContext measurements are reported separately.

| Provider | Role / voice | First byte | First decodable / playable estimate | Complete | Audio | RTF | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| OpenAI | interviewer / cedar | — | — | — | — | — | BLOCKED: Platform API 429, no credits |
| OpenAI | guest / marin | — | — | — | — | — | BLOCKED: not retried while circuit open |
| ElevenLabs Flash v2.5 | two configured identities | — | — | — | — | — | UNQUALIFIED: credential absent |
| Qwen3-TTS VoiceDesign | interviewer / natural-interviewer | 19,795 ms | 19,795 ms | 19,798 ms | 8,960 ms | 2.210 | PASS |
| Qwen3-TTS VoiceDesign | guest / natural-guest | 22,639 ms | 22,639 ms | 22,642 ms | 10,560 ms | 2.144 | PASS |
| FFmpeg/Flite | interviewer / awb | 223 ms | 223 ms | 224 ms | 8,500 ms | 0.026 | PASS |
| FFmpeg/Flite | guest / slt | 269 ms | 269 ms | 272 ms | 11,405 ms | 0.024 | PASS |

The OpenAI failure path selected Flite explicitly and emitted the failed/circuit-open OpenAI attempt in `x-tts-attempts`; fallback audio files are named `openai-fallback-*` and are not presented as OpenAI speech.

## Browser acceptance

The isolated application ran four real, unscripted Interview turns through two local LLMs. Playback completion still controlled ConversationEngine advancement. Turns two through four were generated while the preceding turn was audible, then held until playback ended.

| Turn | Selected speech provider | First byte | First decodable | First playable | Inter-speaker silence | Prefetched |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 1 | Flite after OpenAI 429 | 500 ms | 634 ms | 636 ms | n/a | no |
| 2 | Flite; OpenAI circuit open | 305 ms | 549 ms | 552 ms | 633 ms | yes |
| 3 | Flite; OpenAI circuit open | 429 ms | 598 ms | 601 ms | 1,824 ms | yes |
| 4 | Flite; OpenAI circuit open | 433 ms | 611 ms | 614 ms | 694 ms | yes |

Turn three was slower because the interviewer’s private answer analysis plus next-turn generation did not fully finish before the preceding 9.3-second playback ended. Causality remained intact: only text already present in the transcript was used, and no prefetched turn became audible early.

The unchanged port-18770 STUDIO run measured:

| Turn | LLM | Qwen complete-WAV generation | Approximate minimum inter-speaker silence |
| ---: | ---: | ---: | ---: |
| 2 | 837 ms | 25,625 ms | 26,462 ms |
| 3 | 2,533 ms | 23,731 ms | 26,264 ms plus private director analysis |
| 4 | 1,408 ms | 33,580 ms | 34,988 ms |

## Routing and fallback

`ConversationEngine` still knows only a stable participant voice and speech purpose. The speech router implements:

- `LIVE_FAST`: OpenAI, ElevenLabs, Flite.
- `LIVE_QUALITY`: OpenAI, ElevenLabs, Qwen, Flite.
- `STUDIO`: Qwen, OpenAI, ElevenLabs, Flite.
- `OFFLINE`: Qwen, Flite.

Failed providers enter a bounded circuit-open cooldown so every subsequent turn does not pay the same failing network timeout. Provider, model, profile, attempts, first byte, first decodable, first playable, stream completion, fallback and inter-speaker silence are persisted in turn telemetry.

## Cost

- OpenAI's current model page lists `$0.60 / 1M` text input tokens and `$12.00 / 1M` audio output tokens. The failed response supplied no billable usage, and the public documentation does not provide a defensible conversion from generated seconds to audio tokens here, so no per-minute amount is invented.
- ElevenLabs' current API pricing lists Flash/Turbo TTS at `$0.05 / 1,000 characters`. The 305-character script would therefore cost approximately `$0.01525`. At an explicitly illustrative 900 spoken characters per minute, that is about `$0.045/minute`, `$0.45/10 minutes`, or `$1.35/30 minutes`, before tax and subject to actual script density.
- Local providers have no per-request vendor fee. Electricity, GPU occupancy, maintenance and hardware depreciation are real costs and are intentionally not represented as zero.

## Naturalness

- Qwen remains the strongest locally qualified expressive option and preserves separate British interviewer/guest identities and delivery hints, but its 2.14–2.21 RTF makes it a STUDIO renderer.
- Flite is fast and clearly distinguishable but sounds like traditional synthetic speech. It proves reliability, not the radio-programme quality milestone.
- OpenAI and ElevenLabs naturalness are not rated because no genuine output was produced. A human listening comparison remains required even after credentials work.

## GPU and local limitation

Qwen loaded in about 2.1 seconds after a controlled service restart and occupied roughly 5 GiB beyond the protected llama baseline. The five-minute idle unload leaves about 3.8 GiB attached to the long-lived Python CUDA process on this host; its next reload can then fail the 7,600 MiB free-memory guard. A clean service restart restores the intended baseline. This bug is documented, not hidden or worked around by stopping protected llama services.

## Agent Control status

The authoritative checkout was inspected read-only at branch `release/3.2.0`, commit `beed6ee95453ef8505b4c14d224c53262e33a7b4`, clean.

Its existing `CapabilityRequest` / `CapabilityResolver`, provider resources, worker resolution, resource locks, `ActionRegistry`, verification boundary and evidence-bearing outputs are sufficient for a future `speech.synthesize@1` action. No Agent Control source was edited. The isolated application currently prototypes the routing policy locally; promotion should register provider resources advertising `speech.live`, `speech.streaming`, `speech.studio`, `speech.local` and `speech.postprocess`, then let Agent Control select a qualified resource.

## Recommendation

- `LIVE_FAST`: use OpenAI streaming PCM after Platform API billing is enabled and measured; keep ElevenLabs second and Flite final. Current status: architecture PASS, natural-provider qualification BLOCKED.
- `LIVE_QUALITY`: compare genuine OpenAI and ElevenLabs samples by human listening before choosing. Do not route to Qwen interactively unless a 20–35 second pause is acceptable.
- `STUDIO`: keep Qwen3-TTS VoiceDesign.
- `OFFLINE`: Qwen for quality/post-production, Flite for immediate speech and failure recovery.

No public deployment or LozKnowles.com change was made.
