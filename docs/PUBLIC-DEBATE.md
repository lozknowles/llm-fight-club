# Public LLM Debate

The portfolio hosts LLM Fight Club at `https://www.lozknowles.com/llm-debate.html`.
It uses a separate application instance and storage directory. The private Studio,
Voice Lab, prepared battles, enrolled voices and saved private conversations remain
on their existing authenticated deployment.

## Public instance configuration

Run `node server-spoken.mjs` from the pinned release with:

- `FIGHT_CLUB_PUBLIC=1`
- `FIGHT_CLUB_PUBLIC_ORIGINS`: comma-separated exact public HTTPS origins
- `FIGHT_CLUB_PUBLIC_PATH=/llm-debate/`
- `FIGHT_CLUB_DATA_DIR`: a dedicated, empty public-instance storage directory
- `FIGHT_CLUB_MODEL_ROUTES`: explicit local model names mapped to existing endpoints
- `FIGHT_CLUB_CSM_MENU_ENABLED=1`: expose the three original CSM synthetic voices
- `AGENT_CONTROL_SPEECH_URL` and `AGENT_CONTROL_SPEECH_TOKEN`: server-only access to
  the existing CSM capability; keep the runtime environment outside source control
- `VOICE_LAB_ENABLED=0` and `FIGHT_CLUB_PREPARED_ENABLED=0`
- `HOST` and `PORT`: the private reverse-proxy network address and a dedicated port

No new model or speech worker is required. Public conversations default to CSM
Fighter A and Fighter B, with Mallow for a referee or third participant. Voice
identities and settings are pinned per conversation. Public mode exposes neither
the capability token nor Voice Lab or the prepared-battle APIs. It does not load
cloud or voice-enrolment credentials. The existing CSM audio-export gate is retained;
saved replay remains available. The key-free Flite configuration is still supported
when the separate CSM menu flag is off, with an explicit local voice catalogue.

The reverse proxy must replace untrusted `X-Forwarded-For` before appending the
actual client address. Expose only this new instance beneath `/llm-debate/`.
Retain HTTPS, a same-origin CSP and `camera=(), microphone=(), geolocation=()`.
The homepage wrapper and shared site assets are deployed by the portfolio repo.
`FIGHT_CLUB_PUBLIC_INSECURE_LOCAL=1` is for loopback tests only.

## Visitor access and limits

There is no login. An opaque, secure, HttpOnly, SameSite=Strict cookie identifies
the browser; only its hash is stored with a conversation. Every conversation read,
mutation, export and audio request checks that ownership. No earlier private record
is imported. POST requests require an exact allowed Origin; cross-site requests,
Voice Lab, prepared battles and unlisted asset routes are rejected.

Each address can create four debates and generate 24 turns per hour, with a global
limit of 24 new debates and 120 turns per hour. One reply is generated at a time.
Speech has separate admission/concurrency bounds. Each debate allows two to six
turns. Speakers take turns; public prefetch and autonomous interruption generation
are disabled. Up to two audience curve balls can be admitted within the six-turn
budget. The private instance retains its original behavior.

Only the owning browser can revisit its saved debates. The public instance's copies
expire after 24 hours and are removed by its minute-level cleanup. The existing CSM
capability also retains its independent speech cache; the UI discloses server-side
processing and cached speech without claiming that this cache is purged after 24 hours.

## Verification

`node --test test/*.test.mjs` includes public-session isolation, cross-origin checks,
private-route denial, limits, voice/model restrictions and a two-visitor HTTP flow.
These are independent of the live model workers. Release qualification must also
run a real spoken debate, saved replay, mobile layout and unauthenticated public
navigation without using a file-store session.
