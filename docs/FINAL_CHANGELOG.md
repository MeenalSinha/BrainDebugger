# BrainDebugger — Final Release Changelog

All notable changes, bug fixes, stabilization repairs, and documentation updates across the BrainDebugger platform lifecycle (Versions 0 through 12) are documented in this file.

---

## [V12.0.0-RELEASE] — 2026-10-29

### Final Comprehensive Audit & Release Stabilization

This release marks the conclusion of the V0–V12 audit and stabilization milestone. All core capabilities across data ingestion, connectome exploration, pathway tracing, neural debugging, circuit discovery, explainability, robustness analysis, hypothesis management, and project-level research program synthesis have been audited, repaired, tested, and verified against the real Janelia MaleCNS v1.0 dataset.

#### Defect Fixes & Algorithmic Corrections
- **Research Campaign Scenario Estimation (`backend/research_synthesis_service.py`):**
  - Corrected `preview_campaign` calculation where `estimated_scenarios` was only incrementing for studies of type `"robustness_sweep"`.
  - Added fallback increment `else: est_scenarios += 1` so that pathway tracing, knockout simulation, and comparative analysis studies accurately contribute to the campaign scenario total.
- **Project Report & CSV Export Endpoint Routing (`backend/main.py`):**
  - Resolved 404 errors by adding standard route decorator aliases:
    - `@router.get("/projects/{project_id}/report")` alias to `/synthesis/report`
    - `@router.get("/projects/{project_id}/export/csv")` alias to `/synthesis/export-csv`
  - Ensures seamless frontend routing and backward-compatible REST API access.
- **FastAPI Query Parameter Binding (`backend/main.py`):**
  - Updated `create_hypothesis` endpoint signature to explicitly declare `project_id: Optional[str] = Query(None)`.
  - Fixes issue where a `project_id` passed via URL query parameters was ignored if not also provided in the request body.
- **TypeScript Interface Alignment (`frontend/src/components/ResearchProgramStudio.tsx`):**
  - Resolved build-breaking TypeScript compilation errors by strictly aligning component interfaces with backend Pydantic models:
    - Replaced `review_rationale` with `resolution_rationale`
    - Replaced `scoring_breakdown` with `priority_breakdown`
    - Replaced `hypothesis_ids: string[]` with `hypotheses: HypothesisRecord[]`
  - Verified production build compiles with zero errors under `tsc --noEmit`.
- **E2E Test Runner Hardening (`scripts/e2e_verify.py`):**
  - Fixed an unhandled `AttributeError` when inspecting 400 error payloads during circular dependency detection testing.
  - Ensured structured JSON error dicts are stringified prior to case-insensitive substring verification.

#### Documentation & Verification Deliverables
- **`docs/FINAL_AUDIT_REPORT.md`**: Comprehensive architectural audit covering all 13 version milestones (V0–V12), code quality analysis, security review, performance benchmarks, and release decision.
- **`docs/FINAL_TEST_REPORT.md`**: Complete execution log covering 133 backend tests, 74 frontend tests, and 52 live E2E integration checks against the full MaleCNS v1.0 Feather dataset.
- **`docs/FINAL_CHANGELOG.md`**: Detailed release log and historical version progression.

---

## [V12.0.0] — 2026-10-28

### Research Program Synthesis, Evidence Gap Analysis & Study Prioritization
- Introduced `ResearchSynthesisService` (`backend/research_synthesis_service.py`) for orchestrating multi-hypothesis research programs.
- Added Multi-Hypothesis Evidence Overlap Matrix calculation, identifying shared supporting and contradicting evidence across hypotheses.
- Added Contradiction Matrix detection to flag conflicting mechanistic predictions across independent hypotheses.
- Added Research Gap Analysis engine that identifies untested structural assumptions, unvalidated edge weights, and missing controls.
- Added Research Agenda Prioritization scoring formula:
  $$S = w_{\text{unc}} \cdot U + w_{\text{imp}} \cdot I + w_{\text{feas}} \cdot F - w_{\text{cost}} \cdot C$$
- Added dependency-aware topological study scheduler to guarantee valid execution order.
- Added Campaign Execution Runner with dry-run scenario estimation and controlled batch execution.
- Added Cross-Study Synthesis generator for Markdown reports and CSV data export.
- Added frontend `ResearchProgramStudio` component for interactive program management.

---

## [V11.0.0] — 2026-10-28

### Evidence-Grounded Hypothesis Workbench & Reproducible Research Notebook
- Introduced `HypothesisService` (`backend/hypothesis_service.py`) for formulating testable computational hypotheses.
- Added formal Bayesian-inspired credibility update model:
  $$P(H|E) = \frac{P(E|H) \cdot P(H)}{P(E)}$$
- Added Bidirectional Evidence Linking allowing users to bind circuit traces, knockout results, and robustness sweeps as supporting or contradicting evidence.
- Added Anti-Confirmation Bias warnings when duplicate or circular evidence is attached.
- Added Follow-Up Study Planner with directed acyclic graph (DAG) dependency tracking and cycle detection.
- Added Reproducible Research Notebook export supporting structured Markdown and JSON session serialization.
- Added frontend `HypothesisWorkbench` component with credibility gauges and evidence cards.

---

## [V10.0.0] — 2026-10-28

### Circuit Robustness & Sensitivity Analysis Lab
- Introduced `RobustnessAnalysisService` (`backend/robustness_analysis_service.py`) for evaluating circuit stability under noise and perturbation.
- Added Synaptic Weight Noise Injection ($\pm \delta$ Gaussian and uniform perturbation sweeps).
- Added Degree-Preserving Topological Rewiring using Maslov-Sneppen edge swap algorithms.
- Added Monte Carlo Stability Fraction metric:
  $$I(v) = \frac{1}{N} \sum_{i=1}^N \mathbf{1}[v \in P_i]$$
- Added downstream flow survival confidence intervals under edge dropout.
- Added frontend `RobustnessLab` component with interactive parameter sliders and distribution boxplots.

---

## [V9.0.0] — 2026-10-28

### Mechanistic Explainability & Critical Bottleneck Identification
- Introduced `ExplainabilityService` (`backend/explainability_service.py`) for translating graph algorithms into biological narratives.
- Added Betweenness Centrality and Cut-Vertex identification for circuit communication bottlenecks.
- Added Natural-Language Narrative Generator translating graph path sequences into neuroscientific descriptions.
- Added frontend `ExplainabilityPanel` component with interactive pathway inspection.

---

## [V8.0.0] — 2026-10-27

### Comparative Circuit Analysis & Directed Topology Matrix
- Introduced Comparative Matrix Studio (`frontend/src/components/ComparativeMatrixView.tsx`).
- Implemented strict directed edge symmetric difference calculation:
  $$\Delta(G_1, G_2) = (E_1 \setminus E_2) \cup (E_2 \setminus E_1)$$
  preserving directional asymmetry ($u \to v \neq v \to u$).
- Added node invariance scoring and common subgraph extraction across wild-type and perturbed circuits.

---

## [V7.0.0] — 2026-10-27

### Automated Circuit Discovery & Motif Extraction
- Introduced `CircuitDiscoveryService` (`backend/circuit_discovery_service.py`).
- Added motif detection algorithms for recurrent feedback loops, feedforward motifs, and reciprocal pairs.
- Added multi-criteria pathway ranking algorithm ($S = w_{syn} \cdot \prod \text{confidence}$).
- Added frontend `CircuitDiscoveryView` component with sorting, filtering, and export capabilities.

---

## [V6.0.0] — 2026-10-26

### Natural Language Query Planner & Execution Engine
- Introduced `QueryPlannerService` (`backend/query_planner_service.py`) for translating natural language neurobiology questions into structured execution plans.
- Added plan validation engine checking graph bounds, recursion depth, and computational resource quotas.
- Added frontend `AskNeuroQuery` conversational query interface.

---

## [V5.0.0] — 2026-10-25

### Biological Knowledge Layer & Literature Grounding
- Introduced `KnowledgeService` (`backend/knowledge_service.py`) for managing curated biological concepts and literature references.
- Added schema validation script (`scripts/validate_knowledge.py`) validating DOI references and dataset mapping identifiers.
- Added verified concept mappings to Janelia MaleCNS v1.0 body IDs.
- Added frontend `KnowledgeExplorer` component.

---

## [V4.0.0] — 2026-10-24

### Subcircuit Extraction & Neuropil ROI Filtering
- Added subcircuit extraction capabilities bounded by anatomical neuropils (e.g., EB, FB, AL, LH, CX).
- Added multi-neuropil boundary traversal and synaptic filtering.
- Enhanced graph visualization with 2D force-directed layout and neuropil region grouping.

---

## [V3.0.0] — 2026-10-23

### Neural Debugger & Perturbation Simulation
- Introduced `PerturbationService` (`backend/perturbation_service.py`) for simulating in-silico structural manipulations.
- Added single and multi-neuron knockout simulations.
- Added synaptic weight titration (partial attenuation).
- Implemented conductance-based flow redistribution algorithms to compute downstream signal loss.
- Added frontend `WhatIfSimulator` with side-by-side wild-type vs. perturbed views.

---

## [V2.0.0] — 2026-10-22

### Pathway Tracing & Graph Traversal Engine
- Introduced directed pathway tracing service (`backend/service.py`) supporting depth-limited DFS and BFS.
- Added cycle-detection and pruning to prevent infinite traversal loops in recurrent circuits.
- Added configurable synaptic weight thresholds and maximum hop distance filters.
- Added frontend `TraceView` for path rendering and intermediate partner inspection.

---

## [V1.0.0] — 2026-10-21

### Connectome Explorer & Neuron Inspection
- Introduced core REST API service (`backend/main.py`) for querying individual neurons and synaptic connections.
- Added typed neurotransmitter probability profiling (acetylcholine, GABA, glutamate, dopamine, serotonin, octopamine).
- Added upstream and downstream synaptic partner listing sorted by connection strength.
- Added frontend `NeuronInspector` with type search and partner tables.

---

## [V0.1.0] — 2026-10-20

### Foundation Data Ingestion & Indexing
- Built `DataProvider` (`backend/data_provider.py`) using Apache Arrow / Feather for zero-copy, memory-efficient data loading.
- Indexed 211,577 neurons and 25,563,197 directed synaptic connections from Janelia MaleCNS v1.0.
- Established strict read-only guarantees ensuring non-destructive data handling.
