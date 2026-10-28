# BrainDebugger V12 — Research Program Synthesis, Evidence Gap Analysis & Study Prioritization Report

**Project:** BrainDebugger — Interactive Neural Connectome Investigation Platform  
**Dataset:** Janelia MaleCNS v1.0 (`male-cns:v1.0`, local Feather storage: 211,577 neurons, 25,563,197 synaptic connections)  
**Release Version:** Version 12.0.0  
**Date:** October 28, 2026  
**Lead Architect & Auditor:** Senior Full-Stack Engineer, Computational Neuroscientist & Software Architect  

---

## Executive Summary

BrainDebugger Version 12 elevates the platform from individual hypothesis formulation (introduced in Version 11) to an integrated, project-level **Research Program Synthesis, Evidence Gap Analysis & Study Prioritization Engine**. 

Researchers can now coordinate multiple related hypotheses within a single project, synthesize overlapping evidence, detect structural contradictions, systematically uncover evidence gaps across eight scientific dimensions, prioritize follow-up investigations using transparent multi-factor scoring, plan dependency-constrained research programs with DAG cycle prevention, and execute multi-study campaigns with failure isolation and automated report generation.

```
Research Project ──> Multiple Hypotheses ──> Evidence Synthesis ──> Gap Analysis 
                             │
                             ▼
Reproducible Reports <── Cross-Study Synthesis <── Multi-Study Campaign <── Dependency DAG
```

---

## 1. V11 Audit & Gate Verification

As required by the V12 specifications, a comprehensive audit of the Version 11 codebase was performed prior to any Version 12 development. The audit evaluated:
1. **Hypothesis Workbench Service (`backend/hypothesis_service.py`):** Verified rule-based suggestion generation, structured hypothesis lifecycle transitions, evidence ledger recording, alternative explanation bias accounting, follow-up study execution, and reproducible markdown reporting.
2. **Durable Local Storage:** Verified local-first persistence, project collections, research timelines, and versioned JSON notebook export/import (`schema_version: "1.0.0"`).
3. **Frontend Hypothesis Workbench & Notebook:** Verified all tabs, Kanban drag-and-drop state transitions, Cytoscape evidence relationship maps, and study execution flows.
4. **Test Suite Health:** All 109 unit tests, 15 integration tests, 10 frontend test suites (70 tests), and 46 live E2E checks were executed and verified passing.

The full audit findings and verification logs are preserved in [`docs/V11_AUDIT_REPORT.md`](file:///c:/Users/Meenal%20Sinha/Downloads/BrainDebugger/docs/V11_AUDIT_REPORT.md). **Gate Status: PASS**.

---

## 2. Core Scientific & Algorithmic Capabilities in V12

### 2.1 Project-Level Research Program Synthesis

The platform aggregates all hypotheses, evidence records, and proposed follow-up studies associated with a research project:
- **Status Distribution:** Real-time breakdown across all 7 hypothesis lifecycle states (`draft`, `ready_for_testing`, `under_investigation`, `supported_by_computational_evidence`, `contradicted_by_computational_evidence`, `inconclusive`, `archived`).
- **Freshness & Staleness Tracking:** Automated timestamps calculating the elapsed duration since the last hypothesis modification or study run. Items with no updates in >7 days are flagged for review.
- **Project Provenance Fingerprint:** SHA-256 manifest hash combining dataset version (`male-cns:v1.0`), knowledge catalog version, and hypothesis list.

### 2.2 Cross-Hypothesis Evidence Synthesis & Independence Tracking

A common pitfall in computational neuroscience is confirmation bias from treating multiple citations of the same underlying execution or literature paper as independent biological replications. V12 introduces the **Evidence Relationship Index**:
- **Shared Source Classification:** When multiple hypotheses cite the same `source_execution_id`, `source_robustness_id`, or scientific DOI, the index classifies it as `is_shared: True, is_independent: False`.
- **Anti-Inflation Warning:** The engine automatically issues a caveat:
  > *"Referenced across N separate hypotheses; provides common provenance, NOT independent corroboration."*
- **Concept Overlap:** Quantifies shared versus distinct high-level biological concepts (e.g. `giant_fiber_escape_circuit` vs `visual_motion_detection_t4_t5`).
- **Directed Candidate & Edge Overlap:** Preserves strict directionality in Janelia MaleCNS v1.0. An edge $u \to v$ is strictly non-interchangeable with $v \to u$. Shared edges and distinct directed edges are tracked independently.

### 2.3 Deterministic Contradiction & Inconsistency Review Queue

The system automatically detects scientific and topological inconsistencies across project hypotheses:
1. **Opposing Evaluation Statuses:** Hypotheses targeting identical candidate neurons with conflicting statuses (e.g. `supported` vs `contradicted`).
2. **Conflicting Parameter Sensitivity:** Hypotheses claiming opposite stability behavior under equivalent threshold variations.
3. **Contradictory Causal Roles:** Hypotheses asserting incompatible excitation/inhibition or driver/modulator roles for the same target neuron.
4. **Researcher Review Queue:** Each detected conflict creates a `ContradictionRecord` with severity (`high`, `medium`, `low`) and review workflow (`pending_review`, `confirmed_contradiction`, `false_positive`, `resolved_by_study`, `reconciled_scope`). Researchers must submit a `resolution_rationale` to advance status.

### 2.4 Evidence Gap Analysis & Actionability Assessment

V12 systematically catalogs missing or deficient research evidence across eight standardized categories:
| Gap Category | Definition & Trigger Condition | Actionability |
| :--- | :--- | :--- |
| `missing_source_evidence` | Hypothesis has zero supporting or contextual evidence records attached. | High |
| `insufficient_structural_evidence` | Structural connectivity claim lacking direct pathway verification or synapse counts. | High |
| `missing_robustness_evaluation` | Candidate stability hypothesis lacking parameter variation sweeps ($I(v)$). | High |
| `incomplete_followup_study` | Proposed follow-up study registered in `pending` or `failed` state. | High |
| `conflicting_results` | Hypothesis contains both supporting and contradicting evidence records. | High |
| `provenance_gap` | Evidence record lacking source execution ID, robustness ID, or DOI citation. | Medium |
| `coverage_limitation` | Relies on biological concepts marked `requires_review` or `incompatible`. | Low (Upstream) |
| `unverified_interpretation` | Hypothesis claims causal function without formal alternative explanation controls. | High |

Each gap provides an explicit action recommendation, status tracking (`open`, `addressed`, `resolved`, `dismissed`), and resolution notes.

### 2.5 Transparent Research Agenda Prioritization

Follow-up investigations are prioritized using a transparent, deterministic multi-factor scoring model:

$$S = \sum_{i} w_i \cdot F_i = w_{\text{gap}} F_{\text{gap}} + w_{\text{hyp}} F_{\text{hyp}} + w_{\text{unc}} F_{\text{unc}} + w_{\text{feas}} F_{\text{feas}} - w_{\text{cost}} F_{\text{cost}}$$

- **Factor 1 ($F_{\text{gap}}$):** Gap Importance & Severity (0.0 to 1.0 based on severity and open count).
- **Factor 2 ($F_{\text{hyp}}$):** Hypothesis Coverage (fraction of project hypotheses addressed by the action).
- **Factor 3 ($F_{\text{unc}}$):** Uncertainty Reduction Potential (higher for unvalidated or disputed claims).
- **Factor 4 ($F_{\text{feas}}$):** Computational Feasibility (1.0 for ready studies, 0.4 for studies with unmet prerequisites).
- **Factor 5 ($F_{\text{cost}}$):** Resource Cost Penalty (estimated runtime and scenario count penalty).

The platform provides balanced default weights ($\sum w_i = 1.0$) while allowing researchers to adjust slider weights interactively in the UI.

### 2.6 Study Dependency DAG & Cycle Prevention

Studies can declare directed prerequisite dependencies (`required_prerequisite`, `recommended_followup`, `confirmatory_replication`):
- **Cycle Detection:** The system performs Depth-First Search (DFS) three-color graph cycle detection. Any attempt to register a dependency that would introduce a directed cycle (e.g. $A \to B \to A$) is rejected immediately with HTTP 400 and an error detail identifying the offending loop.
- **Topological Sorting:** Kahn's algorithm computes the valid execution sequence for multi-study execution.
- **Prerequisite Validation:** Studies whose required prerequisites are incomplete are marked `is_ready: False` with human-readable blocking reasons.

### 2.7 Controlled Multi-Study Campaign Execution

To run multiple follow-up investigations safely, the engine provides:
1. **Dry-Run Preview (`POST /campaigns/preview`):** Evaluates dependency order, counts ready vs blocked studies, estimates scenario counts, and warns if any prerequisite is unfulfilled.
2. **Explicit Confirmation Gate:** Prevents accidental long-running computation; user must confirm campaign launch.
3. **Topological Execution (`POST /campaigns/execute`):** Studies execute sequentially in topological order.
4. **Failure Isolation:** An execution failure in one study does not crash the campaign. Downstream dependent studies are marked `status: "skipped"` while independent branches continue uninterrupted.

### 2.8 Reproducible Reports & Multi-Format Exports

Researchers can export full project synthesis data in multiple formats:
- **Synthesis Markdown Report (`GET /report`):** Formatted scientific document including executive summary, cross-hypothesis matrix, active contradictions queue, open evidence gaps, prioritized agenda, and Janelia MaleCNS v1.0 dataset provenance.
- **Structured CSV Tables (`GET /export/csv?table_type=...`):**
  - `gaps`: Gap ID, category, description, actionability, status, resolution notes.
  - `contradictions`: Contradiction ID, title, severity, status, resolution rationale.
  - `agenda`: Action ID, title, action type, priority score, readiness, estimated cost.
  - `campaigns`: Campaign ID, title, status, total studies, completed count, failed count.

---

## 3. Implementation Details

### 3.1 Backend Service & Endpoints

- **Service Implementation:** [`backend/research_synthesis_service.py`](file:///c:/Users/Meenal%20Sinha/Downloads/BrainDebugger/backend/research_synthesis_service.py) (1,227 lines of typed Python 3.14).
- **Data Models:** [`backend/models.py`](file:///c:/Users/Meenal%20Sinha/Downloads/BrainDebugger/backend/models.py) (22 new V12 Pydantic models and enums).
- **REST Endpoints Mounted (`backend/main.py`):**
  - `POST /api/research/projects/{project_id}/synthesis`
  - `GET /api/research/projects/{project_id}/synthesis`
  - `POST /api/research/projects/{project_id}/contradictions/{contradiction_id}/review`
  - `PUT /api/research/projects/{project_id}/gaps/{gap_id}`
  - `POST /api/research/projects/{project_id}/agenda`
  - `GET /api/research/projects/{project_id}/agenda`
  - `POST /api/research/projects/{project_id}/dependencies`
  - `GET /api/research/projects/{project_id}/dependencies`
  - `POST /api/research/projects/{project_id}/campaigns/preview` (& alias `/api/research/campaigns/preview`)
  - `POST /api/research/projects/{project_id}/campaigns/execute` (& alias `/api/research/campaigns/execute`)
  - `GET /api/research/projects/{project_id}/campaigns/{campaign_id}` (& alias `/api/research/campaigns/{campaign_id}`)
  - `GET /api/research/projects/{project_id}/report` (& alias `/synthesis/report`)
  - `GET /api/research/projects/{project_id}/export/csv` (& alias `/synthesis/export-csv`)

### 3.2 Frontend Interactive Workspace

- **Workspace Component:** [`frontend/src/components/ResearchProgramStudio.tsx`](file:///c:/Users/Meenal%20Sinha/Downloads/BrainDebugger/frontend/src/components/ResearchProgramStudio.tsx) (780 lines of TypeScript / React 19).
- **Sub-Tabs:**
  1. *Evidence Synthesis:* Summary cards, hypothesis status breakdown, shared vs independent evidence sources with warning banners, shared candidate neurons, and strictly directed connection lists.
  2. *Contradictions Queue:* Contradiction cards with severity badges, affected hypothesis tags, conflict summaries, and interactive review modal with rationale entry.
  3. *Evidence Gaps:* Filterable gap table across the 8 categories with status badges, action recommendations, and update drawer.
  4. *Prioritized Agenda:* Interactive weight sliders, real-time formula recalculation, priority score progress bars, and transparent factor contribution tooltips.
  5. *Study Dependency DAG:* Visual prerequisite tree, dependency registration form, cycle error alerts, and readiness indicators.
  6. *Campaign Execution:* Multi-study selection, dry-run preview panel (topological order, cost estimation), confirmation launch modal, and live execution progress log.
  7. *Reports & Exports:* Markdown preview, download buttons for Markdown and 4 distinct CSV tables.
- **Top-Level Navigation:** Seamlessly added `program` workspace button in [`frontend/src/App.tsx`](file:///c:/Users/Meenal%20Sinha/Downloads/BrainDebugger/frontend/src/App.tsx).

---

## 4. Verification & Testing Matrix

| Test Layer | Target | Tests Executed | Passed | Failed | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Backend Unit Tests | `tests/test_backend.py::TestV12ResearchProgramSynthesis` | 9 | 9 | 0 | **PASS** |
| Backend Complete Suite | `tests/test_backend.py` (V1–V12) | 118 | 118 | 0 | **PASS** |
| Frontend Component Tests | `frontend/src/ResearchProgramStudio.test.tsx` | 4 | 4 | 0 | **PASS** |
| Frontend Complete Suite | `vitest run` (11 test suites) | 74 | 74 | 0 | **PASS** |
| Frontend Production Build | `npm run build` (`tsc && vite build`) | — | — | 0 | **PASS** |
| Live End-to-End Suite | `scripts/run_e2e_with_server.py` (Checks 1–52) | 52 | 52 | 0 | **PASS** |

### Live E2E Checks 47–52 Verification Summary:
- **Check 47 (Project Evidence Synthesis):** Verified shared evidence source identification between hypotheses without confirmation inflation, concept overlap, and strict directed edge handling ($[u, v] \neq [v, u]$).
- **Check 48 (Contradiction Review):** Verified contradiction queue retrieval and researcher review transition with rationale.
- **Check 49 (Evidence Gap Lifecycle):** Verified detection of missing robustness gaps and status update to `resolved`.
- **Check 50 (Deterministic Agenda Prioritization):** Verified multi-factor score calculation ($S = \sum w_i F_i$) and custom weight application.
- **Check 51 (Dependency DAG & Cycle Prevention):** Verified prerequisite registration and immediate rejection of circular dependency ($A \to B \to A$) with HTTP 400.
- **Check 52 (Campaign Execution & Export):** Verified topological preview ordering, campaign execution with isolated failure handling, Markdown synthesis report export, and CSV table generation.

---

## 5. Summary of Compliance with Project Guidelines

1. **V11 Audit Pre-Condition:** Fully respected and recorded in `docs/V11_AUDIT_REPORT.md`.
2. **Scientific Integrity & Anti-Inflation:** Multiple citations of the same underlying data source are strictly flagged as non-independent common provenance.
3. **Directed Edge Semantics:** All connection comparisons and graph extractions treat synaptic edges as strictly directed.
4. **Source Immutability:** The local Janelia MaleCNS v1.0 Feather files were verified untouched (0 persistent mutations).
5. **No Breaking Changes:** All V0–V11 APIs, models, and UI panels remain fully functional and backward-compatible.
