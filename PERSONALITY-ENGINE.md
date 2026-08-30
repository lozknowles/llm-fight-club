# Personality Engine

`PersonalityProfile` is independent of participant role, model and assigned voice. Profiles include identity/background, worldview, objectives, beliefs, expertise, blind spots, confidence, verbosity, humour/rhetorical style, vocabulary, rhythm, temperament, concession/evasion/self-awareness tendencies, recurring habits, internal tensions, defensive topics, relationships, private character notes and optional preferred voice characteristics.

The browser ships four original fictional profiles: Mara Vale, Cedric Pump, Dr Nina Quark and Alfie Rook. It can create/edit saved JSON profiles in browser-local storage. No built-in profile corresponds to a real person, and prompts forbid real-person voice imitation.

`CharacterState` is separate again. It retains recent claims and has schema slots for commitments, contradictions, fictional anecdotes, relationships, emotional state, running jokes and concessions. This compact state travels with bounded recent transcript context.

Preferred voice characteristics are recommendations only. Actual browser voice assignment is separate and every active participant must have a distinct installed voice.

Delivery is also separate from voice identity. The speech layer receives compact hints derived from `speakingRhythm`, `temperament`, `humourStyle` and `rhetoricalStyle` for the current participant. A natural speech provider may interpret hints such as measured, dry, pompous, nervous, irritated or rapid, while the selected voice continues to identify the performer. Providers that cannot express delivery hints may safely ignore them.
