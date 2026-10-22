# BrainDebugger

**Developer tools for exploring biological neural networks.**

Interactive connectome exploration platform for the **Janelia MaleCNS v1.0** dataset.

> Dataset: Schlegel et al., *Whole-brain annotation and multi-connectome cell typing of Drosophila*, Nature 634, 139–152 (2024). CC BY 4.0.

---

## What is this?

BrainDebugger applies a software-debugger metaphor to biological neural circuits.
Instead of inspecting functions and variables, researchers inspect neurons, synaptic connections, anatomical annotations, and local network structure.This release implements:
- **V0 — Foundation & Data Audit**: Backend data access, neuPrint/local Feather abstraction, API, configuration, and audit tests.
- **V1 — Connectome Explorer**: Interactive three-panel interface (search/filter, Cytoscape.js neighborhood graph, basic inspector).
- **V2 — Enhanced Neuron Inspector & Connectivity Intelligence**: Production-grade neuron inspector with collapsible profile sections, bi-directional connectivity intelligence summary, sortable/filterable/paginated connection tables with relative weight bars, honest scientific provenance disclosure, and race-condition-free async lifecycle.
- **V3 — Neural Pathway Tracer & Downstream Cascade Analysis**: Dedicated workspace for tracing multi-hop directed structural pathways between arbitrary neurons, discovering and comparing alternative routes with shortest-hop and mathematically sound weight-prioritized rankings, and computing downstream reachability cascades grouped by hop distance with layer-by-layer graph visualization and full Inspector synchronization.

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
- **Hop distance ≠ physical latency or time**: A graph hop is a synaptic junction step, not a physiological conduction delay or temporal duration.
- **Synapse count ≠ conductance**: Connection weights represent recorded synaptic counts in the Janelia EM dataset, not electrical conductance, transmission probability, or synaptic efficacy.
- **Weight heuristic ≠ calibrated probability**: The relative weight fraction metric is a structural prioritization tool within the loaded graph subset, not a physiological probability of post-synaptic firing.
- **Traced-only scope**: Edge records derive from `connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather`. Neurons with few or zero traced partners may possess untraced or unannotated biological connections not represented in this subset. Absence of a route within the configured search limits means "no qualifying route was found within the searched graph and configured limits," not that the neurons are biologically disconnected.
- **Excitatory/inhibitory caution**: Neurotransmitter predictions are machine-learning consensus predictions; physiological sign (excitation vs inhibition) cannot be determined solely from synapse counts.

---

## Roadmap

- V0 ✅ Foundation & Data Audit
- V1 ✅ Connectome Explorer
- V2 ✅ Enhanced Neuron Inspector & Connectivity Intelligence
- V3 ✅ Neural Pathway Tracer & Downstream Cascade Analysis
- V4 — Neural Debugger (synaptic breakpoint evaluation, activity traces)
- V5 — Perturbation Lab (in-silico ablations, circuit rewiring)

---

## Security

- API credentials are never stored in source code, commit history, or client bundles.
- Internal exception stack traces are masked behind structured API errors.
- Dataset paths and environment variables are managed via `.env` (gitignored).
