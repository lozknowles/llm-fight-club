# Conversation Engine v0.1

The core is format-neutral:

`ConversationEngine → ConversationFormat policy → Participant → ModelRouter → browser SpeechProvider → playback completion → next turn`

Supported policies are `INTERVIEW`, `DEBATE`, `PANEL`, and `CROSS_EXAMINATION`. Each policy chooses the next participant; it does not own model or speech code. A conversation persists premise, style, participants, transcript, telemetry, private director memory and compact per-participant `CharacterState`.

Interview questioners receive a private analysis of the preceding answer before generating the next spoken question. The analysis considers whether the question was answered, claims, contradictions, assumptions, interesting avenues, and whether to challenge, clarify, change subject or continue. Private analysis is persisted separately and is never spoken.

v0.1 remains turn-based. The browser reports speech completion (including measured duration or an explicit skip) to the engine. The engine will not generate the next turn while playback is outstanding.

## Formats

- Interview: interviewer and guest alternate; follow-ups are generated from the actual answer.
- Debate: FOR and AGAINST alternate and must engage with the preceding turn.
- Panel: host rotates through two or more panelists and returns to moderation.
- Cross-examination: examiner and witness alternate; questions may press evasion and inconsistency without abuse.

The engine is ready for a server or streaming `SpeechProvider`; full-duplex speech is deliberately out of scope.
