# BrainDebugger

Developer tools for exploring biological neural networks.

BrainDebugger v1.0 turns the Janelia MaleCNS Drosophila connectome release into a focused connectome explorer. It is built for neuron search, metadata inspection, incoming/outgoing connection review, local graph visualization, region browsing, structural graph statistics, and exportable neuron reports.

## Why It Exists

Connectome data is rich, but raw synapse tables are difficult to inspect interactively. BrainDebugger borrows from Chrome DevTools, database explorers, and scientific graph tools so students and researchers can inspect structural connectivity without writing a query for every question.

## Scientific Scope

BrainDebugger is an exploratory structural-connectivity tool. It does not simulate biological firing, predict behavior, or establish physiological signal strength.

- Synapse counts are graph measurements, not automatic physiological signal strengths.
- Predicted neurotransmitters do not necessarily establish excitatory or inhibitory effects.
- A graph path is a computational exploration route, not a validated biological signal pathway.
- v1.0 uses a real demo subset indexed from the downloaded MaleCNS Feather files for fast local interaction.

## Features

- Landing overview with dataset status, indexed neuron count, connection count, regions, and indexing timestamp.
- Neuron search by ID, cell type, region, neurotransmitter, and annotations.
- Neuron Inspector with metadata, connectivity summary, structural graph metrics, provenance, and export actions.
- Incoming and outgoing connection tables with clickable neuron IDs.
- Cytoscape local neighborhood graph with bounded node counts, direction filters, and selected edge inspection.
- Region explorer cards with neuron and indexed connection counts.
- Export formats: Markdown, JSON, and CSV.
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

The bundled `data/demo/index.json` was generated from real MaleCNS files and currently contains 36,278 neurons and 99,884 weighted connections.

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
- `GET /api/neurons/{neuron_id}/neighborhood?direction=both&max_nodes=50`
- `GET /api/connections/{source_id}/{target_id}`
- `GET /api/neurons/{neuron_id}/statistics`
- `GET /api/neurons/{neuron_id}/export?format=markdown`

## Testing

Backend smoke verification was run against the real demo index for health, summary, search, detail, statistics, incoming/outgoing, neighborhood, and Markdown export endpoints.

Frontend TypeScript verification:

```powershell
cd apps\frontend
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
```

## Performance Notes

The UI intentionally renders local neighborhoods only. The preprocessing pipeline scans the large weights table once and stores bounded strongest connections per seed neuron for demo mode. Point-level synapse tables remain available as raw source data but are not loaded into the browser.

## Roadmap

- v2.0: multi-hop pathway tracing, saved investigations, query history, route visualization.
- v3.0: structural perturbation tools such as temporary node/edge removal and alternate-route comparison.

## Attribution

Dataset attribution belongs to the Janelia MaleCNS project and related FlyEM/neuPrint data release. This repository is a portfolio research-software project built on the public MaleCNS download files.
