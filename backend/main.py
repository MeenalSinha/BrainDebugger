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
    ControlledExperimentRequest,
    ControlledExperimentResponse,
    DownstreamCascadeResponse,
    ErrorDetail,
    GraphResponse,
    HealthResponse,
    InterventionConfig,
    Neuron,
    NeuronSearchResponse,
    PathwaySearchResponse,
    PerturbationComparisonRequest,
    PerturbationComparisonResponse,
    PerturbationValidationResponse,
    BiologicalConcept,
    EvidenceSource,
    ConceptMapping,
    SupportedInvestigation,
    KnowledgeStatusResponse,
    ConceptCandidateNeuron,
    ConceptDetailResponse,
    KnowledgeValidationReport,
    IntentType,
    InvestigationPlan,
    PlanGenerationRequest,
    PlanValidationRequest,
    PlanValidationResponse,
    NeuroQueryConfigResponse,
    CircuitDiscoveryResult,
    InvestigationExecutionRequest,
    InvestigationExecutionRecord,
    CircuitSubgraphExpansionRequest,
    CircuitSubgraphExpansionResponse,
    CircuitComparisonRequest,
    CircuitComparisonResult,
)
from backend.perturbation_service import PerturbationService
from backend.knowledge_service import KnowledgeService
from backend.query_planner_service import QueryPlannerService
from backend.circuit_discovery_service import CircuitDiscoveryService
from backend.service import ConnectomeService

logger = logging.getLogger(__name__)

# ── Singletons ────────────────────────────────────────────────────────────────
_provider: Optional[LocalFeatherProvider] = None
_service: Optional[ConnectomeService] = None
_perturbation_service: Optional[PerturbationService] = None
_knowledge_service: Optional[KnowledgeService] = None
_planner_service: Optional[QueryPlannerService] = None
_circuit_discovery_service: Optional[CircuitDiscoveryService] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load data files once at startup; release on shutdown."""
    global _provider, _service, _perturbation_service, _knowledge_service, _planner_service, _circuit_discovery_service
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
    _perturbation_service = PerturbationService(_provider)
    _knowledge_service = KnowledgeService(_provider)
    _planner_service = QueryPlannerService(_knowledge_service, _provider, settings)
    _circuit_discovery_service = CircuitDiscoveryService(
        knowledge_service=_knowledge_service,
        data_provider=_provider,
        connectome_service=_service,
        perturbation_service=_perturbation_service,
        query_planner_service=_planner_service,
        settings=settings,
    )
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
    allow_methods=["GET", "POST", "OPTIONS"],
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


def get_perturbation_service() -> PerturbationService:
    if _perturbation_service is None or not _provider.is_loaded:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "service_unavailable",
                "message": "Data files are not loaded or perturbation service is not ready.",
            },
        )
    return _perturbation_service


PerturbationDep = Annotated[PerturbationService, Depends(get_perturbation_service)]


def get_knowledge_service() -> KnowledgeService:
    if _knowledge_service is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "service_unavailable",
                "message": "Knowledge catalog is not loaded or knowledge service is not ready.",
            },
        )
    return _knowledge_service


KnowledgeDep = Annotated[KnowledgeService, Depends(get_knowledge_service)]


def get_planner_service() -> QueryPlannerService:
    if _planner_service is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "service_unavailable",
                "message": "NeuroQuery planner service is not loaded or not ready.",
            },
        )
    return _planner_service


PlannerDep = Annotated[QueryPlannerService, Depends(get_planner_service)]


def get_circuit_discovery_service() -> CircuitDiscoveryService:
    if _circuit_discovery_service is None or not _provider.is_loaded:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "service_unavailable",
                "message": "Circuit discovery service is not loaded or connectome dataset is not ready.",
            },
        )
    return _circuit_discovery_service


CircuitDiscoveryDep = Annotated[CircuitDiscoveryService, Depends(get_circuit_discovery_service)]



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


# ── V3: Pathway Tracer & Downstream Cascade Endpoints ───────────────────────

@app.get(
    "/api/paths",
    response_model=PathwaySearchResponse,
    responses={
        400: {"model": ErrorDetail},
        404: {"model": ErrorDetail},
        500: {"model": ErrorDetail},
        503: {"model": ErrorDetail},
    },
    summary="Search directed pathways between source and target neurons",
    tags=["Pathways"],
)
async def find_paths(
    source_body_id: int = Query(..., description="Source presynaptic neuron body ID"),
    target_body_id: int = Query(..., description="Target postsynaptic neuron body ID"),
    max_hops: int = Query(5, ge=1, le=10, description="Maximum path length in synaptic hops"),
    max_paths: int = Query(3, ge=1, le=20, description="Maximum alternative paths to return"),
    strategy: str = Query("shortest", description="Ranking strategy: 'shortest' or 'weight_prioritized'"),
    min_weight: Optional[int] = Query(None, ge=1, description="Optional minimum synapse weight threshold per edge"),
    svc: ServiceDep = None,
) -> PathwaySearchResponse:
    """
    Finds directed structural pathways from source_body_id to target_body_id.
    Preserves exact edge direction (source -> intermediate -> target).
    Supports shortest structural paths (fewest hops) and relative weight-prioritized routing.
    """
    if strategy not in ("shortest", "weight_prioritized"):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_strategy",
                "message": f"Strategy '{strategy}' is invalid. Allowed: 'shortest', 'weight_prioritized'.",
            },
        )
    try:
        return svc.find_paths(
            source_body_id=source_body_id,
            target_body_id=target_body_id,
            max_hops=max_hops,
            max_paths=max_paths,
            strategy=strategy,
            min_weight=min_weight,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": str(exc)},
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_parameters", "message": str(exc)},
        )
    except Exception as exc:
        logger.error(
            "Path search failed: source=%d target=%d %s",
            source_body_id,
            target_body_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail={"error": "path_search_failed", "message": str(exc)})


@app.get(
    "/api/neurons/{body_id}/downstream-cascade",
    response_model=DownstreamCascadeResponse,
    responses={
        400: {"model": ErrorDetail},
        404: {"model": ErrorDetail},
        500: {"model": ErrorDetail},
        503: {"model": ErrorDetail},
    },
    summary="Compute downstream structural reachability cascade from a source neuron",
    tags=["Cascade"],
)
async def compute_downstream_cascade(
    body_id: int,
    svc: ServiceDep,
    max_hops: int = Query(3, ge=1, le=6, description="Maximum hop depth to traverse downstream"),
    max_nodes: int = Query(300, ge=10, le=1000, description="Maximum visited nodes limit"),
    max_edges: int = Query(600, ge=10, le=2000, description="Maximum included edges limit"),
    min_weight: Optional[int] = Query(None, ge=1, description="Optional minimum synapse weight threshold per edge"),
) -> DownstreamCascadeResponse:
    """
    Traverses outgoing directed connections from body_id to identify reachable downstream neurons.
    Organizes results into minimum structural graph distance layers (hop 0, 1, 2, ...).
    Reconvergent routes and cycles are handled safely without duplicating nodes.
    """
    try:
        return svc.compute_downstream_cascade(
            source_body_id=body_id,
            max_hops=max_hops,
            max_nodes=max_nodes,
            max_edges=max_edges,
            min_weight=min_weight,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": str(exc)},
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_parameters", "message": str(exc)},
        )
    except Exception as exc:
        logger.error(
            "Downstream cascade failed: body_id=%d %s",
            body_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail={"error": "cascade_failed", "message": str(exc)})


# ── V5: Perturbation Lab Endpoints ──────────────────────────────────────────

@app.post(
    "/api/perturbations/validate",
    response_model=PerturbationValidationResponse,
    summary="Validate proposed neuron and edge interventions",
    tags=["Perturbation Lab"],
)
async def validate_perturbations(
    config: InterventionConfig,
    pert_svc: PerturbationDep,
) -> PerturbationValidationResponse:
    """Validate that specified neurons and edges exist in the MaleCNS dataset."""
    try:
        return pert_svc.validate_interventions(config)
    except Exception as exc:
        logger.error("Intervention validation failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "validation_failed", "message": str(exc)})


@app.post(
    "/api/perturbations/compare",
    response_model=PerturbationComparisonResponse,
    summary="Compare baseline connectome against perturbed network",
    tags=["Perturbation Lab"],
)
async def compare_perturbations(
    req: PerturbationComparisonRequest,
    pert_svc: PerturbationDep,
) -> PerturbationComparisonResponse:
    """
    Calculate and compare baseline vs perturbed structural connectivity,
    shortest routes, and downstream cascade reachability.
    """
    try:
        return pert_svc.compare_perturbation(req)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": str(exc)})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": "invalid_parameters", "message": str(exc)})
    except Exception as exc:
        logger.error("Perturbation comparison failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "comparison_failed", "message": str(exc)})


@app.post(
    "/api/perturbations/experiments",
    response_model=ControlledExperimentResponse,
    summary="Run controlled perturbation experiment (random, high-degree, multi-level)",
    tags=["Perturbation Lab"],
)
async def run_controlled_experiment(
    req: ControlledExperimentRequest,
    pert_svc: PerturbationDep,
) -> ControlledExperimentResponse:
    """
    Run reproducible automated perturbation experiments (e.g., random neuron removal,
    high-degree bottleneck removal, or progressive multi-level lesion cascades).
    """
    try:
        return pert_svc.run_controlled_experiment(req)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": str(exc)})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": "invalid_parameters", "message": str(exc)})
    except Exception as exc:
        logger.error("Controlled experiment failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "experiment_failed", "message": str(exc)})


# ── V6: NeuroQuery Biological Knowledge Layer Routes ─────────────────────────

@app.get(
    "/api/knowledge/status",
    response_model=KnowledgeStatusResponse,
    summary="NeuroQuery knowledge catalog health and metadata",
    tags=["NeuroQuery Knowledge Layer"],
)
async def get_knowledge_status(
    knowledge_svc: KnowledgeDep,
) -> KnowledgeStatusResponse:
    """Returns metadata, versions, and validation status of the biological knowledge catalog."""
    return knowledge_svc.get_status()


@app.get(
    "/api/knowledge/concepts",
    response_model=list[BiologicalConcept],
    summary="List biological concepts in the NeuroQuery catalog",
    tags=["NeuroQuery Knowledge Layer"],
)
async def list_concepts(
    domain: Optional[str] = Query(None, description="Filter by biological domain (e.g. visual_processing, motor_control)"),
    evidence_status: Optional[str] = Query(None, description="Filter by evidence status (verified, partially_supported, unsupported, requires_review)"),
    q: Optional[str] = Query(None, description="Case-insensitive search over concept names and descriptions"),
    knowledge_svc: KnowledgeDep = None,
) -> list[BiologicalConcept]:
    """Retrieve cataloged biological concepts with optional domain, status, or keyword filtering."""
    return knowledge_svc.list_concepts(domain=domain, evidence_status=evidence_status, query=q)


@app.get(
    "/api/knowledge/concepts/{concept_id}",
    response_model=ConceptDetailResponse,
    summary="Get full biological concept details and linked evidence",
    tags=["NeuroQuery Knowledge Layer"],
)
async def get_concept_detail(
    concept_id: str,
    knowledge_svc: KnowledgeDep,
) -> ConceptDetailResponse:
    """Retrieve complete concept metadata including linked peer-reviewed papers, mappings, and capabilities."""
    detail = knowledge_svc.get_concept(concept_id)
    if detail is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "concept_not_found", "message": f"Biological concept '{concept_id}' not found in catalog."},
        )
    return detail


@app.get(
    "/api/knowledge/concepts/{concept_id}/candidates",
    response_model=list[ConceptCandidateNeuron],
    summary="Retrieve candidate MaleCNS neurons matching concept mappings",
    tags=["NeuroQuery Knowledge Layer"],
)
async def get_concept_candidates(
    concept_id: str,
    limit: int = Query(50, ge=1, le=500, description="Max candidate neurons to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    knowledge_svc: KnowledgeDep = None,
) -> list[ConceptCandidateNeuron]:
    """Retrieve real neurons from the MaleCNS dataset matching verified concept mappings."""
    concept = knowledge_svc._concepts.get(concept_id)
    if not concept:
        raise HTTPException(
            status_code=404,
            detail={"error": "concept_not_found", "message": f"Biological concept '{concept_id}' not found."},
        )
    return knowledge_svc.get_candidate_neurons(concept_id, limit=limit, offset=offset)


@app.get(
    "/api/knowledge/investigations",
    response_model=list[SupportedInvestigation],
    summary="List supported graph investigation pipelines",
    tags=["NeuroQuery Knowledge Layer"],
)
async def list_supported_investigations(
    knowledge_svc: KnowledgeDep,
) -> list[SupportedInvestigation]:
    """List all connectome graph investigations supported by BrainDebugger."""
    return knowledge_svc.list_investigations()


@app.get(
    "/api/knowledge/sources/{source_id}",
    response_model=EvidenceSource,
    summary="Get details of a peer-reviewed evidence source",
    tags=["NeuroQuery Knowledge Layer"],
)
async def get_evidence_source(
    source_id: str,
    knowledge_svc: KnowledgeDep,
) -> EvidenceSource:
    """Retrieve a registered scientific paper, dataset documentation, or curated source by ID."""
    source = knowledge_svc.get_evidence_source(source_id)
    if source is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "source_not_found", "message": f"Evidence source '{source_id}' not found."},
        )
    return source


@app.get(
    "/api/knowledge/audit",
    response_model=KnowledgeValidationReport,
    summary="Run automated knowledge catalog validation and compatibility audit",
    tags=["NeuroQuery Knowledge Layer"],
)
async def audit_knowledge_catalog(
    knowledge_svc: KnowledgeDep,
) -> KnowledgeValidationReport:
    """Performs an automated audit of the knowledge catalog: reference integrity and dataset compatibility."""
    return knowledge_svc.validate_catalog()


# ── V7: NeuroQuery Natural-Language Planning Endpoints ─────────────────────────

@app.post(
    "/api/neuroquery/plan",
    response_model=InvestigationPlan,
    summary="Translate natural-language question into structured investigation plan",
    tags=["NeuroQuery Natural-Language Planner"],
)
async def generate_investigation_plan(
    req: PlanGenerationRequest,
    planner_svc: PlannerDep,
) -> InvestigationPlan:
    """
    Translates a user question into a validated, evidence-grounded investigation plan.
    Does NOT execute arbitrary graph queries or claim circuits are discovered (V8 boundary).
    """
    try:
        return await planner_svc.generate_plan(req)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_request", "message": str(exc)},
        )
    except Exception as exc:
        logger.exception("Error generating plan: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={"error": "plan_generation_failed", "message": f"Planning error: {exc}"},
        )


@app.post(
    "/api/neuroquery/validate",
    response_model=PlanValidationResponse,
    summary="Validate candidate investigation plan against catalog and constraints",
    tags=["NeuroQuery Natural-Language Planner"],
)
async def validate_investigation_plan(
    req: PlanValidationRequest,
    planner_svc: PlannerDep,
) -> PlanValidationResponse:
    """
    Validates a structured investigation plan against the V6 concept catalog,
    supported-investigation registry, parameter ranges, and MaleCNS v1.0 dataset.
    """
    return planner_svc.validate_plan(req.plan)


@app.get(
    "/api/neuroquery/intents",
    response_model=list[dict[str, str]],
    summary="List supported NeuroQuery intent taxonomy",
    tags=["NeuroQuery Natural-Language Planner"],
)
async def list_neuroquery_intents() -> list[dict[str, str]]:
    """Returns the controlled taxonomy of supported and classified intent types."""
    return [
        {
            "intent": IntentType.circuit_discovery.value,
            "display_name": "Circuit Discovery",
            "description": "Identify candidate neuron populations, retrieve directed synaptic connectivity, construct bounded subgraphs, and rank candidates using evidence and network topology.",
            "status": "supported",
        },
        {
            "intent": IntentType.inspect_neuron.value,
            "display_name": "Neuron Inspection",
            "description": "Inspect anatomical metadata, synaptic partners, and neurotransmitters for a specific neuron or type.",
            "status": "supported",
        },
        {
            "intent": IntentType.structural_pathway_search.value,
            "display_name": "Structural Pathway Search",
            "description": "Compute directed shortest synaptic paths and alternative routes between source and target neurons.",
            "status": "supported",
        },
        {
            "intent": IntentType.downstream_reachability.value,
            "display_name": "Downstream Reachability",
            "description": "Calculate multi-hop downstream reachability cascade from an identified root neuron.",
            "status": "supported",
        },
        {
            "intent": IntentType.structural_intervention_analysis.value,
            "display_name": "Structural Intervention Analysis",
            "description": "Simulate in-silico lesions (neuron/connection knockouts) and analyze network resilience.",
            "status": "supported",
        },
        {
            "intent": IntentType.general_question.value,
            "display_name": "General Neurobiology Question",
            "description": "General biological or methodological question that does not require direct graph traversal.",
            "status": "supported",
        },
        {
            "intent": IntentType.unsupported_biological_question.value,
            "display_name": "Unsupported Biological Query",
            "description": "Biological function lacks sufficient MaleCNS v1.0 annotation or literature support in the knowledge layer.",
            "status": "unsupported",
        },
        {
            "intent": IntentType.ambiguous_question.value,
            "display_name": "Ambiguous Question",
            "description": "Input question is ambiguous or underspecified and requires user clarification.",
            "status": "needs_clarification",
        },
    ]


@app.get(
    "/api/neuroquery/config",
    response_model=NeuroQueryConfigResponse,
    summary="Get current NeuroQuery LLM provider configuration and status",
    tags=["NeuroQuery Natural-Language Planner"],
)
async def get_neuroquery_config(
    planner_svc: PlannerDep,
) -> NeuroQueryConfigResponse:
    """Returns active provider, model name, and configuration health without exposing secrets."""
    settings = planner_svc.settings
    is_conf = bool(settings.neuroquery_llm_api_key) if settings.neuroquery_llm_provider != "mock" else True
    return NeuroQueryConfigResponse(
        provider=settings.neuroquery_llm_provider,
        model=settings.neuroquery_llm_model,
        is_configured=is_conf,
        timeout_seconds=settings.neuroquery_llm_timeout_seconds,
        max_retries=settings.neuroquery_llm_max_retries,
        supported_intents=[i.value for i in IntentType],
        notice=(
            "Mock LLM provider is active; running deterministic biological NLP offline."
            if settings.neuroquery_llm_provider == "mock"
            else f"Live LLM provider '{settings.neuroquery_llm_provider}' configured with model '{settings.neuroquery_llm_model}'."
        ),
    )


# ── V8: NeuroQuery Circuit Discovery Execution Endpoints ─────────────────────

@app.post(
    "/api/neuroquery/execute",
    response_model=CircuitDiscoveryResult,
    summary="Execute validated NeuroQuery investigation plan and discover circuit",
    tags=["NeuroQuery Circuit Discovery"],
)
async def execute_investigation_plan(
    req: InvestigationExecutionRequest,
    discovery_svc: CircuitDiscoveryDep,
) -> CircuitDiscoveryResult:
    """
    Executes a validated investigation plan against the real Janelia MaleCNS v1.0 connectome.
    Discovers candidate neurons, extracts bounded directed subgraphs, computes structural metrics,
    and transparently ranks candidates using dual evidence-grounded criteria.
    """
    try:
        return discovery_svc.execute_plan(req)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "execution_validation_error", "message": str(exc)},
        )
    except Exception as exc:
        logger.exception("Error executing investigation: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={"error": "execution_failed", "message": f"Circuit discovery execution error: {exc}"},
        )


@app.get(
    "/api/neuroquery/executions/{execution_id}",
    response_model=InvestigationExecutionRecord,
    summary="Retrieve persistent investigation execution record and logs",
    tags=["NeuroQuery Circuit Discovery"],
)
async def get_investigation_execution(
    execution_id: str,
    discovery_svc: CircuitDiscoveryDep,
) -> InvestigationExecutionRecord:
    """Retrieves an execution record with real-time lifecycle status and operation logs."""
    record = discovery_svc.get_execution(execution_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": f"Execution record '{execution_id}' not found."},
        )
    return record


# ── V9: Subgraph Expansion and Comparative Analysis Endpoints ────────────────

@app.post(
    "/api/neuroquery/expand-subgraph",
    response_model=CircuitSubgraphExpansionResponse,
    summary="Expand a selected neuron's recorded neighborhood beyond the loaded subgraph",
    tags=["NeuroQuery Circuit Discovery"],
)
async def expand_circuit_subgraph(
    req: CircuitSubgraphExpansionRequest,
    discovery_svc: CircuitDiscoveryDep,
) -> CircuitSubgraphExpansionResponse:
    """
    Expands the recorded neighborhood of a selected neuron using authentic Janelia MaleCNS v1.0
    connections, bounded by explicit node, edge, and minimum synaptic weight limits.
    """
    try:
        return discovery_svc.expand_subgraph(req)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "expansion_validation_error", "message": str(exc)},
        )
    except Exception as exc:
        logger.exception("Error expanding subgraph: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={"error": "expansion_failed", "message": f"Subgraph expansion error: {exc}"},
        )


@app.post(
    "/api/neuroquery/compare",
    response_model=CircuitComparisonResult,
    summary="Compare two completed NeuroQuery investigation results",
    tags=["NeuroQuery Comparative Analysis"],
)
async def compare_investigations(
    req: CircuitComparisonRequest,
    discovery_svc: CircuitDiscoveryDep,
) -> CircuitComparisonResult:
    """
    Performs authentic comparative analysis between two completed NeuroQuery investigations,
    computing candidate overlap, strictly direction-sensitive edge differences, weight deltas,
    evidence differences, and scientific compatibility warnings.
    """
    try:
        return discovery_svc.compare_investigations(req)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "comparison_validation_error", "message": str(exc)},
        )
    except Exception as exc:
        logger.exception("Error comparing investigations: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={"error": "comparison_failed", "message": f"Investigation comparison error: {exc}"},
        )
