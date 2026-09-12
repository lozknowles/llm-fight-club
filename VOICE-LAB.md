# Voice Lab — implementation and operator qualification

Status: isolated development feature. Operator approved private qualification activation on 12 September 2026; the existing worker extension is now active and technically tested. Not merged, released, publicly deployed, or physically qualified. No Loz voice has been recorded, created, or accepted by this work. See the dated activation addendum in `VOICE-LAB-QUALIFICATION.md`; older inspection notes below describe the pre-activation state.

## Actual installed OmniVoice

### Noisy input troubleshooting (12 September 2026)

New recordings default to Speech cleanup: browser noise suppression and echo cancellation requested, automatic gain disabled. Raw capture remains available for a quiet studio. The UI reports actual processing settings (or not reported), so requested support is not presented as verified support. Mode changes release the microphone and require an explicit Enable microphone action.

The meter displays all signal, not just speech; its bar is magnified fivefold for visibility without altering recorded samples. RMS dBFS is also displayed. Level checks cannot distinguish noise from speech. Listen before accepting: if background noise buries the voice, compare the selected USB microphone with the built-in array, use headphones and speak close to the mic. Do not accept a noisy reference or try to fix it merely by boosting everything.

Original-recording noise was reported during operator testing. Capture changes passed software regressions but still require a fresh physical listening test; existing recordings and consent are unchanged.

Read-only inspection on hpubuntu, 12 September 2026:

- Existing editable package: `/fast/work/omnivoice-social-voice-20260905`, version **0.2.1**.
- Existing runtime: `/fast/work/omnivoice-social-voice-20260905/.venv/bin/python`.
- Existing model: `/fast/qualification/agent-control-social-voice-20260905/omnivoice-model`.
- Worker source: `/fast/work/agent-control-social-voice-20260905/scripts/speech-worker.py`.
- Model revision in that worker: `c5fdb5ccb189668d56333f77ba2629f4cd7535f4`.
- Installed `VoiceClonePrompt` holds reference audio tokens, reference text and reference RMS. `create_voice_clone_prompt` accepts a clip plus its text; `generate(..., voice_clone_prompt=prompt)` reuses it. This is **zero-shot conditioning**, not fine-tuning or speaker-embedding training.
- Installed source recommends a 3–10 second reference. The UI accepts 3–15 seconds, requires six categories, permits six optional alternatives, and chooses the accepted clip nearest eight seconds, tie-breaking by sample index. It does not claim that combining all recordings improves the clone.
- The running worker exposes designed-voice synthesis and transcription only. It does **not** yet expose the new conditioning routes.
- P5000 snapshot: 14,723 / 16,384 MiB occupied. No second model load was attempted.

## Components and boundaries

`public/voice-lab.html` is linked from Spoken AI Studio. It contains consent, microphone setup, guided recording, A/B qualification, acceptance, role assignment, optional demonstration capture and a real-bout qualification runner.

`VoiceLab` is a provider-neutral state machine and sensitive-asset store. `OmniVoiceEnrolmentProvider` implements its `health`, `create` and `synthesize` contract. No OmniVoice import was added to ConversationEngine.

`speech/voice_lab_worker_extension.py` adds authenticated routes to the existing worker's serialized HTTP handler. `scripts/run-voice-lab-worker.py` is an **opt-in startup wrapper**, not a separate model server. It executes the unchanged existing worker source with its existing arguments, wraps its handler at HTTPServer construction, and reuses the already-loaded `model` object. Legacy routes, authentication and the single request queue remain in place. It fails closed if the expected worker globals are absent. This startup integration has not been activated against the live worker.

The representation is bounded numeric JSON containing the supported VoiceClonePrompt fields. No user-supplied pickle, Torch checkpoint, path or URL is loaded. It is reconstructed as `VoiceClonePrompt` at synthesis. Generation uses the existing model, sixteen steps, and no pitch shift of the enrolled voice.

## States and consent

`RECORDING → UNQUALIFIED → TESTED → ACCEPTED`.

Technical generation sets `technical_generation_success`; it does not set `user_acceptance`. Acceptance requires both comparison playback reports and the explicit ACCEPT VOICE request for the latest test/revision. These reports record an operator/browser action, not biometric verification or proof of human hearing. Final judgement belongs to the operator.

Consent boxes default false and must all be true, with the current version and SELF / AUTHORISED_OTHER declaration. Store only display name, profile ID, consent/version/time/relationship, measurements, provenance hashes and qualification metadata. No legal identity documents are collected.

Recording starts only on Record. Enable microphone acquires permission and enables an input meter but does not capture a take. Each stopped recording releases the microphone. The worklet caps takes at fifteen seconds; changing tabs while recording stops the take. Record is unavailable without a consented profile, microphone and recording state.

Quality checks validate canonical mono 24 kHz PCM16 WAV, duration, RMS, peak, clipped sample fraction and low-energy frame fraction. They do not perform speech recognition, calibrated noise/SNR measurement, speaker verification or likeness scoring. The operator confirms that the take matches the displayed text. Background noise can pass these energy checks: listening matters.

Add sample permits an alternative or replacement take and removes acceptance. Re-qualify keeps conditioning but clears tests/acceptance/roles. Reject clears conditioning and tests, retaining takes for revision until deletion. Re-enrol deletes the existing profile only after a clear confirmation and returns to unticked fresh consent.

## Private storage and access

Default: `$FIGHT_CLUB_DATA_DIR/voice-lab-private/<UUID>/`:

- `profile.json`: consent, source hashes, provider version, qualification and roles.
- `sample-N.wav`: accepted raw takes (up to twelve).
- `representation.bin`: opaque provider conditioning JSON, not public/exported.
- `test-UUID.wav`: new-text synthetic comparisons (up to twelve per qualification cycle).
- `role-UUID.wav` and `.json`: generated role audio and synthetic disclosure metadata.

Folder creation requests 0700; files request 0600 on POSIX. On Windows, use an owner-only NTFS directory; POSIX mode flags do not set a Windows ACL. Host/volume encryption and backup policy are operator responsibilities, not implemented encryption. Do not include this directory in public backups, Git or a static-file root. `.data-v2` and `voice-lab-private` are ignored by Git.

Deletion removes the exact validated UUID directory, including recordings, conditioning, tests, and generated role speech. No identity audit survives deletion. Filesystem snapshots, backups, browser downloads or published copies are outside application deletion; operators must remove them separately. No secure-erasure claim is made.

Every Voice Lab API route, including profile lists, WAV playback, tests, role synthesis and judgement, requires a dedicated access-key header. Keys are never URLs, cookies or localStorage. Media is fetched with the key and played from temporary blob URLs. Responses are private/no-store and nosniff; cross-site browser requests are refused and no CORS access is granted. Voice Lab is disabled by default. The worker uses a separate dedicated token; the ordinary worker token alone cannot use enrolment routes.

This v1 is an owner-operated private lab. All holders of its access key have access to the same profiles; per-user tenancy and delegated profile ACLs are not implemented. Keep it behind the existing private hub/MFA for any later network deployment, and do not trust a client-supplied owner header. A hidden URL is not access control. Live hub authentication has not been changed by this feature.

## Configuration and controlled activation (not performed)

App process, in an isolated test environment:

```
VOICE_LAB_ENABLED=1
VOICE_LAB_DATA_DIR=<owner-only directory outside source/public>
VOICE_LAB_ACCESS_KEY=<separate random owner access secret, at least 32 characters>
VOICE_LAB_WORKER_URL=http://127.0.0.1:19194
VOICE_LAB_WORKER_TOKEN=<separate random worker secret, at least 32 characters>
```

Keep both secrets in a private environment file, never a committed example, chat, URL, command log or video. `VOICE_LAB_WORKER_TOKEN` must also be available to the worker wrapper. Existing unrelated service configuration and credentials must be preserved.

Before activating the wrapper: obtain explicit authority to change/restart the named existing worker; check that no protected jobs or conversations are active; save a recoverable service override; keep exactly the existing model/state/device arguments; replace only the startup command with the wrapper using the existing virtualenv. Do not run a second copy alongside it on the P5000. Verify legacy health/synthesis as well as the new conditioning capability and monitor VRAM. Rollback restores the original startup command. This repository intentionally does not execute a service install/restart.

For MSI microphone qualification, serve the isolated application on localhost with an authenticated loopback SSH connection to the worker, or an explicitly approved private HTTPS test route. No new public route is required. Do not use plain remote HTTP for microphone permission or transfer voice material over an unencrypted network connection.

## Role use and real bout

Only accepted profiles can receive ANNOUNCER and COMMENTATOR. Neither role is an Agent Control authority identity or a competitor impersonation. Live UI always states “Synthetic voice — authorised profile”; generated role metadata has a configurable publication disclosure flag. No video overlay or removal of external copies is implied by that metadata flag.

The Voice Lab bout runner uses the existing conversation API for a real single-round, two-competitor debate, announces competitors and round, plays model arguments through existing distinct built-in voices, and requests a schema-validated LLM judgement of the completed transcript. It announces scores and either a winner or tie. Judge failure must not invent a winner. Results are clearly labelled LLM opinion; the first competitor's configured model is also used in a separate judge call, so this is not an independent-model benchmark.

The runner retains its announcement/commentary-only demonstration. Since 1.1,
an accepted profile can separately opt into ordinary conversation-format voice
dropdowns using **Available in Fight Club**. This defaults false and requires an
authenticated explicit boolean update; it does not change Agent Control authority.
The protected deployment must set `VOICE_LAB_FIGHT_CLUB_ENABLED=1`. Only opted-in,
accepted IDs and labels enter the catalogue. Every new synthesis rechecks both
conditions; unchecking or resetting prevents further use. Existing generated
conversation WAV/MP3 files remain in the conversation archive. This permission
allows private Studio users to generate fictional participant dialogue in the
synthetic voice, not to claim endorsement by the real person.

Synthesis is serialized on the shared existing worker. No cancellation of already-started GPU inference or streaming conditioning is implemented. Stop stops playback and the bout, prevents subsequent announcements/results, and may wait for an in-flight request to finish. Naturalness and latency require real measurement, not mock assertions.

## Operator physical qualification — pending

1. Review isolated activation and preservation of existing services. Open Voice Lab on authorised localhost/HTTPS.
2. Unlock privately; keep key entry out of any video. Start optional demonstration capture and select only the app tab with audio. Requested resolution is 1920×1080, but the saved metadata must report actual dimensions/audio presence.
3. Show unticked consent, choose display name **Loz**, SELF, and personally tick all confirmations. Continue.
4. Select the intended microphone explicitly. New/empty enrolments display four sentences: warm conversation, curious question, firm disagreement and reflective reassurance. Read the delivery hint silently and the large sentence aloud. Enable the microphone, Record, Stop, play back, confirm and accept or re-record. After saving, click Ready for sentence N when ready to continue; capture never starts automatically. Saved progress resumes at the first missing sentence. Profiles containing older recordings keep their six original prompts; create a separate new enrolment for four without deleting old takes.
5. Create conditioning. Generate new-text tests, play original and synthetic comparisons. The operator must personally choose ACCEPT VOICE, add samples or reject.
6. After acceptance, assign ANNOUNCER and COMMENTATOR. Start the real bout and listen to introduction, model arguments, round, judgement and winner/tie announcement.
7. Save the bout evidence JSON. Stop/save video; inspect the actual video and audio for completeness, resolution and privacy. Do not splice out failures or label an unsuccessful workflow qualified.
8. Record generation latency, audio duration, RTF, worker health/resource observations, subjective likeness, and explicit operator acceptance. No merge/release/deployment follows automatically.

The optional browser video recorder is limited to fifteen minutes to bound memory. Some browsers do not provide tab audio; that is reported, not hidden. It does not record a separate microphone feed. Original sample playback and generated speech must be audibly present in the final video; use an authorised local recorder if browser capture cannot supply that evidence.

## Verification

`npm test` runs existing regressions and new consent, persistence, quality, rejection, role, deletion, concurrency, auth, provider-failure and judge tests. `python test/voice_lab_worker_test.py` checks reference format, numeric conditioning bounds and the extension's dedicated-key requirement without loading a model. These use artificial fixtures and are **not physical qualification**.

See `VOICE-LAB-QUALIFICATION.md` and `TODO.md` for the current evidence and uncompleted gates.
