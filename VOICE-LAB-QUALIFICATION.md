# Voice Lab qualification evidence — 12 September 2026

## Operator enrolment and release gate — current status

The operator has now physically recorded four samples using the USB microphone,
played original and synthetic comparisons, personally accepted the voice and
assigned ANNOUNCER and COMMENTATOR. The stored profile reports ACCEPTED with
four samples and two tests. No private audio or identifying profile records are
included in this document or the release.

The operator explicitly requested GitHub release 1.0 and protected-site deployment.
Automated Node coverage now totals 77 passing tests. A full accepted-voice bout,
independent likeness scoring and protected HTTPS microphone capture are not yet
qualified. Earlier NOT performed/zero-profile statements below are historical
snapshots and are superseded by this addendum, not current release status.

## Approved private browser access — 12 September

Operator explicitly approved the one additional SSH forwarding destination and confirmed SSH uses **port 2222**. Effective policy for user loz is now local forwarding only, with `PermitOpen 127.0.0.1:4173 127.0.0.1:8766 127.0.0.1:18891`. No other destination or public listener was added.

The exact pre-change policy was checked before modification and backed up at `/var/backups/49-loz-local-forwarding.before-voice-lab-20260912.conf`. `sshd -t` and effective-policy validation passed; SSH was reloaded, not restarted. Existing app, worker and SSH services remained active.

An MSI loopback listener forwards `127.0.0.1:18891` over authenticated SSH **2222** to the same remote loopback port. Browser navigation to `http://127.0.0.1:18891/voice-lab.html` now succeeds. The page is left locked with no microphone or capture started. A separate authenticated API check through this tunnel returned the installed OmniVoice reference-conditioning capability and **zero enrolled profiles**.

The owner access key is in an MSI local file restricted to MSI\\Loz and SYSTEM, not in source, chat, URL or browser storage. The user must unlock the page, tick their own consent, initiate Record and personally accept or reject the comparison. The earlier forwarding-block note below is retained as history and is now resolved.

## Approved private activation — 08:14 BST, 12 September

The operator explicitly approved controlled restart of the existing shared OmniVoice worker. Added only a named service drop-in using the unchanged existing worker source, original virtualenv/model/state arguments, resource limits and existing authentication. No second model was loaded. Separate owner/worker keys were generated into owner-only private files, never Git or tool output.

Actual checks passed:

- Legacy `/health` returned ready, legacy `/synthesize` generated a fresh original synthetic reference.
- New `/voice-lab/health`, `/create` and `/synthesize` worked using the installed OmniVoice 0.2.1 and same GPU model.
- Legacy worker credentials were rejected with HTTP 401 on the new enrolment routes.
- Reference was **newly generated synthetic speech, not a human recording**. No human consent or acceptance was simulated.
- Original synthesis: 7.08 s audio, 3.107 s generation, RTF 0.439.
- Reference-conditioned synthesis: 7.12 s audio, 4.411 s generation, RTF 0.619.
- Existing-worker model load after controlled restart: 11.744 s.
- CUDA process peak since worker startup: 3,742,754,304 bytes (not whole-GPU usage). Whole GPU after checks: 12,933 MiB.
- Live app and speech router remained active. The canonical app source remained unchanged.

Private technical evidence: `/fast/work/llm-fight-club-voice-lab-private-20260912/worker-verification.json` and its `technical-evidence/` WAVs. No Loz profile exists and physical microphone/video/likeness/bout acceptance remains pending.

Isolated app service `llm-fight-club-voice-lab-preview.service` is healthy on **remote loopback 127.0.0.1:18891**. Browser access from MSI is currently blocked by the SSH account's `PermitOpen` policy: only 4173 and 8766 are allowed, and both host existing services. No SSH policy was changed and those ports/services were not repurposed. Opening the one additional loopback forwarding destination requires operator approval. There is no new public listener or public website route.

The sections below preserve pre-activation implementation evidence; this dated addendum supersedes their worker-activation status only.

## Implementation / branch

Branch: `feature/voice-lab`, based on `c75ef36`.
Implementation commit: `d4fb44a` (subsequent verification/hardening commits are on the same branch; use `git rev-parse HEAD` for the exact current head).
Local isolated worktree: `work/llm-fight-club-voice-lab-20260912` in the current task workspace.
Isolated hpubuntu checkout: `/fast/work/llm-fight-club-voice-lab-20260912`.
The live checkout `/fast/work/llm-fight-club-omnivoice-final-20260906` was inspected read-only and remained at `c75ef36`.

## Automated and browser evidence

- Node regression suite: 69 passing tests on both MSI and hpubuntu (54 existing, 15 Voice Lab additions).
- Python extension tests: reference format/length, bounded safe conditioning format, dedicated key and preservation of legacy handler routing. Run with the existing OmniVoice virtualenv, without loading its model.
- JavaScript syntax checks for server, UI, video and AudioWorklet: passed.
- Browser preview: localhost-only isolated Node process; ordinary/model worker URLs not used to generate anything.
- Locked page rendered without JavaScript errors.
- With a disposable test-only access gate, the browser displayed the real consent section with all three boxes at value 0 and Continue disabled. No box was ticked; no profile was created; no microphone permission was requested.
- Worker unavailable appeared explicitly: “Voice Lab worker is not configured; ordinary voices are unaffected.”
- Browser screenshots/AX observations are development evidence, not a physical enrolment recording.

Artificial WAV signals and provider doubles in regression tests do not count as speech or microphone qualification.

## Physical gates — NOT performed

| Requirement | Actual status |
| --- | --- |
| Existing installed OmniVoice source inspection | Verified 0.2.1 and reference-prompt API |
| Live conditioning extension | Prepared only; not activated |
| New model installation / second GPU model | Neither performed |
| Microphone capture | Not started |
| Loz profile | Does not exist from this implementation |
| User acceptance | Not given; no ACCEPT VOICE action |
| Real cloned-voice bout | Not run |
| Bout scores / winner | No result to report |
| Physical video | Not captured; capture UI implemented, unqualified |
| New voice latency, likeness, VRAM peak | Not measured |
| Merge / push / release / deployment | Not performed |

The actual next gate is explicit controlled activation of the extension on the existing worker, preserving its original model and legacy routes. Then the operator must complete the consent, microphone, comparison and acceptance workflow. Do not promote this document to physical PASS based on unit tests.

Post-test service observation: existing speech-pilot worker remained active, with zero systemd restarts and activation timestamp 5 September 2026 21:46:52 BST. No service unit or live source was changed. Both checkouts contain source only; no raw voice assets were added to Git.
