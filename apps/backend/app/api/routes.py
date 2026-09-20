from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response

from app.core.config import settings
from app.schemas.common import ApiResponse, Metadata
from app.services.connectome_store import ConnectomeStore


router = APIRouter()
store = ConnectomeStore(settings.dataset_path)


def wrap(data, started: float, *, computed: bool = False, total: int | None = None, truncated: bool = False) -> ApiResponse:
    return ApiResponse(
        data=data,
        metadata=Metadata(
            computed=computed,
            mode=store.summary.get("mode", "demo-subset"),
            query_ms=round((time.perf_counter() - started) * 1000, 2),
            total=total,
            truncated=truncated,
        ),
    )


@router.on_event("startup")
def load_data() -> None:
    store.load()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "datasetLoaded": bool(store.neurons), "indexedNeurons": len(store.neurons)}


@router.get("/dataset/summary", response_model=ApiResponse)
def dataset_summary() -> ApiResponse:
    started = time.perf_counter()
    return wrap(store.dataset_summary(), started)


@router.get("/regions", response_model=ApiResponse)
def regions() -> ApiResponse:
    started = time.perf_counter()
    return wrap(store.regions, started, total=len(store.regions))


@router.get("/neurons/search", response_model=ApiResponse)
def search_neurons(
    q: str = "",
    region: str | None = None,
    cell_type: str | None = None,
    limit: int = Query(25, ge=1, le=100),
) -> ApiResponse:
    started = time.perf_counter()
    results = store.search(q, region=region, cell_type=cell_type, limit=limit)
    return wrap(results, started, total=len(results))


@router.get("/neurons/{neuron_id}", response_model=ApiResponse)
def neuron_detail(neuron_id: str) -> ApiResponse:
    started = time.perf_counter()
    neuron = store.get_neuron(neuron_id)
    if not neuron:
        raise HTTPException(status_code=404, detail="Neuron ID was not found in the indexed dataset.")
    return wrap(neuron, started)


@router.get("/neurons/{neuron_id}/incoming", response_model=ApiResponse)
def incoming_connections(
    neuron_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = "",
    sort: str = "weight_desc",
) -> ApiResponse:
    started = time.perf_counter()
    if not store.get_neuron(neuron_id):
        raise HTTPException(status_code=404, detail="Neuron ID was not found in the indexed dataset.")
    rows, total = store.connection_rows(neuron_id, "incoming", page, page_size, search, sort)
    return wrap(rows, started, total=total)


@router.get("/neurons/{neuron_id}/outgoing", response_model=ApiResponse)
def outgoing_connections(
    neuron_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = "",
    sort: str = "weight_desc",
) -> ApiResponse:
    started = time.perf_counter()
    if not store.get_neuron(neuron_id):
        raise HTTPException(status_code=404, detail="Neuron ID was not found in the indexed dataset.")
    rows, total = store.connection_rows(neuron_id, "outgoing", page, page_size, search, sort)
    return wrap(rows, started, total=total)


@router.get("/neurons/{neuron_id}/neighborhood", response_model=ApiResponse)
def neighborhood(
    neuron_id: str,
    direction: Literal["incoming", "outgoing", "both"] = "both",
    max_nodes: int = Query(50, ge=1, le=250),
) -> ApiResponse:
    started = time.perf_counter()
    if not store.get_neuron(neuron_id):
        raise HTTPException(status_code=404, detail="Neuron ID was not found in the indexed dataset.")
    data = store.neighborhood(neuron_id, direction, max_nodes)
    return wrap(data, started, computed=True, total=data["available"], truncated=data["truncated"])


@router.get("/connections/{source_id}/{target_id}", response_model=ApiResponse)
def connection_detail(source_id: str, target_id: str) -> ApiResponse:
    started = time.perf_counter()
    edge = store.connection(source_id, target_id)
    if not edge:
        raise HTTPException(status_code=404, detail="Connection was not found in the indexed dataset.")
    return wrap(edge, started)


@router.get("/neurons/{neuron_id}/statistics", response_model=ApiResponse)
def neuron_statistics(neuron_id: str) -> ApiResponse:
    started = time.perf_counter()
    stats = store.statistics(neuron_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Neuron ID was not found in the indexed dataset.")
    return wrap(stats, started, computed=True)


@router.get("/neurons/{neuron_id}/export")
def export_neuron(neuron_id: str, format: Literal["json", "csv", "markdown"] = "markdown") -> Response:
    media = {"json": "application/json", "csv": "text/csv", "markdown": "text/markdown"}[format]
    try:
        content = store.export_report(neuron_id, format)
    except KeyError:
        raise HTTPException(status_code=404, detail="Neuron ID was not found in the indexed dataset.") from None
    return Response(content=content, media_type=media)
