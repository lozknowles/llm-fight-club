# Optional Agent Control integration

Agent Control currently provides provider definitions, health, capability lanes and trace telemetry. LLM Fight Club consumes none of its internals. A future adapter should map its selected recipe to `ModelProvider.generate`, emit correlation IDs into both telemetry stores, and honor Agent Control health/policy decisions before a turn. It must not let a provider callback alter the debate state.
