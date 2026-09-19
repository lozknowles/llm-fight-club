# CSM private testing deployment — 19 September 2026

## Initial deployed application

- Source commit: `8c75454c67ca2b0e3576dd7f9b8b829438f1d70a`.
- Immutable checkout: `/fast/releases/spoken-ai-studio-csm-20260919`.
- Internal app: `llm-fight-club-app-internal.service`, existing private endpoint.
- CSM service: `llm-fight-club-csm-capability.service`, loopback `127.0.0.1:19396`.
- Open `/prepared-battle.html` under the existing authenticated Studio prefix on
  `files.lozknowles.com`. The existing Studio page also links to CSM battle creation.
- Private hub authentication, SMS login, reverse proxy and public-site app were not modified.

The subsequent main-menu promotion adds `csm-fighter-a`, `csm-fighter-b`, and
`csm-mallow` to the existing conversation voice dropdown. Open the normal Studio
page with `?profile=CSM` to select those three defaults, or choose them individually
alongside other providers. Existing `?profile=OMNIVOICE` defaults remain unchanged.
The main-menu application is promoted to a separate immutable `-menu` release;
the managed speech worker stays on its previously verified code and remains warm.
The deployed main-menu code is commit `0e085c03804651ae7d45fc5a3f64ed1e10830503`
at `/fast/releases/spoken-ai-studio-csm-20260919-menu`.

`CapabilityMenuProvider` bridges the existing speech path to the generic capability
service. Conversations pin the voice/checkpoint/settings at creation; previews resolve
the current qualified identity. Cached preparations retain the speech evidence, while
pitch-preserving speed changes are labelled as presentation transforms. Heat and
delivery settings do not promise unsupported CSM expressive controls. CSM-containing
conversation downloads remain disabled under the same pending watermark/export gate.

The live prepared-battle catalogue includes two local Qwen models and the previously
qualified GPT-4.1 mini/nano API snapshots. It is not replay-only. Existing conversation
model settings remain separate. Recorded voices and conversation storage paths were
retained without migration or deletion.

## Validation

- 109/109 tests passed on hpubuntu; Windows: 108 passed, one Linux-only test skipped.
- Gitleaks working-file scans found no credentials; private runtime files are outside Git.
- Managed worker reached ready state and passed exact voice-revision/checkpoint checks.
- Page and API requests without a private-hub session redirect to login (HTTP 303).
- Private credential directory is mode 0700; environment files are mode 0600.
- Both protected local model health checks remain healthy after deployment.
- Fresh battle `bb558a6e-0306-4abb-97ce-93a18c633218` completed model execution and
  independent text judging. Intro/transition reused cached audio while new fighter
  speech was prepared by the managed worker. All six clips completed browser playback
  without media errors over the private network, totalling 56.24 seconds. Audio hashes
  matched their evidence and the benchmark hash remained unchanged. Byte-range playback
  returned HTTP 206 with the requested 100 bytes.

- Signed-in external main-page qualification completed through the normal private-hub
  session: conversation `15592e33-4aa9-4804-a0c1-179fb970cbc2`, two local models,
  CSM Fighter A and Fighter B. Both turns reached completed playback without a page
  error (6.00 and 9.76 seconds). Synthesis took 19.39 and 29.99 seconds; model response
  timing remained separately reported as 1.015 and 2.781 seconds. Both turns retained
  distinct pinned voice revisions, identical generation settings, transcript/audio
  hashes and `NOT_APPLIED` watermark evidence; audio exports remained disabled.
- Post-deployment API-only text battle `7c826a19-d670-42fa-a670-478f4bd8f953`
  completed independent judging, confirming the prepared API routes remain usable.

No credentials or cookies were copied into qualification scripts to bypass MFA.

## Recovery

The deployment manifest and environment files are in
`/fast/work/llm-fight-club-csm-private-20260919`, outside source control. They contain
private configuration and must not be attached to issues or logs.

To restore the previous internal app after inspecting live state:

```sh
cd /fast/releases/spoken-ai-studio-csm-20260919
node scripts/deploy-csm-private.mjs rollback
```

After a main-menu promotion, use the current release directory recorded in the private
manifest instead (the `-menu` checkout). The same rollback removes the current CSM
override and restores the pre-CSM app. `promote` validates the previous override before
switching application code and does not restart the speech worker.

The helper verifies its deployment override hash, preserves it as a rollback artifact,
restores the previous service definition and stops only the dedicated CSM service.
It retains all speech data and private configuration. It does not alter Apache, SSH,
Agent Control, model servers, saved voice profiles or private-hub sessions.

## Limits

Private experimental release only: CSM remains slower than real time. Watermark status
is `NOT_APPLIED`, so application audio downloads remain disabled. Active GPU generation
cannot be preempted; cancellation discards its eventual output. Captions are approximate.
Physical mobile/Safari playback and human assessment of voice consistency remain open.
