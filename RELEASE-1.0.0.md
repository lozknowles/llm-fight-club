# Spoken AI Studio 1.0.0

## Release scope

- Debate, interview, panel and cross-examination with reusable personalities,
  distinct voices, transcripts, playback controls, interventions and audio export.
- Optional private Voice Lab using the existing installed OmniVoice worker:
  explicit consent, four guided expressive readings, microphone selection and
  cleanup, save receipts, original/synthetic comparison and explicit acceptance.
- Enter a custom sentence (up to 500 characters), Generate voice, Play synthetic.
- Accepted voice profiles support announcer/commentator presentation roles only.
- Source, tests, README, changelog, architecture and operator documentation.

The operator authorised this GitHub release and protected-site deployment on
12 September 2026. This is an internal release, not anonymous public voice cloning.
The repository remains private. No voice recordings, conditioning data, API keys,
access keys, consent records or third-party model weights are release assets.

## Evidence and limits

The operator recorded four USB-microphone samples, listened to original and
synthetic audio, explicitly accepted the voice and assigned both presentation
roles. The application persisted these states. Listening reports are application
evidence, not a biometric identity test or independent audio-quality score.

Automated suite: 77 Node tests, plus the existing Python worker-extension checks.
Tests using artificial audio/provider doubles are not physical qualification.
Installed OmniVoice reference-conditioning was separately exercised with a new
original synthetic reference before the operator enrolment.

Remaining limitations:

- One selected reference conditions OmniVoice; four recordings are alternatives,
  not fine-tuning or learned independent emotional styles.
- Level checks do not establish speech accuracy or a calibrated signal/noise ratio.
- Voice Lab has a shared owner key, not multi-user/per-profile authorisation.
- Twelve test generations per qualification cycle; audio remains private.
- Local microphone enrolment is qualified; the HTTPS microphone flow needs an
  operator browser check following deployment. No automated microphone/consent
  action is performed during release verification.
- No accepted-voice full-bout/video qualification is claimed by this release.
- Existing interrupted-turn archive limitations and lack of TTS look-ahead remain;
  this release does not introduce full-duplex speech.
- Model/voice-provider licence suitability for wider or commercial use remains a
  separate gate. This release does not grant third-party model or voice rights.

## Deployment and rollback

Keep the protected Private Hub route, its MFA policy, no-store headers and
microphone permissions. Do not add an anonymous Apache route. Install the release
in a separate immutable checkout; point only the existing internal application
service at it. Preserve its model/speech routes and conversation data directory.

Pass only the Voice Lab settings from the existing private environment file to
the release service. Keep the existing private profile directory in place. Stop
the development preview before enabling the release writer: Voice Lab locks are
process-local, so two application processes must not write the same profile store.
Do not restart the shared OmniVoice worker or alter Agent Control source.

Back up the original application unit/drop-ins first. To roll back, stop the
release application, disable its named release drop-in, reload user systemd and
restart the original application. The previous localhost Voice Lab preview can be
started for recovery only after the release writer is stopped. Never restore old
profile data over newer user recordings. Keep the protected portal and MFA intact.
