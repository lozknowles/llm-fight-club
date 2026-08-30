# Debate engine

States include READY, INTRODUCTION, openings, alternating rebuttals, referee intervention, audience intervention, closings, verdict, PAUSED, STOPPED and COMPLETED. Audience content remains data in a user message; it cannot alter role, system rules, position or provider configuration. Recent history is bounded to six turns plus the latest opposing turn.

Telemetry records model/provider, latency, token usage when supplied, TTS provider/voice/latency, audio duration, turn and round. Debate JSON is persisted under `.data/debates/` and is exportable directly as structured JSON.
