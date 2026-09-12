# Spoken AI Studio 1.1.0

Recorded, accepted voices can now be explicitly enabled for all Fight Club
participant roles. Voice Lab saves an **Available in Fight Club** checkbox;
enabled profiles appear as **RECORDED: name — OmniVoice (synthetic)**.

Uses the existing installed worker and reference, without retraining or a second
model. Voice speed, turn WAV storage and stitched conversation MP3 use the existing
programme workflow. Expression is reference-dependent and synthesis is buffered.

Private/MFA deployment only; both Voice Lab and the separate participant opt-in
deployment switch must be enabled. Profiles default off; acceptance remains manual.
Unchecking blocks new synthesis, but does not remove exported conversations.
Private audio, conditioning data and credentials are not part of this release.
