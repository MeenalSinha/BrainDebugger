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

## Security

- API credentials are never stored in source code, commit history, or client bundles.
- Internal exception stack traces are masked behind structured API errors.
- Dataset paths and environment variables are managed via `.env` (gitignored).
