# BrainDebugger V10 — Circuit Robustness & Sensitivity Analysis Lab Report

**Release Status:** `READY WITH DOCUMENTED LIMITATIONS`  
**Dataset:** Janelia MaleCNS v1.0 (`male-cns:v1.0`, 211,577 neurons, 25,563,197 connections)  
**Knowledge Catalog:** Schema `1.0.0` (7 concepts, 6 sources, 7 mappings)  
**Robustness Manifest Schema:** `1.0.0`  
**Ranking Formula Version:** `v10.0`  

---

## 1. Executive Summary & Version 9 Audit Review

Before implementing Version 10, the existing Version 9 baseline was audited and verified against real Janelia MaleCNS v1.0 data. The full audit findings and verification procedures are documented in [`docs/V9_AUDIT_REPORT.md`](file:///c:/Users/Meenal%20Sinha/Downloads/BrainDebugger/docs/V9_AUDIT_REPORT.md).

### Version 9 Baseline Verification Outcomes:
- **Interactive Circuit Exploration Canvas (`CircuitDiscoveryView.tsx`):** Cytoscape rendering, layout switching, candidate vs partner node styling, weight filters, and superclass filters verified.
- **Bounded Neighborhood Expansion (`/api/neuroquery/expand-subgraph`):** Dynamic +1 hop expansion retrieving verified MaleCNS connection weights without client fabrication or full-connectome dumps.
- **Explainable Inspector:** "Why included?" candidate rationale, verified DOI links (`10.1038/s41586-024-07968-y`), and transparent 3-part ranking formula breakdown verified.
- **Directed Pathway Integration:** Direct handoff to V3 Pathway Tracer maintaining exact source and target body IDs and edge weights.
- **Investigation Narrative Trace:** 9-step reproducible provenance cards tracing research question, concept resolution, plan validation, candidate discovery, and subgraph metrics.
- **Comparative Circuit Studio (`/api/neuroquery/compare`):** Jaccard candidate and directed-edge overlaps ($u \to v \neq v \to u$), ranking deltas, and cross-investigation compatibility warnings verified.
- **Multi-Format Scientific Exports:** JSON, Candidate CSV, Connection CSV, and Markdown Report exports verified.
- **V0–V8 Regressions:** Connectome Explorer, Neuron Inspector, Pathway Tracer, Neural Debugger, Perturbation Lab, Knowledge Layer, NeuroQuery Planner, and Circuit Discovery Engine fully operational with 0 regressions.

---

## 2. Version 9 Audit Repairs

During the audit and pre-V10 verification, the following defects and environmental edge cases were resolved:

1. **`knowledge_service._manifest.version` Field Naming:**
   - *Problem:* `KnowledgeCatalogManifest` exposed `version`, whereas callers attempted to access `catalog_version`, causing an `AttributeError`.
   - *Fix:* Standardized catalog version retrieval to use `_manifest.version` with fallback to `"1.0.0"`.
2. **Structural Metrics Computation Signature:**
   - *Problem:* `_calculate_structural_metrics` expected 2 arguments (`nodes, edges`), but an obsolete call in testing attempted to pass 3 arguments.
   - *Fix:* Realigned caller invocations to the authoritative 2-parameter signature.
3. **Pydantic Model Annotation Resolution:**
   - *Problem:* Under Pydantic 2.12 with forward references, `Any` was used in `baseline_overrides: Optional[dict[str, Any]]` without explicit import in `models.py`.
   - *Fix:* Added `from typing import Any` in `backend/models.py`.
4. **Feather Provider Dataset Version Property:**
   - *Problem:* `LocalFeatherProvider` did not expose `.dataset_version` as a direct property, causing `AttributeError` during manifest assembly.
   - *Fix:* Added `@property def dataset_version(self) -> str: return DATASET_NAME` to `LocalFeatherProvider` and used safe `getattr(..., "dataset_version", None) or "male-cns:v1.0"`.

---

## 3. Version 10 Architecture: Circuit Robustness Lab

BrainDebugger Version 10 introduces a scientific robustness and sensitivity-analysis workflow on top of the V8/V9 pipeline.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BrainDebugger V10 UI                            │
│  Ask NeuroQuery ──► Circuit Discovery ──► Robustness Lab (V10 Tab)     │
│                                                   │                    │
│   ┌───────────────────────┐   ┌───────────────────┴────────────────┐   │
│   │   Parameter Builder   │   │     KPI Stability Summary Cards    │   │
│   │ One-Factor / Grid     │   │ Scenarios, Stable Cands, Edges     │   │
│   └───────────┬───────────┘   └───────────────────┬────────────────┘   │
│               │                                   │                    │
│   ┌───────────▼───────────┐   ┌───────────────────▼────────────────┐   │
│   │   Scenario Matrix     │   │ Stability Tables & Sensitivity SVG │   │
│   │ Preview & Execution   │   │ Cands (I(v)), Edges, Metrics Chart │   │
│   └───────────────────────┘   └───────────────────┬────────────────┘   │
│                                                   │                    │
│                               ┌───────────────────▼────────────────┐   │
│                               │ Reproducibility Manifest & Exports │   │
│                               │ JSON, CSVs, Markdown Report        │   │
│                               └────────────────────────────────────┘   │
└───────────────────────────────────────────────────▲────────────────────┘
                                                    │ REST API
┌───────────────────────────────────────────────────┴────────────────────┐
│                       FastAPI Backend Services                         │
│  • POST /api/neuroquery/robustness/analyze                             │
│  • GET  /api/neuroquery/robustness/profiles                            │
│  • GET  /api/neuroquery/robustness/{analysis_id}                       │
│                                                   │                    │
│  ┌────────────────────────────────────────────────▼────────────────┐   │
│  │ RobustnessAnalysisService (backend/robustness_analysis_service) │   │
│  │   • Scenario Generator (Budget bounded ≤ 25)                    │   │
│  │   • Isolated Execution Engine (CircuitDiscoveryService reuse)   │   │
│  │   • Candidate Stability Calculator (Inclusion, Median, Top-K)   │   │
│  │   • Directed Edge Stability Calculator (u → v ≠ v → u)          │   │
│  │   • Metric Sensitivity Calculator (ΔNodes, ΔEdges, Density)     │   │
│  │   • Reproducibility Manifest Generator (Schema v1.0.0)          │   │
│  └────────────────────────────────────────────────┬────────────────┘   │
│                                                   │                    │
│  ┌────────────────────────────────────────────────▼────────────────┐   │
│  │ LocalFeatherProvider (Read-Only MaleCNS v1.0 Connectome)        │   │
│  │ 211,577 neurons, 25.5M connections, contiguous numpy indexes    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Design Principles:
1. **Separation of Baseline vs Scenarios:** A single investigation shows what the selected configuration produced. A robustness analysis evaluates how that result responds under explicitly defined alternative parameters.
2. **Frozen Baseline Pipeline:** Scenarios reuse the original research question, resolved concepts, and validated plan. The LLM is never invoked in parameter sweeps, preventing prompt stochasticity.
3. **Strict Source Immutability:** The loaded MaleCNS v1.0 dataset and saved V9 investigation results are never mutated.
4. **Direction-Sensitive Edge Semantics:** The edge $u \to v$ is strictly distinct from $v \to u$.
5. **Bounded Analysis Budget:** Enforces a maximum scenario limit ($N \le 25$) to prevent denial-of-service and unconstrained graph extraction.

---

## 4. Parameterized Scenarios

Version 10 exposes parameters that have an authoritative mathematical effect on graph extraction and candidate ranking:

### Genuinely Supported Parameters:
- **`min_edge_weights` (int $\ge 1$):** Filters synaptic connections during bounded subgraph extraction. Evaluates which candidate pathways survive stringent anatomical thresholds.
- **`max_subgraph_nodes_list` (int $10 \le N \le 100$):** Restricts the maximum size of the contextual subgraph, revealing whether candidate inclusion depends on neighborhood breadth.
- **`max_candidates_list` (int $2 \le C \le 50$):** Restricts the candidate resolution cap, evaluating whether top-ranked neurons are displaced when candidate pools expand or contract.
- **`ranking_profiles` (RankingProfile):** What-if ranking coefficient variations:
  - `baseline_default`: $S = W_{\text{tier}} + 0.5 \cdot W_{\text{syn}} + 10 \cdot \text{Deg}$
  - `connectivity_heavy`: $S = 0.5 \cdot W_{\text{tier}} + 1.5 \cdot W_{\text{syn}} + 10 \cdot \text{Deg}$
  - `hub_topology`: $S = 0.5 \cdot W_{\text{tier}} + 0.5 \cdot W_{\text{syn}} + 25 \cdot \text{Deg}$
  - `evidence_prioritized`: $S = 2.0 \cdot W_{\text{tier}} + 0.2 \cdot W_{\text{syn}} + 5 \cdot \text{Deg}$

### Intentionally Excluded Parameters:
- `max_hops`: Excluded from circuit discovery sweeps because candidate resolution is direct concept-mapping; `max_hops` only applies to multi-hop pathway tracing in V3.
- Arbitrary weight edits: Excluded because recorded synapse counts represent empirical electron-microscopy ground truth and must not be fabricated.

---

## 5. Mathematical Stability Metrics & Denominator Rules

### 5.1 Candidate Inclusion Stability $I(v)$
For each candidate neuron $v$ observed across successful scenarios:

$$
I(v) = \frac{\text{count of successful comparable scenarios containing } v}{\text{total successful comparable scenarios}}
$$

- **Denominator:** Only successfully completed scenarios ($S_{\text{completed}}$). Failed or partial scenarios are explicitly excluded from the denominator to prevent artificial deflation of inclusion rates.
- **Percentage Representation:** $I(v) \times 100\%$, with denominator displayed explicitly (e.g. `8/8 (100%)`).
- **Rank Spread:** $\text{RankSpread}(v) = \text{WorstRank}(v) - \text{BestRank}(v)$.
- **Median Rank:** Statistical median of observed ranks across scenarios where included.
- **Top-$k$ Retention:** Indicates whether candidate $v$ ranks $\le k$ in at least $75\%$ of scenarios where it appears.

### 5.2 Directed-Connection Stability
For each directed edge $u \to v$:
- Uniquely keyed as `f"{source}_{target}"`. $u \to v$ and $v \to u$ are treated as independent physical connections.
- **Inclusion Fraction:** $I(e) = \frac{\text{scenarios containing } e}{S_{\text{completed}}}$.
- **Weight Consistency:** Preserves the authentic recorded synaptic weight from MaleCNS v1.0.
- **Threshold Survival:** Identifies whether the edge persists when `min_edge_weight >= 10`.

### 5.3 Metric Sensitivity
Reports structural graph variations relative to the baseline configuration:
- $\Delta \text{Nodes} = \text{Nodes}_{\text{scenario}} - \text{Nodes}_{\text{baseline}}$
- $\Delta \text{Edges} = \text{Edges}_{\text{scenario}} - \text{Edges}_{\text{baseline}}$
- Subgraph Density: $D = \frac{|E|}{|V|(|V|-1)}$

---

## 6. Frontend UI Components

The **Robustness Lab (V10)** is integrated into `frontend/src/components/RobustnessLab.tsx` and exposed as a dedicated tab within `CircuitDiscoveryView.tsx`:

1. **Parameter Builder:**
   - Strategy switcher: *One-Factor-at-a-Time* vs *Bounded Multi-Parameter Grid*.
   - Sweep selectors for Minimum Synapse Weight ($1, 2, 5, 10, 15$), Graph Scope ($20, 40, 60, 80$), Candidate Cap ($5, 10, 20, 30$), and What-If Ranking Profiles.
   - Interactive Scenario Preview displaying scenario counts and budget limits.
2. **KPI Summary Cards:**
   - Evaluated Scenarios (Completed / Total)
   - Stable Candidates ($\ge 80\%$ inclusion)
   - Top-$k$ Retained Candidates
   - Stable Directed Connections
3. **Candidate Stability View:**
   - Table showing Body ID, Cell Type, Evidence Tier, Baseline Rank, Median Rank, Rank Spread, Inclusion Fraction, and Top-$k$ Retention Badge.
4. **Directed Edge Stability View:**
   - Presynaptic Source, Postsynaptic Target, Recorded Synaptic Weight, Inclusion Fraction, and Strict Threshold Survival badge.
5. **Metric Sensitivity View:**
   - Responsive SVG sensitivity chart plotting Scenario vs Node/Edge counts.
   - Structural sensitivity summary table showing $\Delta \text{Nodes}$, $\Delta \text{Edges}$, and Density.
6. **Scenario Matrix:**
   - Comparative table of each evaluated scenario with parameter label, runtime, top candidate IDs, and comparison to baseline.
7. **Reproducibility Manifest:**
   - Schema v1.0.0 inspector displaying analysis ID, plan ID, question, dataset version, catalog version, ranking formula version, and scientific boundaries.
8. **Multi-Format Exports:**
   - Download Robustness Analysis JSON
   - Download Candidate Stability CSV
   - Download Edge Stability CSV
   - Download Metric Sensitivity CSV
   - Download Markdown Robustness Report

---

## 7. Version 10 API Specifications

### `GET /api/neuroquery/robustness/profiles`
- **Description:** Returns standard candidate ranking profiles.
- **Response:** `list[RankingProfile]`

### `POST /api/neuroquery/robustness/analyze`
- **Description:** Executes bounded robustness analysis over discrete parameter scenarios.
- **Request:** `RobustnessAnalysisRequest`
  - `execution_id` / `baseline_execution_id`: String ID of completed V8/V9 execution.
  - `mode` / `strategy`: `"one_factor_at_a_time"` | `"grid"`.
  - `min_edge_weights`: Optional list of integers.
  - `max_subgraph_nodes_list`: Optional list of integers.
  - `max_candidates_list`: Optional list of integers.
  - `ranking_profiles` / `ranking_profile_names`: Optional what-if ranking profiles.
  - `top_k_cutoff`: Integer (default 5).
- **Response:** `RobustnessAnalysisResponse`
  - Status codes: `200 OK`, `422 Unprocessable Content` (budget/validation failure), `404 Not Found` (unknown execution).

### `GET /api/neuroquery/robustness/{analysis_id}`
- **Description:** Retrieves cached robustness analysis and reproducibility manifest.
- **Response:** `RobustnessAnalysisResponse` (or `404 Not Found`).

---

## 8. Verification Results

All suites were executed directly against the real codebase and live Janelia MaleCNS v1.0 local Feather dataset:

| Verification Suite | Target | Status | Output / Details |
| :--- | :--- | :--- | :--- |
| **Backend Unit Tests** | `tests/test_backend.py` | **PASS** | `100 passed` in 3.53s |
| **Real Data Integration Tests** | `tests/test_backend.py -m integration` | **PASS** | `15 passed` in 23.91s |
| **Knowledge Catalog Validator** | `scripts/validate_knowledge.py` | **PASS** | 7 concepts, 6 sources, 7 mappings verified |
| **Frontend Unit & Component Tests** | `npm test --prefix frontend -- --run` | **PASS** | 8 test files, `62 passed` |
| **Frontend Production Build** | `npm run build --prefix frontend` | **PASS** | Clean build (`dist/assets/index-s2HVlDkb.js`, 0 errors) |
| **Live End-to-End Verification** | `e2e_verify.py` | **PASS** | **40 / 40 checks passed** on live server |
| **Browser Visual Flow** | `browser_subagent` | **PASS** | End-to-end question $\to$ plan $\to$ execution $\to$ Robustness Lab |

---

## 9. Scientific Integrity Disclosures & Non-Claims

1. **Computational Stability $\neq$ Biological Proof:**
   A candidate neuron or directed connection that remains highly ranked across all parameter sweeps is computationally stable under the tested models. It does **not** prove physiological necessity, in vivo activity, or behavioural sufficiency.
2. **Deterministic Parameter Variation:**
   Parameter sweeps are deterministic computational grid searches. No statistical significance, $p$-values, or biological confidence intervals are claimed.
3. **Dataset Scope:**
   MaleCNS v1.0 represents a traced-only subset of the adult male *Drosophila melanogaster* central nervous system. Unannotated or truncated fragments are not evaluated.
4. **Structural Connectivity $\neq$ Dynamical Simulation:**
   Directed edges represent anatomical chemical synapses. BrainDebugger does not simulate action potential kinetics, membrane potentials, or neurotransmitter dynamics.

---

## 10. Release Decision

**Recommendation:** `READY WITH DOCUMENTED LIMITATIONS`

All 35 acceptance criteria from Parts 1 through 11 are satisfied. Version 9 functionality remains completely intact with 0 regressions, and Version 10 delivers a scientific, reproducible circuit robustness and sensitivity-analysis lab over the authentic Janelia MaleCNS connectome.
