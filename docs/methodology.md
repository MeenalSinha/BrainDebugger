# Methodology

BrainDebugger builds a local demo subset from real MaleCNS Feather files.

1. Audit Feather schemas with `scripts/inspect_dataset.py`.
2. Stream the complete body-statistics file and select seed neurons by lowest dataset rank, then body ID.
3. Scan the full weighted connectome table and keep bounded strongest incoming and outgoing connections for selected seed neurons.
4. Join available annotations and neurotransmitter predictions.
5. Build region summaries and per-neuron structural statistics.

Missing metadata is represented as `unknown`, `unclassified`, or `null`; it is not fabricated.

Computed values are structural graph summaries over the indexed demo subset unless explicitly labeled otherwise.

## Demo Subset Scope

The bundled index is real MaleCNS-derived data, but it is intentionally bounded for local portfolio use:

- `statsRowsScannedForSeeds`: 88,384,522 (the complete body-statistics file)
- `seedSelection`: `lowest-body-stats-rank-then-body-id`
- `seedCount`: 650
- `topKPerDirection`: 80

For each seed body, preprocessing keeps the strongest incoming and outgoing weighted connections found while scanning the complete weights file. This makes demo behavior reproducible and responsive while avoiding a misleading claim that the browser is loading the entire connectome.

## Search

At API startup, neurons are indexed with normalized tokens and trigrams from ID, cell type, instance, region, superclass, and predicted neurotransmitter. Queries use a lightweight prefilter followed by substring matching to preserve partial-search semantics at demo scale.
