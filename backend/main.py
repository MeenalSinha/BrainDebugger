"""
BrainDebugger — FastAPI Application

Route handlers are thin; all logic is in the service layer.
Interactive API docs: http://localhost:8000/docs
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.config import Settings, configure_logging, get_settings
from backend.data_provider import LocalFeatherProvider
from backend.models import (
    ConnectionListResponse,
    ConnectivitySummaryResponse,
    ErrorDetail,
    GraphResponse,
    HealthResponse,
    Neuron,
    NeuronSearchResponse,
)
from backend.service import ConnectomeService

logger = logging.getLogger(__name__)

# ── Singletons ────────────────────────────────────────────────────────────────
_provider: Optional[LocalFeatherProvider] = None
_service: Optional[ConnectomeService] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load data files once at startup; release on shutdown."""
    global _provider, _service
    settings = get_settings()
    configure_logging(settings)
    logger.info("BrainDebugger starting — %s", settings.safe_repr())

    _provider = LocalFeatherProvider(settings.data_dir)
    try:
        _provider.load()
    except FileNotFoundError as exc:
        logger.critical("Cannot start: %s", exc)
        # Allow the process to start but mark as degraded; health endpoint
        # will report the error clearly.
    _service = ConnectomeService(_provider, settings)
    logger.info("BrainDebugger ready.")
    yield
    logger.info("BrainDebugger shutting down.")


app = FastAPI(
    title="BrainDebugger API",
    description=(
        "Developer tools for exploring the Janelia MaleCNS v1.0 connectome. "
        "All data comes from the real dataset; no mock data is used."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ── Dependency injection ──────────────────────────────────────────────────────

def get_service() -> ConnectomeService:
    if _service is None or not _provider.is_loaded:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "service_unavailable",
                "message": (
                    "Data files are not loaded. Check that DATA_DIR contains "
                    "the MaleCNS v1.0 Feather files and review startup logs."
                ),
            },
        )
    return _service


ServiceDep = Annotated[ConnectomeService, Depends(get_service)]


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Application and data-source health",
    tags=["Health"],
)
async def health() -> HealthResponse:
    """
    Returns application liveness and data-provider readiness.
    A 200 response with status='degraded' means the app is running but
    live data access is unavailable.
    """
    if _service is None:
        from backend.models import DataSourceStatus
        return HealthResponse(
            status="unavailable",
            application="BrainDebugger",
            version="0.1.0",
            dataset="male-cns:v1.0",
            data_source=DataSourceStatus(
                local_data_available=False,
                neuprint_configured=False,
                detail="Service not yet initialized.",
            ),
        )
    return _service.health()


@app.get(
    "/api/neurons/search",
    response_model=NeuronSearchResponse,
    responses={400: {"model": ErrorDetail}, 503: {"model": ErrorDetail}},
    summary="Search neurons by body ID, cell type, or instance name",
    tags=["Neurons"],
)
async def search_neurons(
    svc: ServiceDep,
    q: str = Query(..., min_length=1, description="Search query: numeric body ID, cell type, or instance name"),
    limit: int = Query(50, ge=1, le=500, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> NeuronSearchResponse:
    """
    Search the MaleCNS v1.0 dataset.

    - Numeric query → exact body ID match.
    - Non-numeric query → case-insensitive substring match on cell type and instance name.

    Returns actual dataset results; never fabricated.
    """
    try:
        return svc.search_neurons(query=q, limit=limit, offset=offset)
    except Exception as exc:
        logger.error("Search failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "search_failed", "message": str(exc)})


@app.get(
    "/api/neurons/{body_id}",
    response_model=Neuron,
    responses={
        404: {"model": ErrorDetail},
        400: {"model": ErrorDetail},
        503: {"model": ErrorDetail},
    },
    summary="Retrieve neuron metadata by body ID",
    tags=["Neurons"],
)
async def get_neuron(body_id: int, svc: ServiceDep) -> Neuron:
    """
    Returns verified metadata for the requested neuron.
    Returns 404 when the body ID genuinely does not exist in the dataset.
    """
    neuron = svc.get_neuron(body_id)
    if neuron is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "not_found",
                "message": f"Neuron {body_id} not found in {svc._settings.neuprint_dataset}.",
                "dataset": svc._settings.neuprint_dataset,
            },
        )
    return neuron


@app.get(
    "/api/neurons/{body_id}/connectivity-summary",
    response_model=ConnectivitySummaryResponse,
    responses={
        400: {"model": ErrorDetail},
        404: {"model": ErrorDetail},
        503: {"model": ErrorDetail},
    },
    summary="Retrieve connectivity summary and intelligence for a neuron",
    tags=["Connections"],
)
async def get_connectivity_summary(
    body_id: int,
    svc: ServiceDep,
) -> ConnectivitySummaryResponse:
    """
    Returns accurate connectivity intelligence overview for a neuron:
    - Unique presynaptic and postsynaptic partner counts in loaded dataset
    - Total matching connection records in loaded dataset
    - Sum of synaptic weights in loaded dataset
    - Body-level pre and post synapse counts
    - Explicit source and coverage metadata
    """
    summary = svc.get_connectivity_summary(body_id)
    if summary is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": f"Neuron {body_id} not found."},
        )
    return summary


@app.get(
    "/api/neurons/{body_id}/connections",
    response_model=ConnectionListResponse,
    responses={
        400: {"model": ErrorDetail},
        404: {"model": ErrorDetail},
        503: {"model": ErrorDetail},
    },
    summary="Retrieve incoming or outgoing connections with sorting, filtering, and pagination",
    tags=["Connections"],
)
async def get_connections(
    body_id: int,
    svc: ServiceDep,
    direction: str = Query("outgoing", pattern="^(incoming|outgoing)$"),
    limit: int = Query(50, ge=1, le=500, description="Page size limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    sort_by: str = Query("weight", pattern="^(weight|partner_id|partner_type)$", description="Field to sort by"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
    partner_id: Optional[int] = Query(None, ge=1, description="Filter by partner body ID"),
    partner_type: Optional[str] = Query(None, min_length=1, description="Filter by partner cell type (case-insensitive substring)"),
    min_weight: Optional[int] = Query(None, ge=1, description="Filter by minimum connection weight"),
) -> ConnectionListResponse:
    """
    Returns actual recorded connections for the neuron with full pagination,
    server-side filtering, and deterministic sorting.

    - direction=outgoing: body_id → partners (presynaptic neuron = body_id)
    - direction=incoming: partners → body_id (postsynaptic neuron = body_id)

    Edge direction is preserved exactly as recorded in the dataset.
    Response includes total matching records, total in source, and coverage disclaimers.
    """
    neuron = svc.get_neuron(body_id)
    if neuron is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": f"Neuron {body_id} not found."},
        )
    try:
        return svc.get_connections(
            body_id=body_id,
            direction=direction,
            limit=limit,
            offset=offset,
            sort_by=sort_by,
            sort_order=sort_order,
            partner_id=partner_id,
            partner_type=partner_type,
            min_weight=min_weight,
        )
    except Exception as exc:
        logger.error("Connections failed: body_id=%d %s", body_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "query_failed", "message": str(exc)})


@app.get(
    "/api/neurons/{body_id}/neighborhood",
    response_model=GraphResponse,
    responses={
        400: {"model": ErrorDetail},
        404: {"model": ErrorDetail},
        503: {"model": ErrorDetail},
    },
    summary="Retrieve the local graph neighborhood for a neuron",
    tags=["Graph"],
)
async def get_neighborhood(
    body_id: int,
    svc: ServiceDep,
    max_nodes: int = Query(60, ge=2, le=150, description="Maximum nodes in the returned graph"),
) -> GraphResponse:
    """
    Returns nodes and directed edges for the local neighborhood.

    is_partial=true when a configured limit was reached.
    All node and edge counts are calculated from the actual returned data.
    """
    neuron = svc.get_neuron(body_id)
    if neuron is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": f"Neuron {body_id} not found."},
        )
    try:
        return svc.get_neighborhood(body_id=body_id, max_nodes=max_nodes)
    except Exception as exc:
        logger.error("Neighborhood failed: body_id=%d %s", body_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "query_failed", "message": str(exc)})
