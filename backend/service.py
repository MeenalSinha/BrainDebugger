"""
BrainDebugger — Service Layer

Provides a clean interface between API route handlers and the data provider.
All business logic lives here, not in route handlers.
"""

from __future__ import annotations

import logging
from typing import Optional

from backend.config import Settings
from backend.data_provider import LocalFeatherProvider
from backend.models import (
    ConnectionListResponse,
    ConnectivitySummaryResponse,
    DataSourceStatus,
    GraphResponse,
    HealthResponse,
    Neuron,
    NeuronSearchResponse,
)

logger = logging.getLogger(__name__)

_APP_VERSION = "0.1.0"
_APP_NAME = "BrainDebugger"


class ConnectomeService:
    """
    Mediates between the API layer and the data provider.

    The service holds a reference to the data provider singleton.
    It translates exceptions from the data layer into logged errors and
    re-raises them so the route layer can produce a consistent HTTP error.
    """

    def __init__(self, provider: LocalFeatherProvider, settings: Settings) -> None:
        self._provider = provider
        self._settings = settings

    # ── Health ────────────────────────────────────────────────────────────────

    def health(self) -> HealthResponse:
        ok, detail = self._provider.verify_dataset()
        ds_status = DataSourceStatus(
            local_data_available=ok,
            neuprint_configured=self._settings.neuprint_configured,
            detail=detail,
        )
        overall = "ok" if ok else "degraded"
        return HealthResponse(
            status=overall,
            application=_APP_NAME,
            version=_APP_VERSION,
            dataset=self._settings.neuprint_dataset,
            data_source=ds_status,
        )

    # ── Search ────────────────────────────────────────────────────────────────

    def search_neurons(
        self,
        query: str,
        limit: int,
        offset: int = 0,
    ) -> NeuronSearchResponse:
        effective_limit = min(limit, self._settings.max_search_results)
        logger.info("Search: query=%r limit=%d offset=%d", query, effective_limit, offset)
        return self._provider.search(query=query, limit=effective_limit, offset=offset)

    # ── Neuron detail ─────────────────────────────────────────────────────────

    def get_neuron(self, body_id: int) -> Optional[Neuron]:
        logger.info("Get neuron: body_id=%d", body_id)
        return self._provider.get_neuron(body_id)

    # ── Connectivity summary ──────────────────────────────────────────────────

    def get_connectivity_summary(self, body_id: int) -> Optional[ConnectivitySummaryResponse]:
        logger.info("Connectivity summary: body_id=%d", body_id)
        return self._provider.get_connectivity_summary(body_id)

    # ── Connections ───────────────────────────────────────────────────────────

    def get_connections(
        self,
        body_id: int,
        direction: str,
        limit: Optional[int] = None,
        offset: int = 0,
        sort_by: str = "weight",
        sort_order: str = "desc",
        partner_id: Optional[int] = None,
        partner_type: Optional[str] = None,
        min_weight: Optional[int] = None,
    ) -> ConnectionListResponse:
        effective_limit = min(
            limit or self._settings.max_connections,
            self._settings.max_connections,
        )
        logger.info(
            "Connections: body_id=%d direction=%s limit=%d offset=%d sort=%s:%s",
            body_id,
            direction,
            effective_limit,
            offset,
            sort_by,
            sort_order,
        )
        return self._provider.get_connections(
            body_id=body_id,
            direction=direction,
            limit=effective_limit,
            offset=offset,
            sort_by=sort_by,
            sort_order=sort_order,
            partner_id=partner_id,
            partner_type=partner_type,
            min_weight=min_weight,
        )

    # ── Neighborhood graph ────────────────────────────────────────────────────

    def get_neighborhood(
        self,
        body_id: int,
        max_nodes: Optional[int] = None,
    ) -> GraphResponse:
        effective_max_nodes = min(
            max_nodes or self._settings.max_graph_nodes,
            self._settings.max_graph_nodes,
        )
        max_edges_per_dir = max(1, (effective_max_nodes - 1) // 2)
        logger.info(
            "Neighborhood: body_id=%d max_nodes=%d",
            body_id,
            effective_max_nodes,
        )
        return self._provider.get_neighborhood(
            body_id=body_id,
            max_nodes=effective_max_nodes,
            max_edges_per_direction=max_edges_per_dir,
        )
