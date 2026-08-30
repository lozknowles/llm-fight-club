# Qualification status — 2026-08-29

## Passed

- General format/state tests: Interview, Debate, Panel and Cross-examination.
- Twelve total automated tests passed.
- Real local-model Interview completed four turns: Qwen 2.5 3B interviewer and Qwen 3 8B guest.
- One private director analysis generated an unscripted follow-up that directly addressed the guest's preceding claim.
- Real local-model Debate completed two turns through the same engine.
- Transcript JSON persisted per turn with model, voice, text, generation latency, token data where available and playback completion duration.
- The app is private on hpubuntu's Tailscale address; both model endpoints remain loopback-only.

## Not yet qualified

Audible browser playback has not been independently observed by Codex because the desktop browser controller failed to start with Windows `CryptUnprotectData` errors. The UI uses real `speechSynthesis` voices and `onend`-gated advancement, but this remains implementation evidence, not a playback PASS, until a browser run reaches `COMPLETED` with non-simulated playback durations.

The first Debate sample also fabricated an unsupported percentage despite explicit prompt rules. Factuality hardening/retry remains required before Debate content quality can pass.
