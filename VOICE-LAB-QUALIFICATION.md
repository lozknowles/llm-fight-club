# Voice Lab qualification evidence — 12 September 2026

## Implementation / branch

Branch: `feature/voice-lab`, based on `c75ef36`.
Local isolated worktree: `work/llm-fight-club-voice-lab-20260912` in the current task workspace.
The live checkout `/fast/work/llm-fight-club-omnivoice-final-20260906` was inspected read-only and remained at `c75ef36`.

## Automated and browser evidence

- Node regression suite: 69 passing tests (54 existing, 15 Voice Lab additions).
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
