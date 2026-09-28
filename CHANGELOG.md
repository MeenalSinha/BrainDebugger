# Changelog

## 1.2.0

- Split graph, connection table, inspector, region explorer, demo controls, history, and explorer controls into feature modules.
- Added exact cell-type filtering to the explorer UI and API client.
- Made every indexed region available in the Region Explorer.
- Added Vitest component/API coverage and a Playwright explorer smoke test.
- Verified the frontend production build with Vite's runner config loader.

## 1.1.0

- Added lightweight indexed neuron search while preserving current query semantics.
- Made connection CSV exports return all matching filtered rows.
- Enforced hard neighborhood `max_nodes` limits and edge/node consistency.
- Removed machine-specific paths from generated provenance metadata.
- Added explicit demo-subset scope metadata for deterministic seed selection and bounded strongest-connection indexing.
- Improved graph legend, region details, inspector hierarchy, and scientific labeling.
- Added request cancellation/sequence guards for search, neuron detail, graph, and connection-table requests.
- Expanded backend regression tests for export completeness and node-limit behavior.
- Began frontend modularization with shared/stat, landing, and scientific-scope components.

## 1.0.0

- Added real MaleCNS schema audit.
- Added reproducible demo-index preprocessing pipeline.
- Added FastAPI backend with dataset summary, neuron search, detail, connections, neighborhood, statistics, and export endpoints.
- Added React/TypeScript connectome explorer UI with Cytoscape graph view.
- Added scientific limitations and provenance throughout the product.
