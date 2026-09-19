# Prepared battle speech — experimental Phase 8

## Status and boundary

This is an opt-in feature branch, now deployed for authenticated private testing,
not a general production release. See [deployment evidence](CSM-PRIVATE-DEPLOYMENT.md).
The existing battle/conversation, judging, scoring, transcripts and Voice Lab code paths
are preserved. Prepared battles add a separate, bounded workflow (one to three rounds)
using the existing judge-score validation contract. Judging remains an LLM opinion.

1. Run two model lanes and retain exact text, model identity, token usage and response timing.
2. Complete the text-only judge and seal the benchmark record.
3. Queue Mallow introduction/transition, fighter responses, judge summary and result speech.
4. Play only after a user gesture and a complete clip is ready; continue preparing later clips.
5. Reuse unchanged clips through a verified, durable cache.

Speech generation, listening time and voice quality are excluded from model timing and
winner calculation. The displayed spoken text does not replace the authoritative answer.

## Configuration

Enable `FIGHT_CLUB_PREPARED_ENABLED=1` for `node server-spoken.mjs`, then visit
`/prepared-battle.html` behind the existing private hub/access controls. This interface
does not add a new authentication system and must not be exposed unauthenticated.

Server-only variables:

- `AGENT_CONTROL_SPEECH_URL`: HTTPS capability endpoint (loopback HTTP also allowed).
- `AGENT_CONTROL_SPEECH_TOKEN`: private bearer token, at least 32 characters.
- `FIGHT_CLUB_MODEL_ROUTES`: JSON model-name to OpenAI-compatible endpoint map.
- `FIGHT_CLUB_MODEL_API_KEYS`: optional JSON model-name to secret map; authenticated routes require HTTPS.
- `FIGHT_CLUB_PREPARED_MODEL_ROUTES` / `FIGHT_CLUB_PREPARED_MODEL_API_KEYS`: optional prepared-battle-only overrides, leaving legacy conversation models unchanged.
- `FIGHT_CLUB_DATA_DIR`: private persistent battle/evidence/audio storage outside the checkout.
- `FIGHT_CLUB_PREPARED_REPLAY_ONLY=1`: disable generation/configuration mutations in a copied replay viewer.

Do not put actual secrets in examples, shell history, browser state, URLs or Git.
Keep recordings, anchors, generated audio, runtime-private.json and caches outside Git.

`scripts/start-prepared-qualification.mjs` is specifically for the existing hpubuntu
qualification installation. It starts only isolated loopback processes, reuses installed
model artifacts and writes restricted private runtime state. It is not a portable installer.
`refresh-prepared-qualification.mjs` validates its own process identities before restarting
those processes; it must never be pointed at production. `qualify-prepared-battles.mjs`
runs real local/API/mixed models and can consume API credit. `replay-prepared-qualification.mjs`
serves copied evidence locally without speech credentials or GPU generation.

## Speech interface and integrity

Generic JSON POST capabilities are `speech.synthesise`, `speech.capabilities`,
`speech.cancel`, `speech.health`, `speech.cache` and `speech.evidence`. The server-side
client verifies returned text/audio hashes. The optional CSM Python worker is isolated
behind the generic JSON worker transport; Fight Club does not import Sesame libraries.
An optional typed adapter was also developed in an isolated Agent Control worktree;
Agent Control production routing has not been changed by this branch.

Fixed voice IDs are `fighter-a`, `fighter-b`, `mallow`, each with a reference revision.
All are original generated performers, not real-person imitations. CSM uses identical
settings for both fighters: FP16, temperature 0.9, sampling enabled, seed 520000,
maximum 2048 new tokens. Voice identity is separate from those settings. The faster
route retains its legacy voice-specific delivery instructions and is not a controlled
voice-quality comparison. Its declared 24 kHz PCM is wrapped as WAV for browser playback.

Cache identity binds exact transcript hash, voice identity/revision, checkpoint,
generation settings and codec version. Evidence includes audio SHA-256, duration,
generation/request latency, real-time factor, hit/miss, watermark and fallback/cancel
events. Browser playback events are reported separately and are not benchmark evidence.

Blind mode exposes Fighter A/B rather than model names. Known model-name disclosures
are withheld from public speech/text while original answers remain in private evidence.
This is not a guarantee against arbitrary identifying content or stylometric inference.

## Qualification performed on 19 September 2026

| Check | Result |
| --- | --- |
| LLM FIGHT CLUB SPEECH INTEGRATION | Real prepared battles through generic RPC; optional Agent Control adapter tested separately, not promoted |
| DISTINCT FIGHTER VOICES | Fixed, different synthetic anchor hashes; final perceptual assessment belongs to listener |
| MALLOW HOST VOICE | Introductions, transition, judge summary and result generated and played |
| BLIND MODE INTEGRITY | API and mixed public projections checked; original identities retained privately |
| BENCHMARK TIMING ISOLATION | Exact response hashes and sealed results; regression coverage for enabled/disabled/failed speech |
| AUDIO CACHE | Real repeated intro was a verified same-audio-hash hit; changed-input invalidation covered by regression tests |
| TEXT-ONLY FALLBACK | Automated failure/cancellation tests; no claim of completed real backend-outage drill |
| MOBILE PLAYBACK | 390px Chromium layout and byte-range media verified; physical phone/Safari testing pending |
| WATERMARK/EVIDENCE | Hash-bound evidence retained; watermark NOT_APPLIED; application downloads disabled |
| END-TO-END SPOKEN BATTLE | Six clips played continuously in browser without media errors, with independent text judging |
| PRODUCTION READINESS | Experimental private testing deployment; not qualified for unrestricted production; remaining gates below |

Real model matrix (not fixtures):

| Lanes | Battle ID | Complete audio |
| --- | --- | --- |
| Qwen2.5 3B / Qwen2.5 Coder 3B | ff3ead8f-187b-43c4-81bd-7224f4c87778 | 54.48 s |
| GPT-4.1 mini / GPT-4.1 nano (2025-04-14 snapshots) | eda14694-068c-4e42-a054-e4f562e30916 | 84.96 s |
| Qwen2.5 3B / GPT-4.1 nano | eea56993-b087-4714-9f49-951f9100946a | 63.84 s |

Detailed local/private evidence remains outside Git at
`/fast/qualification/fight-club-phase8-20260919/qualification.json`.
The first battle generated clips at roughly 3.0–3.7 times audio duration; model load
was 6.18 s and reported peak tensor allocation reached approximately 3.53 GB.
That allocation is not whole-device VRAM, which includes protected workloads.
The exact CSM checkpoint hash is
`2e7721144afe38b906d4f1048671da639fe142423f4a26283606ecebe894f4bf`.

The owner requested and received a separate unwatermarked local WAV review copy.
That did not enable application downloads, change source evidence or publish audio.

## Remaining gates

- Human assessment of all voice identities, naturalness and long-run consistency.
- Watermark/export policy qualification before enabling downloadable battle audio.
- Physical mobile playback, and a final real cancellation/outage drill.
- Active CSM inference is not GPU-preemptible: queued work cancels and late output is discarded.
- Captions use duration-based approximation, not forced alignment or word timestamps.
- This is prepared turn-based speech, not low-latency streaming or full duplex.
- The final cache-binding/range/PCM hardening has automated coverage; the complete
  three-battle matrix was run before those final hardening changes. The subsequent
  private deployment runs a fresh local-model CSM battle against the hardened release.
- Two optional Agent Control adapter tests and its targeted typecheck passed; the
  full Agent Control typecheck encountered an unrelated missing `undici` dependency.

Run `npm test` for regression coverage. Qualification scripts are explicit opt-in,
not part of the default test run, and must respect protected workloads.

Publication checks on 19 September 2026: Windows `npm test` reported 104 passed,
zero failed and one explicitly Linux-only test skipped (105 total). Gitleaks 8.30.1
reported no leaks in the working files and all 44 reachable commits before the
publication commit. A blank-example-field false positive was resolved by separating
empty credential examples with explanatory comments, not by suppressing a rule.
Secret scanning is evidence of checks performed, not a guarantee against every
possible undiscovered credential. Private runtime, voice and generated audio assets
are not part of this publication.
