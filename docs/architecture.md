# Architecture

BrainDebugger uses a two-app architecture.

```text
React UI -> Vite proxy -> FastAPI API -> in-memory ConnectomeStore -> data/demo/index.json
```

The preprocessing scripts are intentionally separate from the request path. This keeps the API responsive and avoids full-dataset scans during interactive use.

Future pathway tracing and perturbation modules can extend `ConnectomeStore` or replace the JSON index with DuckDB/PostgreSQL without changing the frontend API contract.
