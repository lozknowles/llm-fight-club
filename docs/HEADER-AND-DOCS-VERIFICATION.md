# Header and installation documentation review — 15 September 2026

Source baseline: `ccebb099bf550022f5c4e616410e9b7555ae9ce8` (package 1.2.0).

Scope: new repository hero and introduction, installation/configuration guides, blank environment template, and preservation of the previous README as `IMPLEMENTATION-NOTES.md`. No application source, dependency, deployment, version or release change.

- Existing Node test suite: **92 passed, 0 failed, 0 skipped**, Node 24.19.0 on Linux.
- Local documentation links: all targets in the new README and installation guide resolve.
- Hero: inspected at 2172 × 724; headline, four named contenders and tagline are readable. README supplies alt text and repeats the tagline as text.
- Documented service chain: app on loopback 18770 → speech router 18772 → Flite 18774; model fixture on 11434 with the documented model ID.
- App health, configuration, voice catalog and Studio HTML: pass.
- Actual Flite AWB preview WAV: pass, positive duration.
- Two-turn API debate with distinct AWB/SLT voices: completed.
- JSON and Markdown exports, recorded turn WAV and assembled conversation MP3: pass.

The model server was a deterministic stub. This validates the app/speech wiring and exports, not real model quality, Ollama installation, native Windows audio, browser listening or phone use. The installation guide includes a direct model-generation check and first-show procedure for operators to qualify those on their own machines.

Official Ollama sources were checked for the Linux installation route, OpenAI-compatible endpoint and example model. The package still has no project-wide LICENSE file; no licence or repository visibility change is included in this work.

## Credential checks

- All 42 commits reachable from the fetched repository refs were included in a pattern scan of 367 historical blobs. Checks covered common provider tokens, private-key headers, long secret assignments and literal bearer tokens. No credential-like literals were found; all 22 assignment candidates were `process.env` references. This is a scoped pattern scan, not a guarantee against every possible secret format.
- No environment files were present in that source history or the fresh project checkout before this change.
- On the MSI, the five supported secret variables (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `VOICE_LAB_ACCESS_KEY`, `VOICE_LAB_WORKER_TOKEN`, `OMNIVOICE_UPSTREAM_TOKEN`) were absent from process, user and machine environment scopes. Values were never printed. Existing services on other machines were not audited or modified.
- The new `.env.example` parsed under Node 24 with every credential field empty. The configuration guide uses ignored local files and documents inherited-environment precedence and separation of speech keys from the app/Flite processes.
