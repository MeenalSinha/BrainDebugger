# Data Schema

See `docs/schema-audit.json` for the complete generated schema audit.

Key relationships used by BrainDebugger:

- Neuron metadata: `body-annotations...feather`, keyed by `bodyId`.
- Body neurotransmitter predictions: `body-neurotransmitters...feather`, keyed by `body`.
- Body summary statistics: `body-stats...feather`, keyed by `body`.
- Weighted structural connectivity: `connectome-weights...feather`, keyed by `body_pre`, `body_post`, and `weight`.

Point-level synapse files are documented but not loaded into the interactive demo index because they contain hundreds of millions of rows.

The generated schema audit uses portable source identifiers such as `external-download:outputs/malecns-connectome`; it must not contain local usernames or machine-specific absolute paths.
