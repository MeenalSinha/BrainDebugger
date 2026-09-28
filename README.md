# BrainDebugger

Developer tools for exploring biological neural networks.

BrainDebugger turns the Janelia MaleCNS Drosophila connectome release into a focused structural-connectivity explorer. It is built for neuron search, metadata inspection, incoming/outgoing connection review, local graph visualization, region browsing, structural graph statistics, demo workflows, and exportable reports.

## Why It Exists

Connectome data is rich, but raw synapse tables are difficult to inspect interactively. BrainDebugger borrows from Chrome DevTools, database explorers, and scientific graph tools so students and researchers can inspect structural connectivity without writing a query for every question.

## Scientific Scope

BrainDebugger is an exploratory structural-connectivity tool. It does not simulate biological firing, predict behavior, or establish physiological signal strength.

- Synapse counts are graph measurements, not automatic physiological signal strengths.
- Predicted neurotransmitters do not necessarily establish excitatory or inhibitory effects.
- A graph path is a computational exploration route, not a validated biological signal pathway.
- The bundled index is a real MaleCNS-derived demo subset for fast local interaction, not the full connectome.
- Structural metrics are computed over the indexed subset unless a route explicitly says otherwise.

## Features

- Landing overview with dataset status, indexed neuron count, connection count, regions, and indexing timestamp.
- Indexed neuron search by ID, partial ID, cell type, instance, region, superclass, neurotransmitter, and annotations represented in the demo index.
- Neuron Inspector with metadata, connectivity summary, structural graph metrics, provenance, and export actions.
- Incoming and outgoing connection tables with sorting, filtering, pagination, clickable neuron IDs, and full filtered CSV export.
- Cytoscape local neighborhood graph with hard bounded node counts, direction filters, selected edge inspection, and a structural-weight legend.
- Region explorer with all indexed regions, compact selected-region details, top cell types, and representative neurons.
- Search filters for free-text matching, region, and exact cell type.
- Export formats: Markdown, JSON, neuron CSV, and connection CSV.
- Reproducible schema audit and preprocessing scripts.

## Architecture

```text
apps/frontend  React + TypeScript + Vite + Cytoscape
apps/backend   FastAPI + Pydantic service layer
scripts        Feather schema audit and demo-index preprocessing
data/demo      Real indexed MaleCNS subset for local demo mode
docs           Schema audit and methodology notes
```

The backend serves consistent `{ data, metadata }` responses. The frontend talks to `/api/*` through Vite's local proxy.

## Dataset

Source: https://male-cns.janelia.org/download/

The downloaded flat-connectome files used here include:

- `body-annotations-male-cns-v1.0-minconf-0.5.feather`
- `body-neurotransmitters-male-cns-v1.0.feather`
- `body-stats-male-cns-v1.0-minconf-0.5.feather`
- `connectome-weights-male-cns-v1.0-minconf-0.5.feather`
- `syn-points-male-cns-v1.0-minconf-0.5.feather`
- `syn-partners-male-cns-v1.0-minconf-0.5.feather`
- `tbar-neurotransmitters-male-cns-v1.0.feather`

The bundled `data/demo/index.json` was generated from real MaleCNS files and currently contains 36,278 neurons and 99,884 weighted connections. The seed set is deterministic (`lowest-body-stats-rank-then-body-id`) across the complete body-statistics file, and each seed keeps a bounded set of strongest incoming/outgoing weighted connections from the complete weights file. This design keeps the portfolio demo responsive while making the subset scope explicit.

## Run Locally

From the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps\backend\requirements.txt
.\.venv\Scripts\python.exe scripts\inspect_dataset.py
.\.venv\Scripts\python.exe scripts\preprocess_data.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir apps\backend --reload
```

In another terminal:

```powershell
cd apps\frontend
pnpm install
pnpm run dev
```

Open http://127.0.0.1:5173.

## API Examples

- `GET /api/health`
- `GET /api/dataset/summary`
- `GET /api/regions`
- `GET /api/neurons/search?q=10001`
- `GET /api/neurons/{neuron_id}`
- `GET /api/neurons/{neuron_id}/incoming`
- `GET /api/neurons/{neuron_id}/outgoing`
- `GET /api/neurons/{neuron_id}/connections/{incoming|outgoing}/export`
- `GET /api/neurons/{neuron_id}/neighborhood?direction=both&max_nodes=50`
- `GET /api/connections/{source_id}/{target_id}`
- `GET /api/neurons/{neuron_id}/statistics`
- `GET /api/neurons/{neuron_id}/export?format=markdown`

## Testing

Backend tests run against the real demo index for health, summary, search, detail, statistics, incoming/outgoing, sorting, filtering, pagination, hard neighborhood node limits, connection export completeness, Markdown export, and invalid-neuron handling.

Frontend TypeScript verification:

```powershell
cd apps\frontend
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
```

Frontend unit tests and production build:

```powershell
cd apps\frontend
pnpm test
pnpm build
pnpm test:e2e
```

The project uses Vite's runner config loader so these commands work in restricted shells that cannot bundle the configuration through esbuild.

## Performance Notes

The UI intentionally renders local neighborhoods only. The API builds a lightweight normalized-token search index at startup, rejects unsupported connection sorts, enforces hard graph node limits, and exports all matching filtered connection rows. The preprocessing pipeline scans the large weights table once and stores bounded strongest connections per seed neuron for demo mode. Point-level synapse tables remain available as raw source data but are not loaded into the browser.

Connection CSV export materializes the selected neuron's filtered, enriched rows before generating the response. This is bounded and acceptable for the current demo index; a production-scale index should stream export rows from a query engine.

## Roadmap

- v2.0: multi-hop pathway tracing, saved investigations, query history, route visualization.
- v3.0: structural perturbation tools such as temporary node/edge removal and alternate-route comparison.

## Attribution

Dataset attribution belongs to the Janelia MaleCNS project and related FlyEM/neuPrint data release. This repository is a portfolio research-software project built on the public MaleCNS download files.
