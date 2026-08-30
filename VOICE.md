# Voice

MeloTTS is the v0.1 backend: local, stock synthetic regional English voices, WAV output and no voice-cloning consent surface. Each turn is cached by voice/text hash. The browser’s `audio.onended` calls the completion API, preventing transcript or turn advancement while audio remains outstanding.

OpenVoice is intentionally not used: it is a separately governed voice-cloning system. A future `SpeechProvider` can support streaming TTS without changing debate rules.
