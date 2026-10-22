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
     Local Feather Data Provider (Optimized in-memory indexing)
                 │
   MaleCNS v1.0 Feather Files (local)
```

All authenticated data access happens on the backend. The frontend never touches dataset files or neuPrint credentials directly.

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

The backend loads and indexes the Feather files on startup (~12s load time with optimized body-stats filtering).

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

- **Synapse count ≠ conductance**: Connection weights in the dataset represent recorded synaptic counts, not physiological conductance or synaptic strength.
- **Excitatory/inhibitory caution**: Neurotransmitter predictions are machine-learning consensus predictions; physiological valence should not be assumed solely from synapse weight.
- **Traced-only scope**: Edge records derive from `connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather`. Neurons with few or zero traced partners may have untraced or unannotated biological connections not represented in this subset.
- **Boundaries**: Neighborhood graphs display bounded egocentric subsets (`MAX_GRAPH_NODES`), not the entire 25.5M edge network.

---

## Roadmap

- V0 ✅ Foundation & Data Audit
- V1 ✅ Connectome Explorer
- V2 ✅ Enhanced Neuron Inspector & Connectivity Intelligence
- V3 — Neural Pathway Tracer (multi-hop pathfinding, downstream cascade analysis)
- V4 — Neural Debugger (synaptic breakpoint evaluation, activity traces)
- V5 — Perturbation Lab (in-silico ablations, circuit rewiring)

---

## Security

- API credentials are never stored in source code, commit history, or client bundles.
- Internal exception stack traces are masked behind structured API errors.
- Dataset paths and environment variables are managed via `.env` (gitignored).
