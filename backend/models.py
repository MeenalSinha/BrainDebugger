"""
BrainDebugger — Application Data Models

Typed schemas derived from the verified MaleCNS v1.0 data files.
All fields marked Optional reflect columns that genuinely contain NaN in
the real dataset and must NOT be substituted with invented values.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, ConfigDict


# ── Neuron ───────────────────────────────────────────────────────────────────

class Neuron(BaseModel):
    """
    Represents a single neuron (body) from the MaleCNS v1.0 dataset.

    Field sources:
        body_id        — bodyId column in body-annotations
        cell_type      — type column in body-annotations (may be NaN)
        instance       — instance column (may be NaN)
        superclass     — superclass column (may be NaN)
        status         — status column (e.g., 'Traced', 'Roughly traced')
        status_label   — statusLabel categorical column
        soma_side      — somaSide ('L', 'R', or NaN)
        soma_neuromere — somaNeuromere (e.g., 'T1', 'A1', or NaN)
        subclass       — subclass column (may be NaN)
        hemi_brain_type — hemibrainType cross-reference (may be NaN)
        consensus_nt   — neurotransmitter from body-neurotransmitters (may be NaN)
        pre_synapses   — pre count from body-stats (may be missing)
        post_synapses  — post count from body-stats (may be missing)
        synweight      — synweight from body-stats (may be missing)
    """

    model_config = ConfigDict(populate_by_name=True)

    body_id: int
    cell_type: Optional[str] = None
    instance: Optional[str] = None
    superclass: Optional[str] = None
    status: Optional[str] = None
    status_label: Optional[str] = None
    soma_side: Optional[str] = None
    soma_neuromere: Optional[str] = None
    subclass: Optional[str] = None
    hemi_brain_type: Optional[str] = None
    consensus_nt: Optional[str] = None
    pre_synapses: Optional[int] = None
    post_synapses: Optional[int] = None
    synweight: Optional[int] = None


class NeuronSearchResult(BaseModel):
    """Lightweight result returned by search endpoints."""
    body_id: int
    cell_type: Optional[str] = None
    instance: Optional[str] = None
    superclass: Optional[str] = None
    status: Optional[str] = None
    match_field: str  # which field was matched: 'body_id', 'cell_type', 'instance'


class NeuronSearchResponse(BaseModel):
    """Paginated search response."""
    results: list[NeuronSearchResult]
    total: int
    limit: int
    offset: int
    query: str
    dataset: str


# ── Connection ───────────────────────────────────────────────────────────────

class Connection(BaseModel):
    """
    A directed synaptic connection: presynaptic → postsynaptic.

    Field sources:
        body_pre   — body_pre in connectome-weights (presynaptic neuron ID)
        body_post  — body_post in connectome-weights (postsynaptic neuron ID)
        weight     — synapse count from connectome-weights
        type_pre   — cell type of presynaptic neuron (may be NaN)
        type_post  — cell type of postsynaptic neuron (may be NaN)

    Direction:  body_pre ──→ body_post
    Weight:     recorded synapse count; does not imply physiological strength.
                Not to be interpreted as excitatory or inhibitory without
                additional evidence.
    """
    body_pre: int
    body_post: int
    weight: int
    type_pre: Optional[str] = None
    type_post: Optional[str] = None


class ConnectionListResponse(BaseModel):
    """Connections response for a given neuron."""
    body_id: int
    direction: str  # 'incoming' | 'outgoing'
    connections: list[Connection]
    total: int
    limit: int
    dataset: str


# ── Graph ────────────────────────────────────────────────────────────────────

class GraphNode(BaseModel):
    """A node in the Cytoscape.js graph payload."""
    id: str          # str(body_id)
    body_id: int
    label: str       # cell_type or instance or str(body_id)
    cell_type: Optional[str] = None
    instance: Optional[str] = None
    superclass: Optional[str] = None
    status: Optional[str] = None
    consensus_nt: Optional[str] = None
    is_selected: bool = False


class GraphEdge(BaseModel):
    """A directed edge in the Cytoscape.js graph payload."""
    id: str          # f"{body_pre}_{body_post}"
    source: str      # str(body_pre)
    target: str      # str(body_post)
    body_pre: int
    body_post: int
    weight: int
    type_pre: Optional[str] = None
    type_post: Optional[str] = None


class GraphResponse(BaseModel):
    """
    Local neighborhood graph for a selected neuron.

    node_count and edge_count are calculated from the returned lists,
    not hardcoded. is_partial indicates that a limit was reached.
    """
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    node_count: int
    edge_count: int
    is_partial: bool
    dataset: str
    dataset_version: str
    center_body_id: int


# ── Health ───────────────────────────────────────────────────────────────────

class DataSourceStatus(BaseModel):
    local_data_available: bool
    neuprint_configured: bool
    neuprint_reachable: Optional[bool] = None
    neuprint_dataset_ok: Optional[bool] = None
    detail: Optional[str] = None


class HealthResponse(BaseModel):
    status: str   # 'ok' | 'degraded' | 'unavailable'
    application: str
    version: str
    dataset: str
    data_source: DataSourceStatus


# ── Error ────────────────────────────────────────────────────────────────────

class ErrorDetail(BaseModel):
    error: str
    message: str
    dataset: Optional[str] = None
