# Methodology

BrainDebugger v1.0 builds a local demo subset from real MaleCNS Feather files.

1. Audit Feather schemas with `scripts/inspect_dataset.py`.
2. Select high-rank seed neurons from the body statistics table.
3. Scan the full weighted connectome table and keep bounded strongest incoming and outgoing connections for selected seed neurons.
4. Join available annotations and neurotransmitter predictions.
5. Build region summaries and per-neuron structural statistics.

Missing metadata is represented as `unknown`, `unclassified`, or `null`; it is not fabricated.

Computed values are structural graph summaries over the indexed demo subset unless explicitly labeled otherwise.
