"""
BrainDebugger — Application Data Models

Typed schemas derived from the verified MaleCNS v1.0 data files.
All fields marked Optional reflect columns that genuinely contain NaN in
the real dataset and must NOT be substituted with invented values.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


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


    entry_nerve: Optional[str] = None
    exit_nerve: Optional[str] = None
    dimorphism: Optional[str] = None
    group: Optional[str] = None
    dataset: str = "male-cns:v1.0"
    dataset_attribution: str = (
        "Schlegel et al., Whole-brain annotation and multi-connectome cell typing "
        "of Drosophila, Nature 634, 139–152 (2024). CC BY 4.0."
    )


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


# ── Connectivity Summary ─────────────────────────────────────────────────────

class DirectionalConnectivitySummary(BaseModel):
    """
    Summary metrics for incoming or outgoing connections of a neuron.
    
    All partner counts and record counts are computed from the actual loaded
    connection data source.
    """
    direction: str  # 'incoming' | 'outgoing'
    partner_count: int  # Distinct partners represented in the loaded weights file
    record_count: int  # Total connection records in the loaded weights file
    total_weight: int  # Sum of recorded synaptic weights in loaded weights file
    body_stat_synapses: Optional[int] = None  # Pre- or post-synapse count from body-stats file


class ConnectivitySummaryResponse(BaseModel):
    """
    Comprehensive connectivity intelligence overview for a selected neuron.
    
    Exposes both incoming and outgoing summaries alongside explicit source
    coverage information to distinguish partial/traced-only coverage from
    complete biological connectome statistics.
    """
    body_id: int
    incoming: DirectionalConnectivitySummary
    outgoing: DirectionalConnectivitySummary
    source_file: str = "connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather"
    is_traced_only_subset: bool = True
    coverage_notice: str = (
        "Counts and weights reflect connections present in the loaded "
        "male-cns:v1.0 traced-only dataset (min confidence 0.5) and do not "
        "represent the entire biological connectome."
    )
    dataset: str = "male-cns:v1.0"


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
        instance_pre — instance name of presynaptic neuron (may be NaN)
        instance_post — instance name of postsynaptic neuron (may be NaN)
        superclass_pre — superclass of presynaptic neuron (may be NaN)
        superclass_post — superclass of postsynaptic neuron (may be NaN)

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
    instance_pre: Optional[str] = None
    instance_post: Optional[str] = None
    superclass_pre: Optional[str] = None
    superclass_post: Optional[str] = None


class ConnectionListResponse(BaseModel):
    """
    Connections response for a given neuron with complete pagination, sorting,
    filtering, and source-scope metadata.
    """
    body_id: int
    direction: str  # 'incoming' | 'outgoing'
    connections: list[Connection]
    returned_count: int  # Number of connection records returned in this page
    total_matched: int  # Total records matching the filter in loaded source
    total_in_source: int  # Total records for this direction in loaded source (unfiltered)
    unique_partners: int  # Number of distinct partners in matching records
    total: int  # Maintained for backward compatibility (equals total_matched)
    limit: int
    offset: int = 0
    has_more: bool = False
    sort_by: str = "weight"
    sort_order: str = "desc"
    partner_filter: Optional[str] = None
    dataset: str = "male-cns:v1.0"
    source_file: str = "connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather"
    is_traced_only_subset: bool = True
    coverage_notice: str = (
        "Connections reflect records in the male-cns:v1.0 traced-only dataset "
        "(min confidence 0.5). Synaptic weights represent recorded synapse counts, "
        "not physiological conductance."
    )


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


# ── V3: Pathway Tracer & Downstream Cascade ─────────────────────────────────

class PathRankingStrategy(str, Enum):
    SHORTEST = "shortest"
    WEIGHT_PRIORITIZED = "weight_prioritized"


class PathNode(BaseModel):
    """A neuron node along a traced pathway."""
    body_id: int
    type: Optional[str] = None
    instance: Optional[str] = None
    superclass: Optional[str] = None
    hop: int


class PathEdge(BaseModel):
    """A directed synaptic edge along a traced pathway."""
    body_pre: int
    body_post: int
    weight: int
    type_pre: Optional[str] = None
    type_post: Optional[str] = None
    instance_pre: Optional[str] = None
    instance_post: Optional[str] = None
    relative_weight_fraction: Optional[float] = None  # p(post|pre)


class PathItem(BaseModel):
    """A single directed pathway between source and target."""
    rank: int
    hops: int
    nodes: list[PathNode]
    edges: list[PathEdge]
    score: Optional[float] = None
    log_cost: Optional[float] = None
    total_weight: int
    bottleneck_weight: int


class PathwaySearchResponse(BaseModel):
    """Response containing calculated directed pathways between two neurons."""
    source_body_id: int
    target_body_id: int
    strategy: str  # 'shortest' | 'weight_prioritized'
    max_hops: int
    max_paths: int
    paths: list[PathItem]
    returned_count: int
    status: str  # 'found' | 'no_path_found' | 'same_node' | 'partial'
    is_partial: bool = False
    limit_reason: Optional[str] = None
    explored_nodes: int = 0
    explored_edges: int = 0
    dataset: str = "male-cns:v1.0"
    source_file: str = "connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather"
    coverage_notice: str = (
        "Pathways reflect directed connections present in the male-cns:v1.0 traced-only "
        "dataset (min confidence 0.5). Absence of a route does not prove biological independence."
    )
    scientific_qualification: str = (
        "Shortest structural paths reflect fewest recorded synaptic hops. Weight-prioritized "
        "routes optimize relative transition fractions p(v|u) = w(u,v)/sum(w(u,*)) within the "
        "traced subset. These are graph heuristics, not physiological signal propagation simulations."
    )


class CascadeHopLayer(BaseModel):
    """Summary metrics for a single hop distance in the downstream cascade."""
    hop: int
    newly_reached_nodes: int
    cumulative_nodes: int
    layer_edges: int
    layer_weight: int


class CascadeNode(BaseModel):
    """A reachable neuron node in a downstream cascade."""
    body_id: int
    type: Optional[str] = None
    instance: Optional[str] = None
    superclass: Optional[str] = None
    hop: int
    in_degree: int = 0
    out_degree: int = 0


class CascadeEdge(BaseModel):
    """A directed synaptic edge represented in the downstream cascade."""
    body_pre: int
    body_post: int
    weight: int
    pre_hop: int
    post_hop: int


class DownstreamCascadeResponse(BaseModel):
    """Downstream structural reachability cascade from a source neuron."""
    source_body_id: int
    max_hops: int
    max_nodes: int
    max_edges: int
    min_weight: Optional[int] = None
    total_unique_nodes: int
    total_edges: int
    layers: list[CascadeHopLayer]
    nodes: list[CascadeNode]
    edges: list[CascadeEdge]
    is_truncated: bool = False
    truncation_reason: Optional[str] = None
    dataset: str = "male-cns:v1.0"
    source_file: str = "connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather"
    coverage_notice: str = (
        "Cascade layers reflect minimum structural graph distance over outgoing edges "
        "in the male-cns:v1.0 traced-only dataset (min confidence 0.5)."
    )
    scientific_qualification: str = (
        "Hop distance is a structural graph metric, not a biological latency or temporal sequence. "
        "Reachable nodes represent the structural subgraph, not simulated neural firing."
    )


# ── V5: Perturbation Lab Models ─────────────────────────────────────────────

class DisabledNeuron(BaseModel):
    """A neuron excluded in an intervention overlay."""
    body_id: int
    label: Optional[str] = None
    reason: Optional[str] = None


class DisabledEdge(BaseModel):
    """A directed synaptic connection excluded in an intervention overlay."""
    body_pre: int
    body_post: int
    weight: Optional[int] = None
    label: Optional[str] = None


class InterventionConfig(BaseModel):
    """Collection of non-destructive structural interventions applied to a graph view."""
    disabled_neurons: list[int] = Field(default_factory=list)
    disabled_edges: list[DisabledEdge] = Field(default_factory=list)
    analysis_scope: str = "path_and_cascade"  # 'path_and_cascade' | 'path' | 'cascade' | 'neighborhood'
    experiment_name: Optional[str] = None
    random_seed: Optional[int] = None


class PerturbationValidationResponse(BaseModel):
    """Validation report checking if requested intervention elements exist in data source."""
    valid: bool
    verified_neurons: list[int]
    unverified_neurons: list[int]
    verified_edges: list[DisabledEdge]
    unverified_edges: list[DisabledEdge]
    incident_edges_disabled_count: int
    message: str


class PathComparisonResult(BaseModel):
    """Comparison of source-to-target path availability before and after interventions."""
    source_body_id: int
    target_body_id: int
    strategy: str = "shortest"
    baseline_route_exists: bool
    baseline_hops: Optional[int] = None
    baseline_total_weight: Optional[int] = None
    baseline_paths_count: int = 0
    perturbed_route_exists: bool
    perturbed_hops: Optional[int] = None
    perturbed_total_weight: Optional[int] = None
    perturbed_paths_count: int = 0
    original_path_survived: bool
    alternative_path_found: bool
    delta_hops: Optional[int] = None
    endpoint_disabled: bool = False
    disabled_endpoint_id: Optional[int] = None
    baseline_paths: list[PathItem] = Field(default_factory=list)
    perturbed_paths: list[PathItem] = Field(default_factory=list)


class ReachabilityComparisonResult(BaseModel):
    """Comparison of downstream reachability before and after interventions."""
    source_body_id: int
    max_hops: int
    baseline_reachable_count: int
    perturbed_reachable_count: int
    delta_reachability: int  # R_baseline - R_perturbed (positive = loss of reachability)
    retention_fraction: float  # R_perturbed / R_baseline
    lost_node_ids: list[int] = Field(default_factory=list)
    lost_nodes_per_hop: dict[int, int] = Field(default_factory=dict)
    baseline_layers: list[CascadeHopLayer] = Field(default_factory=list)
    perturbed_layers: list[CascadeHopLayer] = Field(default_factory=list)
    baseline_cascade: Optional[DownstreamCascadeResponse] = None
    perturbed_cascade: Optional[DownstreamCascadeResponse] = None


class PerturbationComparisonRequest(BaseModel):
    """Request payload for comparing baseline versus perturbed network."""
    interventions: InterventionConfig
    source_body_id: int
    target_body_id: Optional[int] = None
    max_hops: int = 3
    max_paths: int = 3
    strategy: str = "shortest"
    min_weight: Optional[int] = None
    max_cascade_nodes: int = 300
    include_cascade_graph: bool = True


class PerturbationComparisonResponse(BaseModel):
    """Comprehensive comparison report between baseline and perturbed graph representations."""
    experiment_id: str
    timestamp: str
    dataset: str = "male-cns:v1.0"
    source_body_id: int
    target_body_id: Optional[int] = None
    interventions: InterventionConfig
    path_comparison: Optional[PathComparisonResult] = None
    reachability_comparison: Optional[ReachabilityComparisonResult] = None
    summary_text: str
    scientific_notice: str = (
        "Structural interventions represent non-destructive exclusion of nodes/edges in a temporary computational graph representation. "
        "They do not simulate physiological neural dynamics, spike propagation, behavioral impairment, or biological recovery."
    )


class MultiLevelResult(BaseModel):
    """Results at an individual intervention level in a controlled multi-level experiment."""
    level: int
    disabled_neurons: list[int]
    reachable_count: int
    delta_reachability: int
    retention_fraction: float
    path_exists: Optional[bool] = None
    path_hops: Optional[int] = None


class ControlledExperimentRequest(BaseModel):
    """Request for running controlled automated perturbation experiments."""
    experiment_type: str  # 'random_nodes' | 'high_degree_nodes' | 'random_edges' | 'multi_level'
    scope_source_id: int
    scope_target_id: Optional[int] = None
    max_hops: int = 3
    removal_count: int = 1
    degree_type: str = "total"  # 'in' | 'out' | 'total'
    random_seed: Optional[int] = 42
    levels: Optional[list[int]] = None


class ControlledExperimentResponse(BaseModel):
    """Results from a controlled reproducible perturbation experiment."""
    experiment_id: str
    experiment_type: str
    random_seed: Optional[int] = None
    selected_interventions: InterventionConfig
    comparison: PerturbationComparisonResponse
    multi_level_results: Optional[list[MultiLevelResult]] = None


# ── V6: NeuroQuery Foundation & Biological Knowledge Layer Models ─────────────

class EvidenceSource(BaseModel):
    """A peer-reviewed scientific paper, dataset documentation, or curated annotation source."""
    source_id: str
    title: str
    authors: str
    year: int
    journal: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    source_type: str = "peer_reviewed_paper"
    version: Optional[str] = None
    accessed_date: Optional[str] = None
    relevant_section: Optional[str] = None
    notes: Optional[str] = None


class ConceptMapping(BaseModel):
    """Rule linking a biological concept to MaleCNS dataset annotations."""
    mapping_id: str
    concept_id: str
    target_field: str  # 'type' | 'instance' | 'superclass' | 'body_id'
    match_type: str = "exact"  # 'exact' | 'prefix' | 'set'
    target_values: list[str] = Field(default_factory=list)
    dataset_version: str = "male-cns:v1.0"
    evidence_type: str = "functional_connectomics"
    evidence_source_ids: list[str] = Field(default_factory=list)
    rationale: str
    known_limitations: Optional[str] = None
    review_status: str = "verified"  # 'verified' | 'partially_supported' | 'unsupported' | 'requires_review'
    mapping_version: str = "1.0.0"


class BiologicalConcept(BaseModel):
    """A structured biological concept in the NeuroQuery knowledge catalog."""
    concept_id: str
    display_name: str
    description: str
    domain: str  # 'visual_processing' | 'motor_control' | 'olfactory' | 'mechanosensory' | etc.
    related_concepts: list[str] = Field(default_factory=list)
    evidence_status: str = "verified"  # 'verified' | 'partially_supported' | 'unsupported' | 'requires_review'
    mapping_ids: list[str] = Field(default_factory=list)
    source_references: list[str] = Field(default_factory=list)
    dataset_compatibility: str = "compatible"  # 'compatible' | 'partial_coverage' | 'incompatible' | 'untested'
    coverage_notes: Optional[str] = None
    limitations: Optional[str] = None
    catalog_version: str = "1.0.0"


class SupportedInvestigation(BaseModel):
    """A registered analysis pipeline that BrainDebugger can perform on the connectome."""
    investigation_id: str
    name: str
    description: str
    required_concepts: list[str] = Field(default_factory=list)
    required_evidence_types: list[str] = Field(default_factory=list)
    required_dataset_fields: list[str] = Field(default_factory=list)
    required_graph_operations: list[str] = Field(default_factory=list)
    supported_parameters: list[str] = Field(default_factory=list)
    graph_scope_constraints: str
    expected_result_structure: str
    limitations: str
    status: str = "supported"  # 'supported' | 'partially_supported' | 'unsupported' | 'requires_review'
    version: str = "1.0.0"


class KnowledgeCatalogManifest(BaseModel):
    """Metadata describing the loaded biological knowledge catalog."""
    catalog_id: str
    catalog_name: str
    version: str
    description: str
    dataset_version: str = "male-cns:v1.0"
    created_at: str
    last_updated: str
    schema_version: str = "1.0"
    maintainer: Optional[str] = None
    total_concepts: int = 0
    total_sources: int = 0
    total_mappings: int = 0
    total_investigations: int = 0


class KnowledgeStatusResponse(BaseModel):
    """Overall status and health of the biological knowledge layer."""
    catalog_id: str
    catalog_name: str
    catalog_version: str
    dataset_version: str
    catalog_loaded: bool
    total_concepts: int
    total_evidence_sources: int
    total_mappings: int
    total_investigations: int
    supported_investigation_count: int
    validation_status: str
    data_availability_notice: str


class ConceptCandidateNeuron(BaseModel):
    """A real neuron from the MaleCNS dataset matching a biological concept mapping."""
    body_id: int
    cell_type: Optional[str] = None
    instance: Optional[str] = None
    superclass: Optional[str] = None
    status: Optional[str] = None
    consensus_nt: Optional[str] = None
    matched_mapping_id: str
    matched_field: str
    matched_value: str
    evidence_status: str
    evidence_source_ids: list[str] = Field(default_factory=list)


class ConceptDetailResponse(BaseModel):
    """Full detail of a biological concept with linked sources, mappings, and capabilities."""
    concept: BiologicalConcept
    sources: list[EvidenceSource] = Field(default_factory=list)
    mappings: list[ConceptMapping] = Field(default_factory=list)
    supported_investigations: list[SupportedInvestigation] = Field(default_factory=list)
    candidate_count: Optional[int] = None
    dataset_compatibility_status: str


class KnowledgeValidationReport(BaseModel):
    """Automated audit report of knowledge catalog integrity and dataset compatibility."""
    valid: bool
    catalog_version: str
    dataset_version: str
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    concept_count: int
    verified_concept_count: int
    compatible_mapping_count: int
    incompatible_mapping_count: int
    unresolved_references: list[str] = Field(default_factory=list)
    summary: str


# ── V7: NeuroQuery Natural-Language Understanding & Planning Models ─────────

class IntentType(str, Enum):
    """Controlled taxonomy of user investigation intents."""
    circuit_discovery = "circuit_discovery"
    inspect_neuron = "inspect_neuron"
    structural_pathway_search = "structural_pathway_search"
    downstream_reachability = "downstream_reachability"
    structural_intervention_analysis = "structural_intervention_analysis"
    general_question = "general_question"
    unsupported_biological_question = "unsupported_biological_question"
    ambiguous_question = "ambiguous_question"


class PlanSupportStatus(str, Enum):
    """Validation and execution support status for an investigation plan."""
    ready_for_review = "ready_for_review"
    needs_clarification = "needs_clarification"
    partially_supported = "partially_supported"
    unsupported = "unsupported"
    validation_failed = "validation_failed"
    provider_unavailable = "provider_unavailable"


class PlannedOperation(BaseModel):
    """An individual tool operation proposed as part of an investigation plan."""
    operation_id: str
    tool_name: str
    description: str
    parameters: dict[str, object] = Field(default_factory=dict)
    prerequisites: list[str] = Field(default_factory=list)
    is_v8_execution: bool = True


class InvestigationPlan(BaseModel):
    """Structured, evidence-grounded plan produced from a natural-language question."""
    plan_id: str
    plan_schema_version: str = "1.0.0"
    original_question: str
    normalized_question: str
    intent: IntentType
    confidence_score: Optional[float] = None
    confidence_explanation: Optional[str] = None
    concept_ids: list[str] = Field(default_factory=list)
    resolved_concepts: list[BiologicalConcept] = Field(default_factory=list)
    investigation_id: Optional[str] = None
    investigation: Optional[SupportedInvestigation] = None
    requested_entities: dict[str, object] = Field(default_factory=dict)
    parameters: dict[str, object] = Field(default_factory=dict)
    planned_operations: list[PlannedOperation] = Field(default_factory=list)
    required_dataset_fields: list[str] = Field(default_factory=list)
    required_evidence_sources: list[str] = Field(default_factory=list)
    evidence_sources: list[EvidenceSource] = Field(default_factory=list)
    support_status: PlanSupportStatus
    clarification_needed: bool = False
    clarification_questions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    validation_findings: list[str] = Field(default_factory=list)
    explanation: str
    knowledge_catalog_version: str = "1.0.0"
    dataset_version: str = "male-cns:v1.0"
    created_at: str


class PlanGenerationRequest(BaseModel):
    """Request to parse a question and generate an investigation plan."""
    question: str = Field(..., min_length=1, max_length=1000)
    clarification_context: Optional[dict[str, object]] = None
    parameters: Optional[dict[str, object]] = None


class PlanValidationRequest(BaseModel):
    """Request to validate an existing candidate investigation plan."""
    plan: InvestigationPlan


class PlanValidationResponse(BaseModel):
    """Validation report for a structured investigation plan."""
    valid: bool
    plan_id: str
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    support_status: PlanSupportStatus
    summary: str


class NeuroQueryConfigResponse(BaseModel):
    """Current configuration and status of the NeuroQuery LLM provider."""
    provider: str
    model: str
    is_configured: bool
    timeout_seconds: int
    max_retries: int
    supported_intents: list[str]
    notice: str


# ── V8: NeuroQuery Evidence-Grounded Neural Circuit Discovery Models ────────

class ExecutionStatus(str, Enum):
    """Execution status for a NeuroQuery investigation."""
    queued = "queued"
    running = "running"
    completed = "completed"
    partially_completed = "partially_completed"
    failed = "failed"
    cancelled = "cancelled"


class DiscoveredCandidateNeuron(BaseModel):
    """A verified candidate neuron retrieved from MaleCNS annotations matching a concept."""
    body_id: int
    cell_type: Optional[str] = None
    instance: Optional[str] = None
    superclass: Optional[str] = None
    subclass: Optional[str] = None
    consensus_nt: Optional[str] = None
    matched_concept_ids: list[str] = Field(default_factory=list)
    matched_mapping_ids: list[str] = Field(default_factory=list)
    matched_field: str
    matched_value: str
    evidence_status: str  # 'verified' | 'partially_supported' | 'requires_review' | 'unsupported'
    evidence_tier: str  # 'Tier 1 (Verified)' | 'Tier 2 (Partially Supported)' | 'Tier 3 (Under Review)'
    subgraph_in_degree: int = 0
    subgraph_out_degree: int = 0
    subgraph_total_weight: int = 0
    ranking_score: float = 0.0
    ranking_breakdown: Optional[dict[str, float]] = None
    explanation: str = ""


class CircuitSubgraphNode(BaseModel):
    """A node in the discovered bounded neural circuit subgraph."""
    id: str
    body_id: int
    cell_type: Optional[str] = None
    instance: Optional[str] = None
    superclass: Optional[str] = None
    consensus_nt: Optional[str] = None
    is_candidate: bool = False
    is_expanded: bool = False
    matched_concept_ids: list[str] = Field(default_factory=list)
    evidence_status: Optional[str] = None
    degree: int = 0
    total_weight: int = 0


class CircuitSubgraphEdge(BaseModel):
    """A directed, weighted synaptic connection in the discovered circuit."""
    id: str
    source: int
    target: int
    weight: int
    is_inter_candidate: bool = False
    is_expanded: bool = False


class CircuitStructuralMetrics(BaseModel):
    """Structural properties calculated for the bounded discovered subgraph."""
    total_nodes: int
    total_edges: int
    candidate_nodes_count: int
    partner_nodes_count: int
    density: float
    average_weight: float
    max_weight: int
    top_hub_body_id: Optional[int] = None
    connected_components: int = 1


class CircuitDiscoveryResult(BaseModel):
    """Complete evidence-grounded result from an executed NeuroQuery investigation."""
    execution_id: str
    plan_id: Optional[str] = None
    question: str
    intent: IntentType
    resolved_concepts: list[BiologicalConcept] = Field(default_factory=list)
    candidate_neurons: list[DiscoveredCandidateNeuron] = Field(default_factory=list)
    subgraph_nodes: list[CircuitSubgraphNode] = Field(default_factory=list)
    subgraph_edges: list[CircuitSubgraphEdge] = Field(default_factory=list)
    structural_metrics: CircuitStructuralMetrics
    ranking_method: str = "dual_criteria_evidence_and_synaptic_weight"
    evidence_sources: list[EvidenceSource] = Field(default_factory=list)
    dataset_version: str = "male-cns:v1.0"
    catalog_version: str = "1.0.0"
    source_coverage: str = "Traced-only synaptic connection weights from Janelia MaleCNS v1.0"
    limitations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    execution_status: ExecutionStatus
    execution_duration_ms: float
    completed_at: str
    is_partial: bool = False
    partial_reason: Optional[str] = None
    existing_tool_handoff: Optional[dict[str, object]] = None


class InvestigationExecutionRequest(BaseModel):
    """Request to execute a validated investigation plan."""
    plan: Optional[InvestigationPlan] = None
    plan_id: Optional[str] = None
    max_candidates: int = Field(default=20, ge=1, le=100)
    max_subgraph_nodes: int = Field(default=50, ge=2, le=150)
    max_hops: int = Field(default=1, ge=1, le=2)
    min_edge_weight: int = Field(default=1, ge=1, le=100)


class InvestigationExecutionRecord(BaseModel):
    """Execution record tracking lifecycle and operation logs in session memory."""
    execution_id: str
    plan_id: Optional[str] = None
    status: ExecutionStatus
    question: str
    intent: IntentType
    operations_executed: list[str] = Field(default_factory=list)
    logs: list[str] = Field(default_factory=list)
    started_at: str
    completed_at: Optional[str] = None
    result: Optional[CircuitDiscoveryResult] = None
    error: Optional[str] = None


# ── V9: Subgraph Neighborhood Expansion Models ───────────────────────────────

class CircuitSubgraphExpansionRequest(BaseModel):
    """Request to expand a selected neuron's recorded neighborhood beyond the loaded subgraph."""
    body_id: int
    direction: str = Field(default="both", pattern="^(both|incoming|outgoing)$")
    max_nodes: int = Field(default=15, ge=1, le=50)
    min_weight: int = Field(default=1, ge=1, le=100)
    existing_node_ids: list[int] = Field(default_factory=list)


class CircuitSubgraphExpansionResponse(BaseModel):
    """Result of bounded graph expansion from actual MaleCNS connections."""
    root_body_id: int
    direction: str
    new_nodes: list[CircuitSubgraphNode]
    new_edges: list[CircuitSubgraphEdge]
    truncated: bool = False
    message: str


# ── V9: Comparative Analysis Models ──────────────────────────────────────────

class InvestigationComparisonQueryInfo(BaseModel):
    """Query and metadata comparison summary for an investigation."""
    question: str
    intent: IntentType
    concept_ids: list[str] = Field(default_factory=list)
    dataset_version: str
    catalog_version: str


class CandidateRankDelta(BaseModel):
    """Comparison metrics for a candidate neuron present in either or both investigations."""
    body_id: int
    cell_type: Optional[str] = None
    rank_a: Optional[int] = None
    rank_b: Optional[int] = None
    score_a: Optional[float] = None
    score_b: Optional[float] = None
    evidence_tier_a: Optional[str] = None
    evidence_tier_b: Optional[str] = None


class EdgeWeightDelta(BaseModel):
    """Comparison of edge weights across shared directed connections."""
    id: str
    source: int
    target: int
    weight_a: int
    weight_b: int
    delta_weight: int


class CandidateComparisonSummary(BaseModel):
    """Comparative summary of candidate neuron populations."""
    candidates_a_count: int
    candidates_b_count: int
    shared_candidate_count: int
    unique_a_candidate_count: int
    unique_b_candidate_count: int
    jaccard_similarity: float
    shared_candidate_ids: list[int] = Field(default_factory=list)
    unique_a_candidate_ids: list[int] = Field(default_factory=list)
    unique_b_candidate_ids: list[int] = Field(default_factory=list)
    rank_deltas: list[CandidateRankDelta] = Field(default_factory=list)


class GraphComparisonSummary(BaseModel):
    """Comparative summary of directed subgraph topology."""
    nodes_a_count: int
    nodes_b_count: int
    shared_node_count: int
    unique_a_node_count: int
    unique_b_node_count: int
    node_jaccard_similarity: float
    shared_node_ids: list[int] = Field(default_factory=list)
    unique_a_node_ids: list[int] = Field(default_factory=list)
    unique_b_node_ids: list[int] = Field(default_factory=list)
    edges_a_count: int
    edges_b_count: int
    shared_edge_count: int
    unique_a_edge_count: int
    unique_b_edge_count: int
    edge_jaccard_similarity: float
    shared_edge_ids: list[str] = Field(default_factory=list)
    unique_a_edge_ids: list[str] = Field(default_factory=list)
    unique_b_edge_ids: list[str] = Field(default_factory=list)
    weight_deltas: list[EdgeWeightDelta] = Field(default_factory=list)


class EvidenceComparisonSummary(BaseModel):
    """Comparative summary of biological concept and scientific evidence coverage."""
    concepts_a: list[str] = Field(default_factory=list)
    concepts_b: list[str] = Field(default_factory=list)
    shared_concepts: list[str] = Field(default_factory=list)
    unique_a_concepts: list[str] = Field(default_factory=list)
    unique_b_concepts: list[str] = Field(default_factory=list)
    sources_a_count: int
    sources_b_count: int
    shared_source_ids: list[str] = Field(default_factory=list)
    unique_a_source_ids: list[str] = Field(default_factory=list)
    unique_b_source_ids: list[str] = Field(default_factory=list)


class CircuitComparisonRequest(BaseModel):
    """Request to compare two completed investigation results."""
    result_a: CircuitDiscoveryResult
    result_b: CircuitDiscoveryResult


class CircuitComparisonResult(BaseModel):
    """Authentic comparative analysis between two NeuroQuery investigation results."""
    investigation_a: InvestigationComparisonQueryInfo
    investigation_b: InvestigationComparisonQueryInfo
    candidate_comparison: CandidateComparisonSummary
    graph_comparison: GraphComparisonSummary
    evidence_comparison: EvidenceComparisonSummary
    compatibility_warnings: list[str] = Field(default_factory=list)


# ── V10: Circuit Robustness & Sensitivity Analysis Lab Models ───────────────

class RankingProfile(BaseModel):
    """Candidate neuron ranking profile specifying score multipliers."""
    profile_name: str
    tier_weight_mult: float = 1.0
    synaptic_weight_mult: float = 0.5
    degree_mult: float = 10.0
    description: Optional[str] = None


class RobustnessScenarioDefinition(BaseModel):
    """Configuration for an individual robustness evaluation scenario."""
    scenario_id: str
    is_baseline: bool = False
    parameter_label: str
    min_edge_weight: int
    max_subgraph_nodes: int
    max_candidates: int
    ranking_profile: RankingProfile


class CandidateStabilityItem(BaseModel):
    """Stability statistics for a candidate neuron across evaluated scenarios."""
    body_id: int
    cell_type: Optional[str] = None
    instance: Optional[str] = None
    evidence_tier: str
    baseline_rank: Optional[int] = None
    median_rank: float
    min_rank: int
    max_rank: int
    rank_spread: int
    inclusion_count: int
    total_scenarios: int
    inclusion_fraction: float
    in_baseline: bool
    top_k_retained: bool
    observed_ranks: dict[str, int] = Field(default_factory=dict)


class EdgeStabilityItem(BaseModel):
    """Stability metrics for a directed synaptic connection across evaluated scenarios."""
    edge_id: str
    source: int
    target: int
    weight: int
    inclusion_count: int
    total_scenarios: int
    inclusion_fraction: float
    in_baseline: bool
    survives_strict_threshold: bool = False


class MetricSensitivityItem(BaseModel):
    """Sensitivity of graph-level structural metrics under a specific parameter setting."""
    scenario_id: str
    parameter_label: str
    min_edge_weight: int
    max_subgraph_nodes: int
    max_candidates: int
    ranking_profile_name: str
    node_count: int
    edge_count: int
    candidate_count: int
    density: float
    average_weight: float
    delta_nodes: int
    delta_edges: int
    execution_duration_ms: float
    status: str = "completed"


class RobustnessScenarioSummary(BaseModel):
    """Summary of execution and topology for a single robustness scenario."""
    scenario_id: str
    is_baseline: bool = False
    parameter_label: str
    min_edge_weight: int
    max_subgraph_nodes: int
    max_candidates: int
    ranking_profile: RankingProfile
    candidate_count: int
    node_count: int
    edge_count: int
    density: float = 0.0
    average_weight: float = 0.0
    status: str = "completed"
    execution_duration_ms: float = 0.0
    top_candidate_ids: list[int] = Field(default_factory=list)
    error: Optional[str] = None


class RobustnessManifest(BaseModel):
    """Reproducibility manifest recording parameters, source metadata, and execution bounds."""
    manifest_version: str = "1.0.0"
    schema_version: str = "1.0.0"
    analysis_id: str
    baseline_execution_id: str
    baseline_plan_id: str
    research_question: str
    dataset_version: str
    dataset_fingerprint: Optional[str] = None
    catalog_version: str
    ranking_formula_version: str = "v10.0"
    scenario_strategy: str
    strategy: Optional[str] = None
    parameter_grid: list[str] = Field(default_factory=list)
    requested_scenarios: int
    completed_scenarios: int
    failed_scenarios: int
    created_at: str
    execution_duration_total_ms: float
    scientific_limitations: list[str] = Field(default_factory=list)


class RobustnessAnalysisRequest(BaseModel):
    """Request to initiate a circuit robustness and sensitivity analysis."""
    execution_id: Optional[str] = None
    baseline_execution_id: Optional[str] = None
    plan_id: Optional[str] = None
    mode: str = "one_factor_at_a_time"  # "one_factor_at_a_time" | "grid"
    strategy: Optional[str] = None      # Alias for mode ("one_factor", "one_factor_at_a_time", "grid")
    min_edge_weights: Optional[list[int]] = None
    max_subgraph_nodes_list: Optional[list[int]] = None
    max_candidates_list: Optional[list[int]] = None
    ranking_profiles: Optional[list[RankingProfile]] = None
    ranking_profile_names: Optional[list[str]] = None
    top_k_cutoff: int = 5
    baseline_overrides: Optional[dict[str, Any]] = None


class RobustnessAnalysisResponse(BaseModel):
    """Complete results of a circuit robustness and sensitivity analysis."""
    analysis_id: str
    baseline_execution_id: str
    baseline_summary: RobustnessScenarioSummary
    scenarios: list[RobustnessScenarioSummary] = Field(default_factory=list)
    candidate_stability: list[CandidateStabilityItem] = Field(default_factory=list)
    edge_stability: list[EdgeStabilityItem] = Field(default_factory=list)
    metric_sensitivity: list[MetricSensitivityItem] = Field(default_factory=list)
    manifest: RobustnessManifest
    stability_summary: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
