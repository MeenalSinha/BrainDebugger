# Data Schema

See `docs/schema-audit.json` for the complete generated schema audit.

Key relationships used by BrainDebugger v1.0:

- Neuron metadata: `body-annotations...feather`, keyed by `bodyId`.
- Body neurotransmitter predictions: `body-neurotransmitters...feather`, keyed by `body`.
- Body summary statistics: `body-stats...feather`, keyed by `body`.
- Weighted structural connectivity: `connectome-weights...feather`, keyed by `body_pre`, `body_post`, and `weight`.

Point-level synapse files are documented but not loaded into the interactive demo index because they contain hundreds of millions of rows.
