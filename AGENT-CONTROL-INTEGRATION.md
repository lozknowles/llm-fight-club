# Optional Agent Control integration

Agent Control currently provides provider definitions, health, capability lanes and trace telemetry. LLM Fight Club consumes none of its internals. A future adapter should map its selected recipe to `ModelProvider.generate`, emit correlation IDs into both telemetry stores, and honor Agent Control health/policy decisions before a turn. It must not let a provider callback alter the debate state.

## Speech capability contract

The bake-off establishes the proposed action name `speech.synthesize@1` with request fields `text`, stable `voice` identity, `deliveryHints`, and `profile`. Provider resources should advertise qualified subsets of:

- `speech.live`
- `speech.streaming`
- `speech.studio`
- `speech.local`
- `speech.postprocess`

Agent Control already has the necessary generic mechanisms: typed resource capabilities and constraints, health filtering, cost/latency attributes, worker placement, resource locks, retries, verification and evidence. Promotion should add a registered action/provider adapter and qualification evidence; it should not duplicate ConversationEngine or move playback authority into Agent Control.
