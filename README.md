# BrainDebugger

**Developer tools for exploring biological neural networks.**

Interactive connectome exploration platform for the **Janelia MaleCNS v1.0** dataset.

> Dataset: Schlegel et al., *Whole-brain annotation and multi-connectome cell typing of Drosophila*, Nature 634, 139–152 (2024). CC BY 4.0.

---

## What is this?

BrainDebugger applies a software-debugger metaphor to biological neural circuits.
Instead of inspecting functions and variables, researchers inspect neurons, synaptic connections, anatomical annotations, and local network structure. This release implements:
- **V0 — Foundation & Data Audit**: Backend data access, neuPrint/local Feather abstraction, API, configuration, and audit tests.
- **V1 — Connectome Explorer**: Interactive three-panel interface (search/filter, Cytoscape.js neighborhood graph, basic inspector).
- **V2 — Enhanced Neuron Inspector & Connectivity Intelligence**: Production-grade neuron inspector with collapsible profile sections, bi-directional connectivity intelligence summary, sortable/filterable/paginated connection tables with relative weight bars, honest scientific provenance disclosure, and race-condition-free async lifecycle.
- **V3 — Neural Pathway Tracer & Downstream Cascade Analysis**: Dedicated workspace for tracing multi-hop directed structural pathways between arbitrary neurons, discovering and comparing alternative routes with shortest-hop and mathematically sound weight-prioritized rankings, and computing downstream reachability cascades grouped by hop distance with layer-by-layer graph visualization and full Inspector synchronization.
- **V4 — Neural Debugger: Interactive Structural Path Tracing, Breakpoints & Execution History**: Developer-tools-style interactive debugging environment that turns any selected V3 directed pathway into an inspectable, deterministic execution trace with step navigation, pause/continue/stop/restart controls, configurable breakpoints (Neuron ID, Hop Index, Cell Type/Superclass Annotation, Recorded Synapse Weight Threshold), a transparent monotonically ordered execution event log, and JSON export.
- **V5 — Perturbation Lab**: Simulated neural damage, connectivity analysis & network resilience.
- **V6 — NeuroQuery Foundation & Biological Knowledge Layer**: Versioned concept catalog, authentic scientific citations with direct DOIs, mapping engine, and Knowledge Explorer.
- **V7 — NeuroQuery Natural-Language Understanding & Structured Investigation Planning**: Dedicated natural-language question interface ("Ask NeuroQuery"), backend LLM provider abstraction (offline deterministic MockLLMProvider and OpenAI-compatible client), intent classification, V6 concept resolution, strict validation, interactive clarification flow, and structured JSON plan export.
- **V8 — NeuroQuery: Evidence-Grounded Neural Circuit Discovery Engine**: Transforms validated investigation plans into reproducible, inspectable neural circuits using real Janelia MaleCNS v1.0 data. Discovers candidate neurons preserving complete V6 provenance, retrieves actual directed connections from contiguous adjacency indexes, constructs bounded directed subgraphs, computes structural metrics, ranks candidates transparently using dual criteria (evidence tier + synaptic connectivity), and renders interactive Cytoscape graphs with 1-click handoffs to Connectome Explorer, Neuron Inspector, Pathway Tracer, Neural Debugger, and Perturbation Lab.
- **V9 — Interactive Circuit Exploration, Explainability & Comparative Analysis Studio**: Interactive Cytoscape canvas with live neighborhood expansion (+1 hop), explainable inspector with verified citations, directed pathway tracer overlay, narrative trace provenance, dual-investigation comparison, and multi-format exports.
- **V10 — Circuit Robustness & Sensitivity Analysis Lab**: Parameterized sensitivity experiments over real Janelia MaleCNS v1.0 data. One-Factor-at-a-Time and Bounded Multi-Parameter Grid sweeps for synaptic thresholds, candidate/node caps, and what-if ranking profiles. Calculates inclusion fractions $I(v)$, median ranks, rank variability, top-$k$ retention, direction-sensitive edge stability ($u \to v \neq v \to u$), and structural metric sensitivity ($\Delta\text{Nodes}, \Delta\text{Edges}$). Generates Schema v1.0.0 reproducibility manifests and multi-format exports (JSON, Candidate CSV, Edge CSV, Metrics CSV, Markdown Report).

---

## Architecture

```
React + TypeScript + Vite + Cytoscape.js (frontend)
                 │
           Vite dev proxy
                 │
          FastAPI backend
                 │
        Application Service
                 │
     Local Feather Data Provider (Optimized in-memory contiguous indexing)
                 │
   MaleCNS v1.0 Feather Files (local)
```

All authenticated data access happens on the backend. The frontend never touches dataset files or neuPrint credentials directly. Outgoing connections are indexed contiguously in numpy slices (`_pre_index`) enabling sub-millisecond multi-hop graph traversals across 25.5 million connection records.

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- The MaleCNS v1.0 Feather files in the `data/` directory (see below)

### Required data files

Place these files in the `data/` directory (download from [Janelia FlyEM](https://www.janelia.org/project-team/flyem/malecns)):

```
data/body-annotations-male-cns-v1.0-minconf-0.5.feather
data/connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather
data/body-neurotransmitters-male-cns-v1.0.feather
data/body-stats-male-cns-v1.0-minconf-0.5.feather   (indexed and filtered at load time)
```

---

## Installation

### 1. Backend

```powershell
# From project root
pip install fastapi uvicorn pydantic pydantic-settings python-dotenv pandas pyarrow networkx pytest pytest-asyncio pytest-cov pytest-mock
```

### 2. Frontend

```powershell
cd frontend
npm install
cd ..
```

### 3. Configuration

```powershell
copy .env.example .env
# Edit .env if DATA_DIR is not ./data
```

---

## Running

### Start the backend

```powershell
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The backend loads and indexes the Feather files on startup (~15s load time with contiguous graph adjacency indexing).

### Start the frontend

```powershell
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## API Endpoints

Interactive documentation is available at:
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- Health: [http://localhost:8000/health](http://localhost:8000/health)

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | GET | Search neurons by `query` (body ID or cell type substring), `status`, `cell_type`, with limit. |
| `/api/neurons/{body_id}` | GET | Retrieve full structured neuron metadata and predicted neurotransmitter profile. |
| `/api/neurons/{body_id}/connectivity-summary` | GET | **(V2)** Retrieve bi-directional summary: partner count, total weights, body-stat synapses, and source dataset provenance. |
| `/api/neurons/{body_id}/connections` | GET | **(V2)** Paginated, sortable, and filterable connections. Supports `direction` (`incoming`\|`outgoing`), `sort_by` (`weight`\|`partner_id`\|`partner_type`), `sort_order` (`asc`\|`desc`), `partner_id`, `partner_type`, `min_weight`, `limit`, and `offset`. |
| `/api/neurons/{body_id}/neighborhood` | GET | Bounded 1-hop egocentric graph for Cytoscape.js visualization. |
| `/api/paths` | GET | **(V3)** Search directed structural pathways between `source_body_id` and `target_body_id`. Parameters: `max_hops` (1–10), `max_paths` (1–20), `strategy` (`shortest`\|`weight_prioritized`), `min_weight`. Returns ordered nodes, directed edges, hop counts, total synaptic weights, and path ranking metrics. |
| `/api/neurons/{body_id}/downstream-cascade` | GET | **(V3)** Bounded downstream reachability cascade analysis. Parameters: `max_hops` (1–6), `max_nodes` (10–2000), `max_edges` (10–5000), `min_weight`. Returns per-hop layer statistics, reachable nodes enriched with metadata, directed edges, and truncation status. |

---

## Version 4 Features

### 1. Neural Debugger Workspace
- Accessible header workspace switcher between **Connectome Explorer**, **Pathway Tracer & Downstream Cascade**, and **Neural Debugger**.
- Direct launch from any returned V3 route via the **[Debug This Path (V4)]** action in both the pathway comparison table and route breakdown card.
- Automatic initialization: if navigated directly without an active multi-hop search, initializes a valid 0-hop trace for the currently selected neuron without inventing edges.
- Workspace layout inspired by developer tools:
  - **Left panel**: Route Steps timeline (step index, hop count, active cursor indicator, click-to-jump) and Breakpoint Manager.
  - **Center canvas**: Active pathway graph with distinct cursor highlighting on the currently inspected neuron and traversed directed edge banner with synapse count.
  - **Bottom drawer**: Monotonically ordered, filterable Execution Event Log with UTC timestamps and JSON export.
  - **Right panel**: Fully synchronized Neuron Inspector showing live identity, neurotransmitter, and connectivity intelligence for the active cursor node.

### 2. Deterministic Trace-State Engine
- State machine with explicit typed transitions: `ready`, `running`, `paused`, `completed`, `stopped`, and `error`.
- Path validation: strictly validates that the route has at least one node, consecutive pairs are connected by valid directed edges, and edge directions are presynaptic-to-postsynaptic.
- Zero-hop path handling: source-equals-target routes are valid 1-node, 0-edge sessions that immediately complete on step without fabricating connections.
- Backward navigation semantics: **Previous** moves the inspection cursor to an earlier recorded node in the validated path and records a `history_navigation` event. It does **not** invent reverse biological synaptic edges.
- Concurrency & race condition safety: the auto-run interval is tracked with explicit references and cancelled on pause, stop, step, jump, restart, or component unmount.

### 3. Execution & Playback Controls
- **Step**: Advances execution by exactly one directed edge, updates the cursor, highlights the traversed edge, updates the Inspector, and evaluates breakpoints.
- **Continue**: Automatically advances through successive path steps at a configurable playback speed (250ms to 2000ms), respecting breakpoints and pause/stop requests.
- **Pause**: Suspends automatic progression while preserving the current cursor position and event history.
- **Previous**: Navigates to the preceding step for history inspection without altering path structure.
- **Stop**: Halts active execution and cancels timers, retaining the session event log.
- **Restart**: Resets the cursor back to the source node (Hop 0) with a new run identifier while preserving the complete session event history.
- **Trace Playback Speed**: Configurable interval selector (Fast 250ms, Medium 500ms, Default 750ms, Slow 1.2s, Very Slow 2.0s) explicitly labeled as playback rate, not biological firing speed.

### 4. Breakpoint System
- Four distinct structural breakpoint conditions:
  1. **Neuron Body ID**: Pauses when the trace reaches a specific neuron ID along the route.
  2. **Hop Index**: Pauses when reaching a specific structural hop distance from the source.
  3. **Anatomical Annotation**: Pauses when entering a neuron matching a configured cell type or superclass annotation.
  4. **Recorded Connection Weight Threshold**: Pauses when traversing a directed edge whose recorded synapse count meets or exceeds a specified threshold ($\ge X$ synapses).
- Initial-node breakpoint evaluation: breakpoints matching the source node (Hop 0) evaluate immediately at session creation, pausing at Step 0 with an explanation banner before auto-advance begins.
- Breakpoint management: toggle enabled/disabled, view hit counts and last-hit step, and delete breakpoints dynamically.
- Resumable: stepping or continuing after a breakpoint hit advances past the condition without infinite re-triggering loops.

### 5. Execution Event Log & JSON Export
- Monotonically increasing sequence IDs (`seq: 1, 2, 3...`) and ISO UTC timestamps.
- Structured event types: `session_created`, `trace_started`, `node_entered`, `edge_traversed`, `step_advanced`, `history_navigation`, `breakpoint_created`, `breakpoint_toggled`, `breakpoint_removed`, `breakpoint_triggered`, `trace_paused`, `trace_resumed`, `trace_stopped`, `trace_completed`, and `trace_reset`.
- Filterable timeline: filter by `All`, `Steps` (traversal events), or `Breakpoints`.
- Click-to-inspect: clicking an event jumps the inspection cursor to that step without fabricating execution events.
- **Export JSON**: One-click export of complete session metadata, route specification, breakpoint rules, event history, and scientific disclosures.

---

## Version 3 Features

### 1. Pathway Tracer Workspace
- Accessible header workspace switcher between **Connectome Explorer** and **Pathway Tracer & Downstream Cascade**.
- State preservation across workspace switches: selection, search queries, and graph views remain active.
- Quick action buttons in the Neuron Inspector: **Set Source**, **Set Target**, and **Trace Cascade** to immediately transition from inspection to circuit tracing.

### 2. Directed Shortest-Path & Alternative Routes
- Directed BFS traversal strictly preserving presynaptic-to-postsynaptic edge orientation ($u \rightarrow v$).
- Yen's K-shortest simple paths algorithm discovers up to $k$ structurally distinct simple routes without infinite cycle loops.
- Exact edge case handling: source-equals-target returns a valid zero-hop path, and reversed-direction searches correctly report no qualifying directed path without inventing edges.
- Route comparison table displaying rank, hop count, path structure, cumulative synaptic count, bottleneck synapse weight, and path score.
- Clicking any route in the table highlights its specific nodes and edges in vibrant gold in the Cytoscape graph canvas.

### 3. Mathematically Documented Weight-Prioritized Ranking
- Outgoing connection weight fraction:
  $$p(v \mid u) = \frac{w(u,v)}{\sum_{x \in O(u)} w(u,x)}$$
- Total route transition score:
  $$S(P) = \prod_{(u,v) \in P} p(v \mid u)$$
- Optimized via strictly additive log-cost with Dijkstra's algorithm:
  $$C(P) = -\sum_{(u,v) \in P} \ln p(v \mid u)$$
- Scientific qualification: This heuristic prioritizes routes with higher relative outgoing synapse proportions within the traced connectome. It does not represent a calibrated biological action-potential transmission probability.

### 4. Downstream Reachability Cascade Analysis
- Directed breadth-first traversal determining the minimum structural hop distance from the root neuron.
- Reconvergent route deduplication: each reachable neuron is placed exclusively in its earliest discovered hop layer without duplication.
- Cycle safety: previously explored nodes are never re-enqueued, preventing infinite loops.
- Comprehensive hop layer breakdown table: newly reached nodes, cumulative reachable nodes, layer edge count, and cumulative synaptic weight.
- Strict limit enforcement (`max_hops`, `max_nodes`, `max_edges`) with clear partial-result warnings (`MAX_NODES_REACHED`, `MAX_EDGES_REACHED`).

### 5. Interactive Cytoscape.js Graph & Inspector Integration
- Layered hierarchical layout for cascades: root node in green halo, Hop 1 direct partners in cyan, Hop 2 in blue, Hop 3+ in purple.
- Clicking any node in either pathway or cascade graphs immediately updates the Neuron Inspector with complete anatomical, neurotransmitter, and connectivity intelligence.
- Hover tooltips and edge synapse count labels (`XX syn`) for clear quantitative inspection.

---

## Version 2 Features

### 1. Structured Neuron Profile
- Prominent identity header with body ID, cell type, instance name, status tag (`Traced`, etc.), neurotransmitter badge, and superclass.
- Clean collapsible sections for **Anatomical & Cell Type**, **Predicted Neurotransmitter**, **Tracing & Status Metadata**, and **Extended Annotations**.
- Honest handling of missing annotations (`—` / unavailable badge) without coercing nulls to zero.

### 2. Connectivity Intelligence Summary
- High-level overview cards separating **Outgoing (Presynaptic)** and **Incoming (Postsynaptic)** connections.
- Displays partner count, total synaptic weight, connection records, and verified pre/post synaptic sites from `body-stats`.
- Explicit source-scope badge identifying the `male-cns:v1.0` traced-only subset (min confidence 0.5).

### 3. Sortable, Filterable, Paginated Connection Tables
- Tabbed direction switcher (`Outgoing` vs `Incoming`).
- Search filter for partner ID or cell type substring, and minimum synaptic weight filter.
- Multi-field sorting: sort by synaptic weight (desc/asc), numerical partner ID, or partner cell type.
- Synaptic weight bar indicator showing relative weight within the current result set and percentage contribution to total directional weight.
- Clickable/keyboard-accessible partner links to seamlessly re-center inspection and graph view on synaptic partners.

### 4. Robust Async State Management
- Request tracking and `AbortController` cancellation to eliminate race conditions when rapidly clicking between partners.
- Granular error boundaries with independent retry buttons for profile, summary, and connection sections.

---

## Testing

### Backend Unit Tests (no data files required)

```powershell
python -m pytest tests/ -v -m "not integration"
```

### Backend Integration Tests (live local Feather files)

```powershell
python -m pytest tests/ -v -m integration
```

### Frontend Vitest Suite

```powershell
npm test --prefix frontend
```

### Frontend Production Build

```powershell
npm run build --prefix frontend
```

---

## Scientific Assumptions and Limitations

- **Structural connectivity ≠ biological signal propagation**: A directed graph path reveals anatomical wiring, but does not prove that an action potential traverses that route during a specific biological behavior.
- **Trace execution ≠ physiological firing**: The Neural Debugger traverses recorded structural connections in the Janelia MaleCNS connectome. It does not execute a biophysical simulation of membrane voltage, ion channels, or action potentials.
- **Breakpoints ≠ physiological firing thresholds**: A breakpoint pauses graph traversal because a structural condition (neuron ID, hop index, annotation, or recorded weight) matched. It does not indicate cellular activation.
- **Playback speed ≠ conduction velocity**: Debugger playback intervals control how quickly the user interface advances along graph steps. They do not model physiological axonal conduction velocity or synaptic delay.
- **Event history ≠ biological recording**: The execution event log documents software debugging operations and graph traversal events. It is not an in-vivo neurophysiological recording.
- **Hop distance ≠ physical latency or time**: A graph hop is a synaptic junction step, not a physiological conduction delay or temporal duration.
- **Synapse count ≠ conductance**: Connection weights represent recorded synaptic counts in the Janelia EM dataset, not electrical conductance, transmission probability, or synaptic efficacy.
- **Weight heuristic ≠ calibrated probability**: The relative weight fraction metric is a structural prioritization tool within the loaded graph subset, not a physiological probability of post-synaptic firing.
- **Traced-only scope**: Edge records derive from `connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather`. Neurons with few or zero traced partners may possess untraced or unannotated biological connections not represented in this subset. Absence of a route within the configured search limits means "no qualifying route was found within the searched graph and configured limits," not that the neurons are biologically disconnected.
- **Excitatory/inhibitory caution**: Neurotransmitter predictions are machine-learning consensus predictions; physiological sign (excitation vs inhibition) cannot be determined solely from synapse counts.

---

- V0 ✅ Foundation & Data Audit
- V1 ✅ Connectome Explorer
- V2 ✅ Enhanced Neuron Inspector & Connectivity Intelligence
- V3 ✅ Neural Pathway Tracer & Downstream Cascade Analysis
- V4 ✅ Neural Debugger (interactive structural path tracing, breakpoints & execution history)
- V5 ✅ Perturbation Lab (simulated neural damage, connectivity analysis & network resilience)
- V6 ✅ NeuroQuery Foundation & Biological Knowledge Layer (versioned concepts, verified evidence with DOIs, mapping engine, supported investigations & Knowledge Explorer)
- V7 ✅ NeuroQuery Natural-Language Understanding & Structured Investigation Planning (Ask NeuroQuery workspace, LLM provider abstraction, intent classification, V6 concept resolution, plan validation & clarification flow)

---

## Version 7 Features — NeuroQuery Natural-Language Understanding & Planning

Version 7 introduces **Ask NeuroQuery**, enabling researchers to formulate biological and structural questions in natural language and translate them into validated, structured, evidence-aware investigation plans grounded in the Janelia MaleCNS v1.0 connectome and V6 knowledge registry.

### Strict Scope Boundary for V7
> **V7 Plan Boundary**: V7 implements natural-language parsing, intent classification, biological concept resolution against V6, plan parameter binding, validation, ambiguity clarification, and structured plan review with JSON export.
> Full automatic neural circuit discovery, subgraph construction, and graph traversal execution are strictly reserved for **V8**. V7 generates and validates plans without claiming that circuits have already been discovered.

### 1. Dedicated "Ask NeuroQuery" Workspace (`frontend/src/components/AskNeuroQuery.tsx`)
- Integrated into the main workspace switcher with a Sparkles icon.
- Natural-language question input with sample prompt buttons covering motion detection, giant fiber escape, visual looming, pathway searches, color vision, in-silico lesions, ambiguous queries, and unsupported biological topics.
- Live active provider status indicator (`Provider: mock (gpt-4o)` or live configured provider).
- Question interpretation panel displaying detected intent, estimated model confidence score with explanation, and resolved V6 concept badges.
- Structured Operations Pipeline table detailing each operation, tool name, description, parameters, prerequisites, and scope target (V7 Prepared vs V8 Execution).
- Evidence & Provenance cards with authentic publication titles, authors, journals, and direct clickable DOI links.
- Limitations disclosure and real-time backend validation report.
- Interactive controls: **Validate Plan** (`POST /api/neuroquery/validate`) and **Export JSON** (downloading machine-readable plan records).

### 2. Backend LLM Provider Abstraction (`backend/llm_provider.py`)
- Centralized configuration via environment variables:
  - `NEUROQUERY_LLM_PROVIDER`: `mock` (default for offline deterministic CI/local development) or `openai` (for live OpenAI-compatible endpoints).
  - `NEUROQUERY_LLM_BASE_URL`: API base URL (defaults to `https://api.openai.com/v1`).
  - `NEUROQUERY_LLM_MODEL`: Model identifier (defaults to `gpt-4o`).
  - `NEUROQUERY_LLM_API_KEY`: Model provider secret (redacted in representations and logs; never sent to frontend).
  - `NEUROQUERY_LLM_TIMEOUT_SECONDS`: Request timeout (default: 15s).
  - `NEUROQUERY_LLM_MAX_RETRIES`: Retry limit on transient network errors (default: 2).
- **Deterministic MockLLMProvider**: Runs fully offline with zero external network dependencies, classifying intents, resolving concepts, extracting entities, and handling ambiguity reliably.
- **Prompt Injection Defense**: Untrusted user inputs are scanned for prompt-injection patterns (`ignore instructions`, `drop table`, `eval()`); injection attempts are neutralized and classified as untrusted general queries.

### 3. Intent Classification & Concept Resolution (`backend/query_planner_service.py`)
- Controlled Intent Taxonomy (`IntentType`):
  - `circuit_discovery`: Subgraph exploration for biological processes (V7 plans; V8 executes).
  - `inspect_neuron`: Single-neuron anatomy and synaptic partner exploration.
  - `structural_pathway_search`: Directed routes between designated source and target neurons.
  - `downstream_reachability`: Divergence cascades from root neurons.
  - `structural_intervention_analysis`: In-silico lesions and network resilience experiments.
  - `general_question`: Non-graph neurobiological context.
  - `unsupported_biological_question`: Questions outside current MaleCNS annotations or evidence catalog.
  - `ambiguous_question`: Questions requiring focused clarification.
- Grounds proposed concept IDs against `knowledge_service._concepts`. Uncataloged concepts are omitted and noted in validation findings.
- Resolves authentic `EvidenceSource` citations with legitimate DOIs directly from V6.

### 4. Interactive Disambiguation & Clarification Flow
- When ambiguous or underspecified questions are submitted (e.g., *"Show me the visual circuit"*), the planner assigns `ambiguous_question` intent, sets `clarification_needed: true`, and generates focused clarification questions with contextual quick-select buttons.
- Preserves conversation context across rounds: user clarification answers are merged with the original query, narrowing the plan (e.g. to `visual_motion_detection_t4_t5` or `color_vision_spectral_processing`) and transitioning status to `ready_for_review` or `partially_supported`.

### 5. Honest Negative Handling & Parameter Bounding
- Questions addressing unsupported biological features (such as antennal courtship song acoustic subcircuits) are honestly marked as `unsupported` without fabricating candidate neurons or connections.
- Parameter bounds are enforced: `max_hops` is clamped to $[1, 5]$, `max_nodes` is clamped to $[5, 100]$, and body IDs are verified against loaded MaleCNS v1.0 annotations.

---

## Version 6 Features — NeuroQuery Foundation & Biological Knowledge Layer

Version 6 establishes the evidence-grounded biological knowledge infrastructure for **NeuroQuery** ("Ask the Connectome"). It connects abstract biological concepts to verified annotations in the Janelia MaleCNS v1.0 dataset, authentic peer-reviewed scientific citations with direct DOIs, actual connectivity, and supported graph investigations.

### 1. Biological Concept Catalog (`data/knowledge/concepts.json`)
- Versioned, typed catalog schema (`catalog_version: 1.0.0`) describing biological concepts across domains:
  - `visual_processing`: T4/T5 elementary motion detection, Mi1/Tm3 inputs, Dm8/Dm9 color vision.
  - `motor_control`: Giant Fiber escape & flight initiation circuit (`DNp01` $\to$ `TTMn`), LC4 visual looming escape.
  - `olfactory`: Antennal lobe projection neuron odor classification (`PN`).
  - `mechanosensory`: AMMC courtship song interneurons (cataloged honestly as `requires_review` and `incompatible` to verify negative handling without fabrication).
- Categorizes concepts into `verified`, `partially_supported`, `requires_review`, and `unsupported`.

### 2. Scientific Evidence Registry (`data/knowledge/evidence-sources.json`)
- Every mapping is backed by traceable peer-reviewed literature or official dataset documentation.
- Authentic DOIs linking directly to publisher repositories (e.g., Nature, eLife, Journal of Experimental Biology, Current Biology):
  - **Schlegel et al. (2024)** *Nature* `10.1038/s41586-024-07968-y`
  - **Namiki et al. (2018)** *eLife* `10.7554/eLife.34272`
  - **Takemura et al. (2017)** *eLife* `10.7554/eLife.24394`
  - **Borst & Helmstaedter (2015)** *Nature Rev Neurosci* `10.1038/nrn4050`
  - **Card & Dickinson (2008)** *J Exp Biol* `10.1242/jeb.010462`
  - **Bates et al. (2020)** *Curr Biol* `10.1016/j.cub.2020.06.042`
- Strict provenance separation: evidence type (`functional_connectomics`, `anatomical_cell_typing`) is decoupled from review status (`verified`, `partially_supported`).

### 3. Concept-to-Dataset Mapping Engine (`backend/knowledge_service.py`)
- Maps biological concepts to real MaleCNS annotation fields (`type`, `instance`, `superclass`) using `exact`, `prefix`, or `set` match rules.
- **Dynamic Candidate Retrieval**: Queries loaded `_annotations` in memory without reloading data files. Returns actual body IDs, instances, neurotransmitters, and mapping provenance.
- Distinguishes verified matches, unverified candidates, no matching records, and unsupported concepts without creating synthetic neurons or fabricated labels.

### 4. Supported Connectome Investigation Registry (`data/knowledge/supported-investigations.json`)
- Formally registers analysis pipelines implemented in BrainDebugger:
  - `inv-circuit-discovery`: Retrieve verified candidate neurons and recorded connectivity.
  - `inv-neuron-inspection`: Open detailed single-neuron anatomy, partner tables, and neurotransmitter predictions.
  - `inv-pathway-search`: Multi-hop directed shortest-path and weight-prioritized search.
  - `inv-downstream-cascade`: Compute multi-hop downstream reachability cascades.
  - `inv-perturbation-analysis`: Run non-destructive in-silico lesions and network resilience experiments.

### 5. Automated Catalog Validator (`scripts/validate_knowledge.py`)
- Command-line tool for continuous integration and development auditing:
  ```powershell
  python scripts/validate_knowledge.py
  ```
- Validates JSON schemas, detects broken mapping references or dangling source IDs, and verifies dataset annotation compatibility against loaded MaleCNS files.

### 6. Knowledge Explorer Workspace (`frontend/src/components/KnowledgeExplorer.tsx`)
- Lightweight workspace in the topbar switcher:
  - **Concept Browser**: Search concepts, filter by biological domain, evidence status, and dataset compatibility.
  - **Concept Details**: Displays scientific descriptions, domain tags, limitations, and caveats.
  - **Evidence Cards**: Lists peer-reviewed publications with clickable DOI links.
  - **Mapping Rules**: Documents target annotation fields, target values, rationales, and known limitations.
  - **Candidate Neurons Table**: Lists actual matching neurons from MaleCNS v1.0 with 1-click navigation to the **Neuron Inspector**, **Connectome Explorer**, or **Pathway Tracer**.
  - **Audit Modal**: Instant inspection of catalog health, schema validity, compatible/incompatible mappings count, and coverage notes.

---

## Version 5 Features — Perturbation Lab

The **Perturbation Lab** provides a controlled, in-silico environment for researchers to simulate neural lesions and structural disconnections on temporary graph representations of the Janelia MaleCNS v1.0 connectome without modifying the original source data.

### 1. Non-Destructive Computational Graph Overlay
- Interventions operate as temporary exclusions during BFS/Dijkstra traversals and downstream cascades.
- **Strict Data Immutability**: Underlying Arrow/Feather files, pandas DataFrames, and NumPy contiguous adjacency indexes (`_pre_index`) remain 100% read-only and immutable.
- Resetting or undoing interventions instantaneously restores the baseline network view without reloading dataset files.

### 2. Targeted In-Silico Lesions
- **Disable Neuron**: Temporarily excludes a specific neuron by body ID along with all its incoming and outgoing incident connections.
- **Disable Directed Connection**: Excludes an individual recorded directed edge ($u \to v$) without disabling the reverse connection ($v \to u$, if present) or other connections incident to $u$ and $v$.
- **Endpoint Handling**: If a selected source or target neuron itself is disabled, the perturbation analysis detects endpoint unavailability rather than inventing replacement routes.

### 3. Quantitative Before-and-After Comparative Analysis
- **Reachability Retention ($\Delta R$)**: Measures the reduction in downstream reachable neurons within a declared hop radius ($\Delta R = R_{\text{baseline}} - R_{\text{perturbed}}$).
- **Per-Hop Retention Breakdown**: Layer-by-layer audit of newly reached nodes, cumulative reachable population, and retention percentages.
- **Pathway Survival & Detour Penalty ($\Delta H$)**: Determines whether the original shortest route survives, or detects alternative structural detours with exact hop detour penalties ($\Delta H = H_{\text{perturbed}} - H_{\text{baseline}}$).
- **Disconnected Node Identification**: Generates a verified list of neurons that were reachable in the baseline network but lost after the intervention.

### 4. Controlled Resilience Experiments
- **Reproducible Random Lesions**: Samples eligible neurons within the declared graph scope using a recorded pseudo-random seed. The exact intervention can be reproduced across sessions.
- **High-Degree Bottleneck Removal**: Identifies and removes the most connected hubs (by total degree, out-degree, or in-degree) to measure network vulnerability.
- **Multi-Level Progressive Lesion Curves**: Evaluates resilience at multiple exclusion levels (e.g., 1, 2, 5, 10 neurons removed) to map structural reachability degradation.

### 5. Interactive Cytoscape Visualizer
- Color-coded node and edge encoding:
  - Source neuron (emerald green)
  - Target neuron (violet)
  - Intact network neurons (cyan)
  - Disabled neurons (rose with red border)
  - Lost reachable neurons (amber yellow)
  - Surviving alternative route edges (emerald green line)
  - Excluded/severed connections (dashed rose line)

### 6. Reproducibility & JSON Export
- Exports complete, versioned JSON records containing:
  - Unique experiment ID and UTC timestamp
  - Dataset identity and provenance (`male-cns:v1.0`)
  - Configured analysis scope, limits, and random seed
  - Applied intervention overlay configuration
  - Baseline vs. perturbed quantitative metrics
  - Complete list of lost node IDs
  - Mandatory scientific qualifications and caveats

---

## Version 8 Features — NeuroQuery Circuit Discovery Engine

The **NeuroQuery Circuit Discovery Engine** closes the loop between natural-language questions and empirical connectome analysis by executing validated V7 investigation plans against the real Janelia MaleCNS v1.0 dataset.

### 1. Controlled Plan Execution Engine
- Revalidates plans at runtime against an explicit operation allowlist (`op-concept-mapping`, `op-subgraph-expansion`, `op-circuit-ranking`, `op-neuron-profile`, `op-pathway-tracer`, `op-downstream-cascade`, `op-perturbation-simulation`).
- **No Arbitrary Code Execution**: The LLM suggests investigation plans; the backend strictly enforces typed service execution without executing arbitrary code, shell commands, or unauthorized graph traversals.
- Tracks execution lifecycle (`queued`, `running`, `completed`, `partially_completed`, `failed`) and maintains persistent execution records accessible via `GET /api/neuroquery/executions/{execution_id}`.

### 2. Evidence-Grounded Candidate Discovery
- Resolves plan concepts against the V6 Biological Knowledge Catalog (`data/knowledge/`).
- Queries actual MaleCNS annotation records via the local Feather data provider.
- Preserves full provenance for each candidate:
  - Exact body ID and annotation metadata (`type`, `instance`, `superclass`, `consensus_nt`).
  - Matched concept ID and mapping ID.
  - Matched field and value.
  - Evidence tier: Tier 1 (Verified), Tier 2 (Partially Supported), Tier 3 (Requires Review), Tier 4 (Incompatible/Honest Negative).
  - Supporting peer-reviewed publications with authentic DOIs.

### 3. Bounded Neural Subgraph Construction
- Retrieves actual presynaptic and postsynaptic connections using pre-indexed contiguous NumPy adjacency slices (`_pre_index`).
- Strictly enforces graph boundaries (`max_subgraph_nodes`, `min_edge_weight`, `max_hops`) to prevent unbounded graph expansion across 211,577 neurons.
- Flags partial results if configured node/edge limits truncate subgraph construction.
- Preserves directed synaptic edge convention: Presynaptic neuron $\to$ Postsynaptic neuron.

### 4. Transparent Dual-Criteria Ranking
- Combines biological evidence validation with empirical graph topology:
  - **Evidence Tier Weight**: Verified ($1000$ pts), Partially Supported ($500$ pts), Requires Review ($200$ pts), Incompatible ($0$ pts).
  - **Synaptic Connectivity**: Synapses between candidates ($+2.0 \times \text{weight}$), direct connections ($+5.0 \times \text{degree}$), external connections ($+0.5 \times \text{weight}$).
  - Monotonically sorted with deterministic tie-breaking and human-readable explanations.

### 5. Interactive Circuit Discovery Workspace
- Seamlessly integrated into `AskNeuroQuery.tsx`:
  - **One-Click Execution**: "Run Investigation (V8)" button enabled when plan is in `ready_for_review` status.
  - **Interactive Cytoscape Visualizer**: Canvas with bounding limits, pan, zoom, candidate highlights (cyan border), and edge weight tooltips.
  - **Candidate Neurons Table**: Sortable candidate listings with rank badges, evidence tier, and 1-click Inspector synchronization.
  - **Structural Metrics Card**: Displays total nodes, directed connections, candidate count, partner count, synapse density, average weight, and top hub neuron.
  - **Evidence & Provenance Panel**: Shows authentic citations (e.g. Takemura et al. 2017, Schlegel et al. 2024) and dataset coverage notices.
  - **Tool Handoffs**: Direct navigation to **Connectome Explorer**, **Neuron Inspector**, **Pathway Tracer**, **Neural Debugger**, and **Perturbation Lab**.

### 6. Scientific Limitations & Transparency
- Results reflect observed anatomical annotations and traced-only synaptic connection weights from Janelia MaleCNS v1.0.
- Structural connectivity identifies potential anatomical pathways, not physiological spike firing or dynamic neurotransmission.
- All non-destructive in-silico lesions and perturbations require explicit researcher confirmation before simulation.

---

## Version 9 Features — Interactive Circuit Exploration, Explainability & Comparative Analysis Studio

**BrainDebugger V9** elevates NeuroQuery from an evidence-grounded discovery engine to an interactive investigation, explainability, and comparative analysis studio.

### 1. Interactive Circuit Exploration Workspace
- **Dynamic Cytoscape Canvas**:
  - Interactive toolbar: Zoom in, Zoom out, Fit to screen, Center graph, and Reset layout.
  - Multi-layout support: Force-Directed (`cose`), Concentric, Hierarchical (`breadthfirst`), Circle, and Grid.
  - Quick Search: Instantly filter and highlight nodes by Body ID, Cell Type, or Instance.
  - Dynamic Filters:
    - Minimum synaptic weight slider ($1$ to $50+$ synapses).
    - Biological evidence tier filter (`All`, `Tier 1 Verified`, `Tier 2 Partially Supported`, `Tier 3`, `Tier 4`).
    - Superclass filter (`central`, `sensory`, `motor`, etc.).
    - Toggles: "Show Partners", "Candidate-Only Connections", and "Show Synapse Weights".
  - Accessible visual encoding:
    - Candidate neurons (purple `#8b5cf6` with thick border)
    - Contextual partners (slate `#64748b`)
    - Selected neuron (amber `#f59e0b` halo)
    - Expanded neighborhood neurons (emerald `#10b981` dashed ring)
    - Directed chemical synapses with explicit presynaptic $\to$ postsynaptic arrowheads.

### 2. Bounded Graph Neighborhood Expansion
- **Endpoint**: `POST /api/neuroquery/expand-subgraph`
- Enables researchers to explore the recorded neighborhood (+1 hop) around any selected neuron beyond the currently loaded subgraph.
- Queries authentic directed connections from Janelia MaleCNS v1.0 using contiguous CSR arrays.
- Applies strict limits (`max_nodes=15`, `min_weight`) and prevents node or edge duplication.
- Clearly flags expanded neurons and dashed connection lines to preserve the provenance boundary between the original query result and interactive expansion.

### 3. Explainable Neuron and Connection Inspector
- **"Why is this neuron included?"**: Transparently explains whether the node is an original candidate (with concept mapping ID, matched annotation field, and evidence tier), an expanded neighborhood partner, or a contextual synaptic partner.
- **Authoritative Ranking Breakdown**: Displays the exact components of the dual-criteria formula:
  $$\text{Score} = \text{Tier Weight} + (\text{Synapses} \times 0.5) + (\text{Degree} \times 10.0)$$
- **Synaptic Connection Details**: Displays presynaptic $\to$ postsynaptic body IDs, recorded weight, connection class (inter-candidate vs partner), and traced-only coverage notices.
- **Evidence Sources**: Lists peer-reviewed publications with direct DOI links.

### 4. Directed Pathway Exploration & In-Graph Route Highlighting
- Select any two visible neurons as **Pathway Source (A)** and **Pathway Target (B)**.
- Traces directed anatomical routes through the underlying connectome via `api.findPaths`.
- Highlights the exact sequence of nodes and edges directly on the Cytoscape canvas in glowing gold (`#eab308`).
- Direct handoff button to open the selected pair in the **V3 Pathway Tracer** for multi-hop detour analysis.

### 5. Investigation Narrative & Evidence Traceability
- **9-Step Chronological Reasoning Trace**:
  1. *Research Question Formulation* (Recorded Data)
  2. *Intent Classification* (Computed Result)
  3. *Biological Concept Resolution* (Catalog Evidence)
  4. *Plan Validation & Security Audit* (Computed Result)
  5. *Biological Candidate Neuron Resolution* (Recorded Data)
  6. *Evidence Mapping & DOI Verification* (Catalog Evidence)
  7. *Directed Subgraph Extraction* (Recorded Data)
  8. *Transparent Dual-Criteria Ranking* (Computed Result)
  9. *Scientific Caveats & Suggested Next Steps* (Interpretation)
- Clearly differentiates recorded biological facts from computed metrics, catalog mappings, and interpretations.

### 6. Comparative Circuit Analysis Studio
- **Endpoint**: `POST /api/neuroquery/compare`
- **Local Snapshot Storage**: Save completed investigations in browser `localStorage` (schema `1.0.0`) with custom labels.
- **Side-by-Side Comparative Metrics**:
  - Query configuration diff (question, intent, resolved concepts, dataset/catalog versions).
  - Candidate neuron overlap: $|A|$, $|B|$, shared count, unique A, unique B, Jaccard similarity index, and candidate rank shift table.
  - Directed graph topology diff: node counts, edge counts, shared directed connections, unique edges, edge Jaccard similarity, and weight shift deltas.
  - **Strict Direction Sensitivity**: An edge $u \to v$ is distinct from $v \to u$.
  - Scientific compatibility warnings for cross-version or cross-intent comparisons.

### 7. Multi-Format Reproducible Exports
- **Export Result JSON**: Complete, versioned JSON payload including plan, candidates, subgraphs, metrics, evidence, and limitations.
- **Export Candidates (CSV)**: Formatted table with Rank, Body ID, Cell Type, Instance, Superclass, Evidence Tier, Score breakdown, Synapses, Degree, and Matched Concepts.
- **Export Connections (CSV)**: Preserves Presynaptic Source, Postsynaptic Target, Synaptic Weight, Connection Class, and Expansion status.
- **Export Markdown Report**: Clean, publication-ready scientific summary document.

---

## Version 10 — Circuit Robustness & Sensitivity Analysis Lab

Version 10 introduces a scientific sensitivity-analysis workflow on top of completed V8/V9 investigations. A single investigation shows what the selected configuration produced; the Robustness Lab shows how findings change under alternative, bounded configurations.

### 1. Robustness Lab Workspace (`RobustnessLab.tsx`)
- **Integrated Workspace**: Accessible as the 4th tab in the Circuit Discovery Studio or via the "Analyze Robustness" action button.
- **KPI Summary Cards**: Live metrics for Evaluated Scenarios ($N_{\text{completed}} / N_{\text{requested}}$), Stable Candidates ($\ge 80\%$ inclusion), Stable Directed Connections, and Top-$k$ Retained Candidates.

### 2. Parameter Builder & Scenario Preview
- **Two Scenario Generation Strategies**:
  - *One-Factor-at-a-Time (OFAT)*: Varies one selected parameter while keeping all others frozen at the baseline.
  - *Bounded Multi-Parameter Grid*: Evaluates discrete cartesian combinations within a strict computational budget ($\le 25$ scenarios).
- **Supported Parameters**:
  - Minimum Synapse Weight thresholds ($1, 2, 5, 10, 15$).
  - Maximum Subgraph Nodes ($20, 40, 60, 80$).
  - Candidate Caps ($5, 10, 20, 30$).
  - What-If Ranking Profiles: `baseline_default`, `connectivity_heavy`, `hub_topology`, `evidence_prioritized`.

### 3. Stability Metrics
- **Candidate Inclusion Stability $I(v)$**:
  $$I(v) = \frac{\text{successful scenarios containing } v}{\text{total successful scenarios}}$$
  Reports exact percentages with denominators (e.g., `4/4 (100%)`), median rank, rank spread ($\text{max} - \text{min}$), and top-$k$ retention.
- **Directed Edge Stability**:
  Treats $u \to v$ strictly distinct from $v \to u$. Preserves authentic MaleCNS synaptic weights and checks strict threshold survival ($\ge 10$).
- **Metric Sensitivity**:
  Computes structural responses ($\Delta \text{Nodes}, \Delta \text{Edges}$, density, average weight) relative to baseline with responsive SVG sensitivity plots.

### 4. Reproducibility Manifest (Schema `1.0.0`)
- Records analysis ID, baseline execution ID, plan ID, research question, dataset fingerprint (`male-cns:v1.0`), catalog version (`1.0.0`), ranking formula version (`v10.0`), strategy, parameters, duration, and scientific caveats.
- Full support for browser `localStorage` snapshot saving and retrieval without recomputation.

### 5. Multi-Format Exports
- **Robustness JSON Export**: Full reproducibility manifest, scenario matrix, stability items, and metric sensitivity.
- **Candidate Stability CSV**: Body ID, cell type, evidence tier, baseline rank, median rank, rank spread, inclusion count/pct, and top-$k$ retention.
- **Edge Stability CSV**: Source, target, recorded weight, inclusion count/pct, and strict survival.
- **Metric Sensitivity CSV**: Scenario ID, parameters, $\Delta \text{Nodes}, \Delta \text{Edges}$, density, and duration.
- **Markdown Robustness Report**: Comprehensive scientific summary document.

### 6. Endpoints
- `GET /api/neuroquery/robustness/profiles`: Retrieve available ranking profiles.
- `POST /api/neuroquery/robustness/analyze`: Run bounded sensitivity analysis on an execution.
- `GET /api/neuroquery/robustness/{analysis_id}`: Retrieve completed robustness analysis results.

---

## Security

- API credentials are never stored in source code, commit history, or client bundles.
- Internal exception stack traces are masked behind structured API errors.
- Dataset paths and environment variables are managed via `.env` (gitignored).

