# Personality Engine

`PersonalityProfile` is independent of participant role, model and assigned voice. Profiles include identity/background, worldview, objectives, beliefs, expertise, blind spots, confidence, verbosity, humour/rhetorical style, vocabulary, rhythm, temperament, concession/evasion/self-awareness tendencies, recurring habits, internal tensions, defensive topics, relationships, private character notes and optional preferred voice characteristics.

The browser ships seven original fictional profiles: Mara Vale, Cedric Pump, Dr Nina Quark, Alfie Rook, Theodore Gridley, Crispin Bell and Morris Fenn. The last three explore, respectively, reclusive puzzle logic, warm polymathic digression and anxious existential escalation. They are original archetypes rather than representations of David Mitchell, Ludwig, Stephen Fry, Woody Allen or any other real/existing performer or character.

Each participant can add up to 1,200 characters of run-specific `customPrompt` direction on top of a selected profile. This is stored in the conversation's normalized `PersonalityProfile`, not in the voice identity. The model treats it as descriptive character material; it cannot override safety, role, format, transcript facts, turn limits or the real-person-imitation boundary.

`CharacterState` is separate again. It retains recent claims and has schema slots for commitments, contradictions, fictional anecdotes, relationships, emotional state, running jokes and concessions. This compact state travels with bounded recent transcript context.

Preferred voice characteristics are recommendations only. Actual browser voice assignment is separate and every active participant must have a distinct installed voice.

Delivery is also separate from voice identity. The speech layer receives compact hints derived from `speakingRhythm`, `temperament`, `humourStyle` and `rhetoricalStyle` for the current participant. A natural speech provider may interpret hints such as measured, dry, pompous, nervous, irritated or rapid, while the selected voice continues to identify the performer. Providers that cannot express delivery hints may safely ignore them.
