# NeuroQuery Biological Knowledge Catalog — Janelia MaleCNS Edition

Version: 1.0.0
Dataset Compatibility: `male-cns:v1.0`

## Overview

The NeuroQuery Knowledge Layer provides an evidence-grounded, versioned metadata foundation linking neuroscience concepts to verified anatomical annotations in the **Janelia MaleCNS v1.0** connectome dataset.

It ensures that when researchers ask biological questions about visual motion detection, escape circuits, or sensory pathways, BrainDebugger grounds every query plan in:
1. **Traceable Scientific Literature**: Real peer-reviewed publications with verified DOIs.
2. **Authentic MaleCNS Annotations**: Verified `type`, `instance`, or `superclass` values present in the loaded Feather dataset.
3. **Supported Graph Investigations**: Existing, mathematically verified graph algorithms (shortest path, cascade divergence, perturbation resilience).

---

## File Structure

```
data/knowledge/
├── catalog-manifest.json        # Metadata, versioning, and catalog summary
├── concepts.json                # Structured biological concepts and descriptions
├── evidence-sources.json        # Provenance registry with peer-reviewed DOIs and citations
├── concept-mappings.json        # Rules mapping concepts to MaleCNS annotation fields
└── supported-investigations.json # Registry of supported graph analysis pipelines
```

---

## Evidence Standards & Rationale

NeuroQuery enforces strict scientific boundaries:
- **Scientific Evidence vs. Dataset Annotation**: A peer-reviewed paper demonstrates a physiological or anatomical phenomenon; an annotation in the dataset indicates a classifier assigned to a neuron.
- **Structural Connectivity vs. Biological Transmission**: A surviving graph path between concept neurons proves anatomical wiring in the EM dataset; it does not prove action potential propagation or synaptic firing during a specific behavior.
- **No Fabricated Provenance**: Never invent DOIs, citations, neuron IDs, or biological functions.
- **Explicit Limitations**: Unverified or unsupported concepts (e.g., auditory courtship song circuits in central brain subsets) are explicitly flagged as `requires_review` or `unsupported` with honest limitation disclosures.

---

## Validation

Run the automated knowledge catalog validator:
```powershell
python scripts/validate_knowledge.py
```
This validates schema consistency, cross-reference integrity (concept -> mappings, mappings -> evidence sources), and checks compatibility against the configured MaleCNS dataset.
