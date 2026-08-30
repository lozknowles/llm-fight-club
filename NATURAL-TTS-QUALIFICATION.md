# Natural TTS qualification — 2026-08-30

## Outcome

Qwen3-TTS 12Hz 1.7B VoiceDesign is integrated as the preferred local speech provider. The existing FFmpeg/Flite implementation is retained and automatically used if the natural backend is unavailable.

The natural backend also unloads Qwen after five idle minutes to return its approximately 5 GiB CUDA reservation to the shared P5000. It reloads on the next request only when the 7,600 MiB free-memory guard passes; otherwise the router serves the preserved Flite fallback.

This changes only the speech-provider layer. Conversation formats, LLM turn policy, playback-completion sequencing and UI structure are unchanged.

## Candidates investigated

### Qwen3-TTS VoiceDesign — selected

The official Apache-2.0 model supports free-form synthetic voice design, natural-language control of timbre/emotion/prosody, English and future streaming. It directly fits the requirement that voice identity and line delivery remain separate. The 1.7B model runs on the P5000 with FP16 and SDPA.

Sources: [official Qwen3-TTS repository](https://github.com/QwenLM/Qwen3-TTS), [official VoiceDesign model card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign).

### Chatterbox / Chatterbox Turbo — retained as a future alternative

The official MIT implementation provides strong conversational synthesis, reference-conditioned voices, expressive controls in the standard model, paralinguistic tags in Turbo and neural watermarking. Runtime voices require reference audio; delivery control is less directly aligned with the existing personality fields than Qwen VoiceDesign.

Source: [official Resemble AI Chatterbox repository](https://github.com/resemble-ai/chatterbox).

### Dia 1.6B — not selected

Dia is designed to create multi-speaker dialogue in one pass and can be expressive, but the current application must generate one unscripted participant turn at a time. Its guidance also warns that sub-five-second inputs can sound unnatural. Selecting it would work against the established playback-gated turn architecture.

Source: [official Nari Labs Dia repository](https://github.com/nari-labs/dia).

### F5-TTS — not selected

F5-TTS is capable and efficient, but its official public base weights are CC-BY-NC-4.0 and it is primarily reference-conditioned. That is a poor fit for a later public release compared with an Apache-2.0 voice-design model.

Source: [official F5-TTS repository](https://github.com/SWivid/F5-TTS).

### Existing Kokoro and OpenVoice assets

Kokoro has useful British voices and OpenVoice/Melo was already qualified on this host. They remain useful alternatives, but this experiment sought a substantial increase in expressive, instruction-controlled performance. The protected OpenVoice public service and its model assets were inspected read-only and were not modified.

## Selected synthetic performers

- Interviewer: original late-fifties British male radio interviewer; educated southern English, warm low baritone, measured and dry.
- Guest: original early-sixties British male comic character; lighter tenor, polished Midlands English, genial and pompously self-assured.
- Referee/host: original forties British female programme host; clear northern English, composed alto and brisk amused authority.

These are synthetic descriptions, not clones or impersonations. Per-line delivery hints remain separate from those identities.

## Measured qualification

Hardware and runtime:

- GPU: Quadro P5000, compute capability 6.1, 16,384 MiB.
- Runtime: PyTorch 2.5.1+cu121, FP16, SDPA, no FlashAttention.
- Baseline with both llama services: 7,841 MiB used / 8,426 MiB free.
- Loaded natural speech stack: 12,917 MiB used / 3,350 MiB free.
- Peak natural-provider reservation: 5,062 MiB.
- Model load: 2.002 seconds in the controlled qualification; 2.0–2.4 seconds in service starts.

Identical-transcript A/B:

- Existing Flite: 13.085 seconds audio; synthesis RTF 0.026–0.031.
- Qwen natural: 13.160 seconds audio; synthesis RTF 2.18–2.25.

Long interview:

- 73.360 seconds complete programme audio.
- Eight turns, average RTF approximately 2.17.
- Per-turn synthesis ranged from 11.563 to 26.645 seconds in the controlled run.

Objective intelligibility and separation:

- Tiny-English Whisper mean WER: 0.8% interviewer, 0.9% guest.
- Median F0 across turns: 98.5 Hz interviewer, 140.9 Hz guest.
- Median spectral centroid across turns: 1,937.6 Hz interviewer, 2,116.6 Hz guest.

Those measurements support intelligibility and audible differentiation, but they are not a substitute for a human naturalness judgement.

## Evidence

- `scripts/qualify-natural-tts.py`: controlled identical-text A/B and long interview.
- `scripts/analyze-natural-tts.py`: ASR and acoustic checks.
- `scripts/qualify-speech-router.mjs`: preferred and existing providers through the router.
- `scripts/qualify-natural-live-loop.mjs`: two real LLMs through natural speech and durable transcript telemetry.
- `scripts/qualify-natural-fallback.sh`: natural backend deliberately removed; router returned Flite with `x-tts-fallback: true`, then restored Qwen.
- `npm test`: 14 passing tests.

## Limitations

- FP16/SDPA on Pascal is slower than real time. Current complete-WAV synthesis creates a noticeable pause between turns.
- VoiceDesign regenerates from the same identity description and deterministic seed; it is not as identity-locked as a reusable speaker embedding. Listening should confirm consistency across the long sample.
- British accent adherence and comic timing require human listening; ASR and acoustic measurements cannot prove either.
- The official model supports streaming, but this v0.1 provider returns complete WAV files to preserve the established playback architecture.
- Persistent model residency leaves about 3.35 GiB GPU headroom. The provider refuses startup when baseline free memory is below 7.6 GiB and can be rolled back immediately to Flite-only operation.

## Release recommendation gate

Technically, this is the recommended local quality stack for a private listening trial: it is materially more expressive, provider-neutral, locally hosted and future-streaming capable. A LozKnowles.com release should remain blocked until a human listening decision accepts the long sample and the turn delay, and until the private backend is protected with appropriate rate limits and access controls.
