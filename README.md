# BrainDebugger

**Developer tools for exploring biological neural networks.**

Interactive connectome exploration platform for the **Janelia MaleCNS v1.0** dataset.

> Dataset: Schlegel et al., *Whole-brain annotation and multi-connectome cell typing of Drosophila*, Nature 634, 139–152 (2024). CC BY 4.0.

---

## What is this?

BrainDebugger applies a software-debugger metaphor to biological neural circuits.
Instead of inspecting functions and variables, researchers inspect neurons, synaptic connections, anatomical annotations, and local network structure.

This release implements:
- **V0 — Foundation & Data Audit**: Backend, data access, API, configuration, tests.
- **V1 — Connectome Explorer**: Interactive three-panel web interface.

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
     Local Feather Data Provider
                 │
   MaleCNS v1.0 Feather Files (local)
```

All authenticated data access happens on the backend. The frontend never touches the dataset files or neuPrint credentials directly.

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
data/body-stats-male-cns-v1.0-minconf-0.5.feather   (optional, for synapse counts)
```

---

## Installation

### 1. Backend

```powershell
# From project root
pip install fastapi uvicorn pydantic pydantic-settings python-dotenv pandas pyarrow networkx
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

The backend will load the Feather files on startup (may take ~2 minutes for large files).

### Start the frontend

```powershell
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## API Documentation

With the backend running, interactive API docs are available at:

- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- Health: [http://localhost:8000/health](http://localhost:8000/health)

---

## Testing

### Unit tests (no data files required)

```powershell
python -m pytest tests/ -v -m "not integration"
```

### Integration tests (require local Feather files)

```powershell
python -m pytest tests/ -v -m integration
```

Integration tests are clearly marked SKIPPED when data files are absent. A skipped integration test is not a passed test.

### Run all tests

```powershell
python -m pytest tests/ -v
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATA_DIR` | No | `./data` | Path to MaleCNS v1.0 Feather files |
| `NEUPRINT_SERVER` | No | — | neuPrint server URL (optional) |
| `NEUPRINT_DATASET` | No | `male-cns:v1.0` | neuPrint dataset identifier |
| `NEUPRINT_TOKEN` | No | — | neuPrint API bearer token |
| `MAX_SEARCH_RESULTS` | No | `100` | Max neurons per search |
| `MAX_CONNECTIONS` | No | `500` | Max connections per query |
| `MAX_GRAPH_NODES` | No | `150` | Max nodes in graph response |
| `HTTP_TIMEOUT` | No | `30` | HTTP timeout in seconds |
| `CACHE_TTL_SECONDS` | No | `300` | Cache lifetime |
| `LOG_LEVEL` | No | `INFO` | Logging level |

---

## Data Provenance & Attribution

**Dataset:** Janelia MaleCNS v1.0

**Citation:**
> Schlegel P, Yin Y, Bhimani B, Bhimani S, et al. Whole-brain annotation and multi-connectome cell typing of Drosophila. *Nature* 634, 139–152 (2024). https://doi.org/10.1038/s41586-024-07686-5

**License:** Creative Commons Attribution 4.0 International (CC BY 4.0)

**Data access:** https://www.janelia.org/project-team/flyem/malecns

**neuPrint:** https://neuprint.janelia.org (optional live API access)

---

## Scientific Assumptions and Limitations

- Connection weight = recorded synapse count. This is not calibrated physiological strength.
- Excitatory/inhibitory identity is not inferred from synapse counts.
- The local graph view shows a bounded neighborhood, not the full connectome.
- When a limit is reached, the interface displays "Partial — limit reached".
- Missing annotations are displayed as "—" (unavailable), not invented.

---

## Roadmap

- V0 ✅ Foundation & Data Audit
- V1 ✅ Connectome Explorer
- V2 — Neuron Inspector enhancements and richer inspection workflows
- V3 — Neural Pathway Tracer
- V4 — Neural Debugger (breakpoints, execution traces)
- V5 — Perturbation Lab

---

## Security

- API credentials are never stored in source code, commit history, or the frontend.
- Internal stack traces and configuration details are not sent to the frontend.
- Use a `.env` file (listed in `.gitignore`) for local credentials.
