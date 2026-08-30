#!/usr/bin/env python3
import json
import re
from pathlib import Path

import librosa
import numpy as np
from faster_whisper import WhisperModel

ROOT = Path("/fast/work/llm-fight-club-20260829")
QUAL = ROOT / ".run-v2" / "natural-tts-qualification"
data = json.loads((QUAL / "qualification.json").read_text(encoding="utf-8"))


def words(text):
    return re.findall(r"[a-z0-9']+", text.lower())


def edit_distance(left, right):
    previous = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        current = [i]
        for j, b in enumerate(right, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (a != b)))
        previous = current
    return previous[-1]


model = WhisperModel(
    "/fast/models/openvoice-v2/faster-whisper-tiny-en",
    device="cpu",
    compute_type="int8",
    local_files_only=True,
)

items = data["b_natural"]["turns"] + data["long_interview"]["turns"]
results = []
for item in items:
    audio, sample_rate = librosa.load(item["file"], sr=None, mono=True)
    segments, _ = model.transcribe(item["file"], language="en", beam_size=5, vad_filter=False)
    transcript = " ".join(segment.text.strip() for segment in segments).strip()
    reference_words = words(item["text"])
    transcript_words = words(transcript)
    f0, voiced, _ = librosa.pyin(audio, fmin=65, fmax=400, sr=sample_rate)
    voiced_f0 = f0[np.isfinite(f0)]
    centroid = librosa.feature.spectral_centroid(y=audio, sr=sample_rate)[0]
    results.append({
        "speaker": item["speaker"],
        "voice": item["voice"],
        "file": item["file"],
        "reference": item["text"],
        "asr": transcript,
        "word_error_rate": round(edit_distance(reference_words, transcript_words) / max(1, len(reference_words)), 3),
        "median_f0_hz": round(float(np.median(voiced_f0)), 1) if len(voiced_f0) else None,
        "f0_iqr_hz": round(float(np.percentile(voiced_f0, 75) - np.percentile(voiced_f0, 25)), 1) if len(voiced_f0) else None,
        "median_spectral_centroid_hz": round(float(np.median(centroid)), 1),
    })

groups = {}
for voice in sorted({item["voice"] for item in results}):
    selected = [item for item in results if item["voice"] == voice]
    groups[voice] = {
        "turns": len(selected),
        "mean_word_error_rate": round(float(np.mean([item["word_error_rate"] for item in selected])), 3),
        "median_f0_hz": round(float(np.median([item["median_f0_hz"] for item in selected])), 1),
        "median_spectral_centroid_hz": round(float(np.median([item["median_spectral_centroid_hz"] for item in selected])), 1),
    }

analysis = {"status": "PASS", "per_turn": results, "voice_groups": groups}
(QUAL / "analysis.json").write_text(json.dumps(analysis, indent=2), encoding="utf-8")
print(json.dumps(analysis, indent=2))
