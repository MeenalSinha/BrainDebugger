# BrainDebugger v1.0 Audit

Audit date: 2026-09-20

## Scope

This audit inspected the BrainDebugger v1.0 repository under `outputs/brain-debugger`, including the FastAPI backend, React/Vite frontend, demo MaleCNS index, documentation, tests, and Git LFS configuration.

## Dataset Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Demo dataset exists | Pass | `data/demo/index.json` is present and tracked through Git LFS. |
| Dataset is real MaleCNS-derived subset, not placeholder text | Pass | Backend tests exercise real IDs such as `10001`; summary reports 36,278 neurons, 99,884 connections, and 36 regions. |
| Large file handling | Pass | `.gitattributes` tracks `data/demo/index.json` with LFS filters. |
| Provenance language | Pass | API responses and reports state structural synapse-count scope and source table names. |

## Feature Checklist

| Area | Status | Notes |
| --- | --- | --- |
| Search and neuron inspector | Pass | Search supports neuron ID, cell type, instance, region, superclass, and predicted neurotransmitter. Inspector shows metadata, connectivity, graph metrics, and provenance. |
| Incoming/outgoing connectivity | Improved | Added table search, sort controls, pagination state, loading state, and CSV export links. |
| Graph visualization | Pass | Cytoscape renders local directed structural neighborhoods with selectable nodes and edges. |
| Region explorer | Partial | Region cards filter the neuron browser and expose counts. A full region-detail page is not implemented in v1.0. |
| Demo mode | Improved | Added an example workflow button for neuron `10001` and reset controls. |
| Exports | Improved | Neuron exports now include download filenames. Incoming/outgoing connection tables have dedicated CSV export endpoints. |
| Scientific safeguards | Pass | UI and exports avoid physiological overclaims and describe synapse counts as structural measurements. |

## Fixes Applied

| Severity | Fix |
| --- | --- |
| High | Backend tests can now run from the repository root via `apps/backend/tests/conftest.py`. |
| High | API routes lazily load the dataset if startup hooks have not populated the in-memory store. |
| High | Connection sort parameters now reject unsupported values with HTTP 422 instead of silently falling back. |
| Medium | Incoming/outgoing tables now support UI search, sorting, pagination, loading states, and CSV export. |
| Medium | Export routes now send `Content-Disposition` filenames. |
| Medium | Outgoing connection rows now display target predicted neurotransmitter instead of source predicted neurotransmitter. |
| Medium | `BRAINDEBUGGER_DATASET_PATH` can override the backend dataset path for local testing and deployment. |

## Verification

| Command | Result |
| --- | --- |
| `..\..\brain-debugger\.venv\Scripts\python.exe -m pytest apps\backend\tests -vv` | Pass: 7 tests passed. |
| `pnpm run build` in `apps/frontend` | Blocked by local pnpm store failure: `ERR_SQLITE_ERROR unable to open database file`. |
| `pnpm install --store-dir work\pnpm-store-audit` | Blocked by registry `EACCES` fetch errors. |
| Direct TypeScript check using sibling `node_modules` as `baseUrl` | Blocked by React ambient type resolution in the improvised harness. This is not counted as a source pass. |

## Remaining Risks

| Risk | Severity | Recommendation |
| --- | --- | --- |
| Frontend build was not verified in a hydrated deliverable `node_modules` environment. | Medium | Run `pnpm install && pnpm run build` in a normal shell with registry access and pnpm store permissions. |
| Frontend has no automated unit or browser tests. | Medium | Add React component tests and a Playwright smoke test for search, neuron open, graph render, and exports. |
| Region explorer is filter-based rather than a full drill-down view. | Low | Add a dedicated region detail panel if v1.0 requires region-level summaries beyond cards. |
| FastAPI startup still uses deprecated `on_event`. | Low | Migrate to a lifespan handler in a later maintenance pass. |

## Final Assessment

BrainDebugger v1.0 is functional as a demo connectome exploration tool with real MaleCNS-derived subset data, scoped scientific language, backend API coverage, and Git LFS handling for the large demo index. The audit fixed the highest-impact backend reliability and connection-table usability gaps found during inspection. The main unresolved release risk is frontend build verification in this sandboxed environment, not an intentionally ignored application defect.
