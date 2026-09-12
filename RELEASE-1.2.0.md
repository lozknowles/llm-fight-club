# Spoken AI Studio 1.2.0

- Stable built-in OmniVoice identities using fixed original-synthetic references.
- Next-turn audio preparation during current playback, with obsolete-result guards.
- No spoken posture/stage directions or speaker-name prefixes.
- Accurate media-duration accounting and stale playback-event rejection.
- No silent switch to another provider's voice; failed speech can be retried.

Private/MFA deployment only. Your recorded profiles and acceptance are preserved.
Reload and start a new conversation; saved historical dialogue is not rewritten.
Short turns may still finish before synthesis is ready. Cancelling does not stop
an already-running model calculation, but its obsolete result cannot play.
