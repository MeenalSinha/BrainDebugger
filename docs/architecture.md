# Architecture

BrainDebugger uses a two-app architecture with an offline preprocessing pipeline.

```text
MaleCNS Feather downloads
  -> scripts/inspect_dataset.py
  -> scripts/preprocess_data.py
  -> data/demo/index.json
  -> FastAPI API
  -> React/Vite/Cytoscape UI
```

The preprocessing scripts are intentionally separate from the request path. This keeps the API responsive and avoids full-dataset scans during interactive use.

## Backend

`ConnectomeStore` loads the demo JSON index once, enriches directed connections with neuron metadata, builds incoming/outgoing adjacency lists, and creates a lightweight normalized-token search index. API routes return consistent `{ data, metadata }` envelopes for interactive reads, while export routes return typed file responses with download filenames.

Safeguards include:

- explicit demo-subset metadata;
- supported-sort validation;
- hard `max_nodes` enforcement for graph neighborhoods;
- connection CSV export of all matching filtered rows;
- lazy dataset loading if app startup hooks have not run.

## Frontend

The frontend is React + TypeScript + Vite with Cytoscape for local graph rendering. Feature modules own the graph, connection tables, inspector, region explorer, explorer controls, demo controls, history, landing, and scientific-scope content. `main.tsx` coordinates application state and request flows. Request flows use `AbortController` and sequence guards for search, neuron opening, table reloads, and graph reloads so stale responses do not overwrite newer UI state.

## Future Compatibility

Future multi-hop tracing, saved investigations, and perturbation modules can extend `ConnectomeStore` or replace the JSON index with DuckDB/PostgreSQL without changing the high-level frontend API contract.
