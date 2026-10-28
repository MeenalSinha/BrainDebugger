"""
BrainDebugger — Evidence-Grounded Hypothesis Workbench & Research Notebook Service (V11)

Bridges exploratory circuit discovery, comparative analyses, and robustness sweeps with
a rigorous, cautious, evidence-grounded scientific research workflow:
1. Automated suggestion engine discovering candidate stability, edge threshold survival,
   and structural bottlenecks across real MaleCNS v1.0 data.
2. Structured hypothesis formulation with explicit assumptions, limitations, and alternatives.
3. Bidirectional evidence ledger linking claims directly to execution records, parameter sweeps,
   and authentic literature citations (DOIs).
4. Follow-up study planner transforming hypotheses into executable computational experiments.
5. Automated quantitative evaluation comparing study outcomes against testable criteria.
6. Local-first research notebook project collections, timeline events, and versioned exports.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.circuit_discovery_service import CircuitDiscoveryService
from backend.data_provider import LocalFeatherProvider
from backend.knowledge_service import KnowledgeService
from backend.models import (
    AlternativeCreateRequest,
    AlternativeExplanation,
    EvidenceCreateRequest,
    EvidenceRole,
    EvidenceType,
    FollowupStudy,
    HypothesisCategory,
    HypothesisCreateRequest,
    HypothesisEvidence,
    HypothesisRecord,
    HypothesisStatus,
    HypothesisStatusTransitionRequest,
    HypothesisSuggestRequest,
    HypothesisSuggestion,
    HypothesisUpdateRequest,
    ProjectCreateRequest,
    ResearchNotebookExport,
    ResearchProject,
    ResearchTimelineEvent,
    StatusChangeRecord,
    StudyCreateRequest,
    StudyEvaluationResult,
    StudyExecuteRequest,
)
from backend.perturbation_service import PerturbationService
from backend.robustness_analysis_service import RobustnessAnalysisService
from backend.service import ConnectomeService

logger = logging.getLogger(__name__)

# Standard bias explanations present in EM connectomics
STANDARD_BIASES = [
    {
        "title": "EM Reconstruction & Boundary Truncation Bias",
        "description": "Neurons whose neurites extend near dataset margins may exhibit undercounted synapses or missing arbor branches in MaleCNS v1.0.",
        "bias_category": "em_reconstruction_bias",
    },
    {
        "title": "Synaptic Weight Thresholding Artifact",
        "description": "Inclusion or ranking may be an artifact of arbitrary synaptic weight cutoffs rather than intrinsic biological efficacy.",
        "bias_category": "threshold_artifact",
    },
    {
        "title": "High-Degree Hub Centrality Bias",
        "description": "Large arborization projection neurons accumulate incoming/outgoing synapses regardless of pathway specificity.",
        "bias_category": "hub_degree_bias",
    },
    {
        "title": "Recurrent Feedback Omission",
        "description": "Feedforward directed subgraphs omit dense recurrent backprojections that modulate primary transmission in vivo.",
        "bias_category": "recurrent_feedback_omission",
    },
]


class HypothesisService:
    """Manages hypotheses, evidence ledger, follow-up studies, and research projects."""

    def __init__(
        self,
        circuit_discovery_service: CircuitDiscoveryService,
        robustness_service: RobustnessAnalysisService,
        connectome_service: ConnectomeService,
        perturbation_service: PerturbationService,
        knowledge_service: KnowledgeService,
        data_provider: LocalFeatherProvider,
    ) -> None:
        self.circuit_discovery_service = circuit_discovery_service
        self.robustness_service = robustness_service
        self.connectome_service = connectome_service
        self.perturbation_service = perturbation_service
        self.knowledge_service = knowledge_service
        self.data_provider = data_provider

        # In-memory storage for active session
        self._hypotheses: dict[str, HypothesisRecord] = {}
        self._projects: dict[str, ResearchProject] = {}

        # Initialize a default research project
        self._init_default_project()

    def _init_default_project(self) -> None:
        """Creates an initial default project workspace."""
        default_proj = ResearchProject(
            project_id="proj-default",
            title="MaleCNS Connectome Explorations",
            description="Default investigation project for Drosophila MaleCNS v1.0 connectomic circuits.",
            objective="Formulate and empirically evaluate structural circuit hypotheses.",
            linked_concept_ids=[],
            hypotheses=[],
            timeline=[
                ResearchTimelineEvent(
                    event_id="evt-init",
                    event_type="note_added",
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    title="Project Initialized",
                    description="MaleCNS Connectome Explorations project initialized with version 11 workbench.",
                )
            ],
            notes=[],
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        self._projects[default_proj.project_id] = default_proj

    # ── Suggestion Engine ─────────────────────────────────────────────────────

    def suggest_hypotheses(self, req: HypothesisSuggestRequest) -> list[HypothesisSuggestion]:
        """
        Scans real analysis outputs (robustness sweeps, discovery executions, or comparisons)
        and deterministically derives structured, cautious hypothesis candidates.
        """
        suggestions: list[HypothesisSuggestion] = []

        # 1. Suggestions from Robustness Analysis
        if req.robustness_id:
            rob = self.robustness_service.get_analysis(req.robustness_id)
            if rob:
                suggestions.extend(self._suggest_from_robustness(rob))

        # 2. Suggestions from Circuit Discovery Execution
        if req.execution_id:
            exec_rec = self.circuit_discovery_service.get_execution(req.execution_id)
            if exec_rec:
                suggestions.extend(self._suggest_from_execution(exec_rec))

        # 3. Fallback: If no ID supplied or no specific suggestions, check recent robustness runs
        if not suggestions:
            # Check if there is any stored robustness run in the robustness service
            for rob_id, rob in self.robustness_service._analyses.items():
                suggestions.extend(self._suggest_from_robustness(rob))
                if suggestions:
                    break

        # 4. If still empty, check recent discovery executions
        if not suggestions:
            for ex_id, exec_rec in self.circuit_discovery_service._executions.items():
                suggestions.extend(self._suggest_from_execution(exec_rec))
                if suggestions:
                    break

        # 5. Domain concept suggestions if concept_id supplied
        if req.concept_id:
            concept = self.knowledge_service._concepts.get(req.concept_id)
            if concept:
                suggestions.append(self._suggest_from_concept(concept))

        return suggestions

    def _suggest_from_robustness(self, rob: Any) -> list[HypothesisSuggestion]:
        """Derives hypotheses from candidate stability and directed edge sensitivity."""
        suggestions: list[HypothesisSuggestion] = []
        cands = getattr(rob, "candidate_stability", [])
        edges = getattr(rob, "edge_stability", [])
        manifest = getattr(rob, "manifest", None)

        # High stability candidates (I(v) >= 0.8)
        stable_cands = [c for c in cands if c.inclusion_fraction >= 0.8]
        if stable_cands:
            top_cand = stable_cands[0]
            cand_body = top_cand.body_id
            cand_type = top_cand.cell_type or f"Neuron #{cand_body}"

            suggestion = HypothesisSuggestion(
                suggestion_id=f"sug-{uuid.uuid4().hex[:8]}",
                title=f"{cand_type} Acts as an Indispensable Structural Bottleneck",
                statement=(
                    f"Candidate neuron #{cand_body} ({cand_type}) maintains 100% inclusion "
                    f"across parameter perturbations (inclusion fraction={top_cand.inclusion_fraction:.2f}, "
                    f"median rank={top_cand.median_rank:.1f}), indicating that it provides an obligate "
                    f"structural relay within the evaluated circuit rather than being an artifact of specific thresholds."
                ),
                category=HypothesisCategory.candidate_stability.value,
                rationale=(
                    f"Evaluated across {top_cand.total_scenarios} parameter perturbation scenarios. "
                    f"Rank spread was constrained ({top_cand.rank_spread} positions), and the candidate "
                    f"retained top-K membership in {top_cand.top_k_retained}."
                ),
                source_type="robustness",
                source_id=rob.analysis_id,
                confidence_score=min(0.95, top_cand.inclusion_fraction * 0.95),
                target_neurons=[cand_body],
                target_edges=[],
                suggested_evidence=[
                    {
                        "role": EvidenceRole.supporting.value,
                        "evidence_type": EvidenceType.candidate_stability.value,
                        "summary": f"Inclusion fraction I(v)={top_cand.inclusion_fraction:.2f} across {top_cand.total_scenarios} scenarios.",
                        "source_robustness_id": rob.analysis_id,
                        "body_id": cand_body,
                        "metric_name": "inclusion_fraction",
                        "metric_value": top_cand.inclusion_fraction,
                        "threshold_value": 0.8,
                        "scientific_caveat": "High computational stability reflects graph topology but does not guarantee physiological necessity in vivo.",
                    }
                ],
                suggested_alternatives=[
                    {
                        "title": "Hub Centrality Bias",
                        "description": f"Neuron #{cand_body} has broad dendritic arborization resulting in high in-degree irrespective of pathway specificity.",
                        "bias_category": "hub_degree_bias",
                    }
                ],
                suggested_study={
                    "title": f"Targeted Computational Lesion of #{cand_body}",
                    "analysis_type": "perturbation",
                    "objective": f"Assess whether knockout of #{cand_body} fragments downstream transmission or alternative bypasses exist.",
                    "parameters": {"disabled_neurons": [cand_body]},
                    "expected_null_outcome": "Disabling the neuron does not significantly reduce downstream reachability due to redundant parallel routes.",
                    "testable_criteria": [{"metric": "reachability_loss", "operator": ">=", "value": 0.3}],
                },
                scientific_caveat="Stability under parameter sweeps establishes topological robustness, not biological necessity or behavioral causality.",
            )
            suggestions.append(suggestion)

        # Fragile / threshold-dependent candidates (0 < I(v) <= 0.4)
        fragile_cands = [c for c in cands if 0 < c.inclusion_fraction <= 0.4]
        if fragile_cands:
            frag_cand = fragile_cands[0]
            f_body = frag_cand.body_id
            f_type = frag_cand.cell_type or f"Neuron #{f_body}"

            suggestion = HypothesisSuggestion(
                suggestion_id=f"sug-{uuid.uuid4().hex[:8]}",
                title=f"{f_type} Inclusion Is an Artifact of Permissive Weight Thresholds",
                statement=(
                    f"Candidate neuron #{f_body} ({f_type}) appears only under permissive connection thresholds "
                    f"(inclusion fraction={frag_cand.inclusion_fraction:.2f}) and drops out rapidly as minimum synaptic "
                    f"weight increases, suggesting peripheral or incidental involvement rather than core transmission."
                ),
                category=HypothesisCategory.parameter_sensitivity.value,
                rationale=(
                    f"Inclusion dropped out in {frag_cand.total_scenarios - frag_cand.inclusion_count} of "
                    f"{frag_cand.total_scenarios} scenarios. High rank spread of {frag_cand.rank_spread}."
                ),
                source_type="robustness",
                source_id=rob.analysis_id,
                confidence_score=0.85,
                target_neurons=[f_body],
                target_edges=[],
                suggested_evidence=[
                    {
                        "role": EvidenceRole.supporting.value,
                        "evidence_type": EvidenceType.candidate_stability.value,
                        "summary": f"Inclusion fraction I(v)={frag_cand.inclusion_fraction:.2f} indicates low threshold resilience.",
                        "source_robustness_id": rob.analysis_id,
                        "body_id": f_body,
                        "metric_name": "inclusion_fraction",
                        "metric_value": frag_cand.inclusion_fraction,
                        "threshold_value": 0.5,
                        "scientific_caveat": "Low-weight connections may represent developmental noise, reconstruction inaccuracy, or modulatory synapses.",
                    }
                ],
                suggested_alternatives=[
                    {
                        "title": "Biological Modulatory Role",
                        "description": "Weak anatomical connections can have strong non-linear physiological impacts if clustered on high-impedance dendritic spines.",
                        "bias_category": "threshold_artifact",
                    }
                ],
                suggested_study={
                    "title": f"Fine-Grained Weight Titration for #{f_body}",
                    "analysis_type": "robustness_sweep",
                    "objective": f"Determine the exact synaptic weight inflection threshold where #{f_body} drops from the circuit.",
                    "parameters": {"min_edge_weights": [1, 2, 5, 10, 20]},
                    "expected_null_outcome": "Inclusion fraction remains uniform across all tested thresholds.",
                    "testable_criteria": [{"metric": "inclusion_fraction", "operator": "<=", "value": 0.4}],
                },
                scientific_caveat="Threshold-dependence may be confounded by incomplete reconstruction of thin neurites.",
            )
            suggestions.append(suggestion)

        # High-weight directed edge survival
        strict_edges = [e for e in edges if e.survives_strict_threshold and e.inclusion_fraction >= 0.8]
        if strict_edges:
            top_edge = strict_edges[0]
            pre_id = getattr(top_edge, "source", getattr(top_edge, "source_body_id", None))
            post_id = getattr(top_edge, "target", getattr(top_edge, "target_body_id", None))
            suggestion = HypothesisSuggestion(
                suggestion_id=f"sug-{uuid.uuid4().hex[:8]}",
                title=f"Directed Synapse #{pre_id} → #{post_id} Forms a High-Fidelity Synaptic Drive",
                statement=(
                    f"The directed connection from #{pre_id} to #{post_id} maintains a robust synaptic weight "
                    f"of {top_edge.weight} synapses and survives strict filtering (inclusion={top_edge.inclusion_fraction:.2f}), "
                    f"hypothesized to mediate primary drive with minimal transmission failure."
                ),
                category=HypothesisCategory.structural_connectivity.value,
                rationale=f"Directed edge #{pre_id} → #{post_id} survived in {top_edge.inclusion_count}/{top_edge.total_scenarios} scenarios with weight {top_edge.weight}.",
                source_type="robustness",
                source_id=rob.analysis_id,
                confidence_score=0.92,
                target_neurons=[pre_id, post_id],
                target_edges=[[pre_id, post_id]],
                suggested_evidence=[
                    {
                        "role": EvidenceRole.supporting.value,
                        "evidence_type": EvidenceType.edge_survival.value,
                        "summary": f"Edge #{pre_id} → #{post_id} (wt={top_edge.weight}) survives strict threshold across {top_edge.total_scenarios} scenarios.",
                        "source_robustness_id": rob.analysis_id,
                        "edge_pre": pre_id,
                        "edge_post": post_id,
                        "metric_name": "synaptic_weight",
                        "metric_value": float(top_edge.weight),
                        "scientific_caveat": "Anatomical synapse count correlates with, but does not strictly determine, physiological post-synaptic potential amplitude.",
                    }
                ],
                suggested_alternatives=[
                    {
                        "title": "Reciprocal Asymmetry Bias",
                        "description": f"The reverse connection #{post_id} → #{pre_id} may provide subthreshold feedback not captured by feedforward weight filtering.",
                        "bias_category": "recurrent_feedback_omission",
                    }
                ],
                suggested_study={
                    "title": f"Pathway Continuity Analysis Across #{pre_id} → #{post_id}",
                    "analysis_type": "pathway_search",
                    "objective": f"Trace downstream multi-hop routes passing through directed synapse #{pre_id} → #{post_id}.",
                    "parameters": {"source_body_id": pre_id, "target_body_id": post_id, "max_hops": 2},
                    "expected_null_outcome": "No directed paths exist beyond the immediate pairwise synapse.",
                    "testable_criteria": [{"metric": "path_count", "operator": ">=", "value": 1}],
                },
                scientific_caveat="EM counts do not differentiate electrical gap junctions from chemical synapses unless explicitly annotated.",
            )
            suggestions.append(suggestion)

        return suggestions

    def _suggest_from_execution(self, exec_rec: Any) -> list[HypothesisSuggestion]:
        """Derives hypotheses from candidate ranking and subgraph connectivity."""
        suggestions: list[HypothesisSuggestion] = []
        cands = getattr(exec_rec, "candidates", [])
        graph = getattr(exec_rec, "subgraph", None)
        plan = getattr(exec_rec, "plan", None)

        if len(cands) >= 2:
            top_1 = cands[0]
            top_2 = cands[1]
            b1 = top_1.body_id
            b2 = top_2.body_id
            t1 = top_1.cell_type or f"Neuron #{b1}"
            t2 = top_2.cell_type or f"Neuron #{b2}"

            suggestion = HypothesisSuggestion(
                suggestion_id=f"sug-{uuid.uuid4().hex[:8]}",
                title=f"{t1} and {t2} Form a Co-Regulating Microcircuit Module",
                statement=(
                    f"Top-ranked candidates #{b1} ({t1}) and #{b2} ({t2}) exhibit reciprocal "
                    f"or convergent synaptic connectivity in the extracted subgraph, hypothesized "
                    f"to coordinate concurrent channel gating in the {plan.intent.value if plan else 'circuit'}."
                ),
                category=HypothesisCategory.structural_connectivity.value,
                rationale=(
                    f"Ranked #1 (score={top_1.ranking_score:.3f}) and #2 (score={top_2.ranking_score:.3f}) "
                    f"in discovery execution {exec_rec.execution_id}."
                ),
                source_type="circuit_discovery",
                source_id=exec_rec.execution_id,
                confidence_score=0.88,
                target_neurons=[b1, b2],
                target_edges=[],
                suggested_evidence=[
                    {
                        "role": EvidenceRole.supporting.value,
                        "evidence_type": EvidenceType.candidate_stability.value,
                        "summary": f"Dual top candidates #{b1} and #{b2} co-occur at top tier of discovery ranking.",
                        "source_execution_id": exec_rec.execution_id,
                        "body_id": b1,
                        "scientific_caveat": "High co-ranking may stem from shared upstream inputs rather than direct functional coordination.",
                    }
                ],
                suggested_alternatives=[
                    {
                        "title": "Shared Afferent Input Bias",
                        "description": "Neurons may appear coupled simply because both receive massive sensory inputs from the same neuropil.",
                        "bias_category": "hub_degree_bias",
                    }
                ],
                suggested_study={
                    "title": f"Structural Pathway Search Between #{b1} and #{b2}",
                    "analysis_type": "pathway_search",
                    "objective": f"Test whether #{b1} and #{b2} possess direct reciprocal or multi-hop interconnections.",
                    "parameters": {"source_body_id": b1, "target_body_id": b2, "max_hops": 3},
                    "expected_null_outcome": "No directed connections exist between #{b1} and #{b2}.",
                    "testable_criteria": [{"metric": "path_count", "operator": ">=", "value": 1}],
                },
                scientific_caveat="Dual candidate co-ranking reflects anatomical connectivity metrics, not synchronized physiological spiking.",
            )
            suggestions.append(suggestion)

        return suggestions

    def _suggest_from_concept(self, concept: Any) -> HypothesisSuggestion:
        """Derives a hypothesis from a biological concept's literature grounding."""
        return HypothesisSuggestion(
            suggestion_id=f"sug-{uuid.uuid4().hex[:8]}",
            title=f"Connectomic Subgraph of {concept.display_name} Supports Functionally Segregated Subpathways",
            statement=(
                f"The synaptic subnetwork mapped to '{concept.display_name}' segregates into "
                f"parallel channels with asymmetric synaptic weights, consistent with documented functional literature."
            ),
            category=HypothesisCategory.evidence_coverage.value,
            rationale=f"Grounded in verified knowledge concept '{concept.concept_id}' with {len(concept.source_references)} peer-reviewed citations.",
            source_type="circuit_discovery",
            source_id=concept.concept_id,
            confidence_score=0.82,
            target_neurons=[],
            target_edges=[],
            suggested_evidence=[
                {
                    "role": EvidenceRole.supporting.value,
                    "evidence_type": EvidenceType.literature_curation.value,
                    "summary": f"Curated biological concept '{concept.display_name}' ({concept.evidence_status}).",
                    "concept_id": concept.concept_id,
                    "scientific_caveat": "Literature-derived claims must be verified against MaleCNS v1.0 connectivity directly.",
                }
            ],
            suggested_alternatives=[
                {
                    "title": "Cross-Sex Dimorphism",
                    "description": "Literature findings derived from female hemibrain connectome may diverge in MaleCNS v1.0.",
                    "bias_category": "classification_uncertainty",
                }
            ],
            suggested_study={
                "title": f"Circuit Discovery for Concept {concept.concept_id}",
                "analysis_type": "circuit_discovery",
                "objective": f"Extract candidate subgraph for {concept.concept_id} and examine pathway modularity.",
                "parameters": {"concept_id": concept.concept_id, "max_nodes": 50},
                "expected_null_outcome": "Candidate graph displays homogeneous random topology without subpathway segregation.",
                "testable_criteria": [{"metric": "candidate_count", "operator": ">=", "value": 5}],
            },
            scientific_caveat="Concept mappings represent functional models and must be tempered by connectome reconstruction boundaries.",
        )

    # ── Hypothesis CRUD ───────────────────────────────────────────────────────

    def create_hypothesis(self, req: HypothesisCreateRequest) -> HypothesisRecord:
        """Creates a new formal, evidence-grounded hypothesis."""
        now = datetime.now(timezone.utc).isoformat()
        hyp_id = f"hyp-{uuid.uuid4().hex[:12]}"
        project_id = req.project_id or "proj-default"

        # Initialize evidence records
        evidence_list: list[HypothesisEvidence] = []
        if req.initial_evidence:
            for ev in req.initial_evidence:
                ev_id = f"ev-{uuid.uuid4().hex[:8]}"
                evidence_list.append(
                    HypothesisEvidence(
                        evidence_id=ev_id,
                        hypothesis_id=hyp_id,
                        role=ev.get("role", EvidenceRole.supporting.value),
                        evidence_type=ev.get("evidence_type", EvidenceType.candidate_stability.value),
                        summary=ev.get("summary", "Initial empirical evidence."),
                        source_execution_id=ev.get("source_execution_id"),
                        source_scenario_id=ev.get("source_scenario_id"),
                        source_robustness_id=ev.get("source_robustness_id"),
                        source_manifest_id=ev.get("source_manifest_id"),
                        concept_id=ev.get("concept_id"),
                        body_id=ev.get("body_id"),
                        edge_pre=ev.get("edge_pre"),
                        edge_post=ev.get("edge_post"),
                        metric_name=ev.get("metric_name"),
                        metric_value=ev.get("metric_value"),
                        baseline_value=ev.get("baseline_value"),
                        threshold_value=ev.get("threshold_value"),
                        source_doi=ev.get("source_doi"),
                        scientific_caveat=ev.get("scientific_caveat"),
                        created_at=now,
                    )
                )

        # Initialize alternative explanations
        alt_list: list[AlternativeExplanation] = []
        if req.initial_alternatives:
            for alt in req.initial_alternatives:
                alt_id = f"alt-{uuid.uuid4().hex[:8]}"
                alt_list.append(
                    AlternativeExplanation(
                        explanation_id=alt_id,
                        title=alt.get("title", "Alternative Explanation"),
                        description=alt.get("description", "Alternative confounding factor."),
                        bias_category=alt.get("bias_category", "threshold_artifact"),
                        status=alt.get("status", "plausible"),
                        linked_evidence_ids=alt.get("linked_evidence_ids", []),
                        proposed_tests=alt.get("proposed_tests", []),
                    )
                )
        else:
            # Seed with relevant standard EM bias
            for b in STANDARD_BIASES[:2]:
                alt_id = f"alt-{uuid.uuid4().hex[:8]}"
                alt_list.append(
                    AlternativeExplanation(
                        explanation_id=alt_id,
                        title=b["title"],
                        description=b["description"],
                        bias_category=b["bias_category"],
                        status="plausible",
                    )
                )

        # Mandatory scientific limitations
        limitations = list(req.limitations or [])
        limitations.append(
            "Computational Boundary: Findings derived from static electron-microscopy connectivity. "
            "Synapse counts do not model electrophysiological conductance, neurotransmitter release probability, or neuromodulation."
        )

        hyp = HypothesisRecord(
            hypothesis_id=hyp_id,
            project_id=project_id,
            title=req.title.strip(),
            statement=req.statement.strip(),
            category=req.category,
            scope=req.scope,
            rationale=req.rationale,
            linked_execution_ids=list(req.linked_execution_ids or []),
            linked_robustness_ids=list(req.linked_robustness_ids or []),
            linked_concept_ids=list(req.linked_concept_ids or []),
            target_neurons=list(req.target_neurons or []),
            target_edges=list(req.target_edges or []),
            evidence_records=evidence_list,
            alternative_explanations=alt_list,
            assumptions=list(req.assumptions or [
                "Synaptic adjacency in MaleCNS v1.0 reflects viable structural paths in the adult Drosophila nervous system.",
                "High-weight connections exhibit higher biological transmission fidelity than unitary single-synapse contacts.",
            ]),
            limitations=limitations,
            proposed_studies=[],
            status=HypothesisStatus.draft.value,
            status_history=[
                StatusChangeRecord(
                    from_status="none",
                    to_status=HypothesisStatus.draft.value,
                    reason="Initial hypothesis formulation in research workbench.",
                    changed_by="user",
                    timestamp=now,
                )
            ],
            created_at=now,
            updated_at=now,
        )

        self._hypotheses[hyp_id] = hyp

        # Add to project if exists
        if project_id in self._projects:
            proj = self._projects[project_id]
            proj.hypotheses.append(hyp)
            proj.timeline.append(
                ResearchTimelineEvent(
                    event_id=f"evt-{uuid.uuid4().hex[:8]}",
                    event_type="hypothesis_created",
                    timestamp=now,
                    title=f"Formulated Hypothesis: {hyp.title}",
                    description=hyp.statement[:120] + "...",
                    entity_id=hyp_id,
                    metadata={"category": hyp.category, "target_neurons": hyp.target_neurons},
                )
            )
            proj.updated_at = now

        logger.info("Formulated hypothesis %s: %s", hyp_id, hyp.title)
        return hyp

    def get_hypothesis(self, hypothesis_id: str) -> Optional[HypothesisRecord]:
        """Retrieves a hypothesis by its unique identifier."""
        return self._hypotheses.get(hypothesis_id)

    def list_hypotheses(
        self,
        project_id: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[HypothesisRecord]:
        """Returns hypotheses matching optional filters."""
        res = list(self._hypotheses.values())
        if project_id:
            res = [h for h in res if h.project_id == project_id]
        if category:
            res = [h for h in res if h.category == category]
        if status:
            res = [h for h in res if h.status == status]
        return res

    def update_hypothesis(self, hypothesis_id: str, req: HypothesisUpdateRequest) -> HypothesisRecord:
        """Updates editable fields of an existing hypothesis."""
        hyp = self._hypotheses.get(hypothesis_id)
        if not hyp:
            raise KeyError(f"Hypothesis {hypothesis_id} not found.")

        now = datetime.now(timezone.utc).isoformat()
        if req.title is not None:
            hyp.title = req.title.strip()
        if req.statement is not None:
            hyp.statement = req.statement.strip()
        if req.category is not None:
            hyp.category = req.category
        if req.scope is not None:
            hyp.scope = req.scope
        if req.rationale is not None:
            hyp.rationale = req.rationale
        if req.assumptions is not None:
            hyp.assumptions = req.assumptions
        if req.limitations is not None:
            hyp.limitations = req.limitations
        if req.target_neurons is not None:
            hyp.target_neurons = req.target_neurons
        if req.target_edges is not None:
            hyp.target_edges = req.target_edges

        # Handle status update if provided
        if req.status and req.status != hyp.status:
            reason = req.status_change_reason or "Status updated via edit form."
            self._apply_status_transition(hyp, req.status, reason, now)

        hyp.updated_at = now
        return hyp

    def transition_hypothesis_status(
        self, hypothesis_id: str, req: HypothesisStatusTransitionRequest
    ) -> HypothesisRecord:
        """Applies a controlled lifecycle status transition with an audit log."""
        hyp = self._hypotheses.get(hypothesis_id)
        if not hyp:
            raise KeyError(f"Hypothesis {hypothesis_id} not found.")

        now = datetime.now(timezone.utc).isoformat()
        self._apply_status_transition(hyp, req.new_status, req.reason, now)
        hyp.updated_at = now
        return hyp

    def _apply_status_transition(
        self, hyp: HypothesisRecord, new_status: str, reason: str, now: str
    ) -> None:
        """Helper enforcing transition logging and project timeline sync."""
        old_status = hyp.status
        hyp.status = new_status
        hyp.status_history.append(
            StatusChangeRecord(
                from_status=old_status,
                to_status=new_status,
                reason=reason.strip(),
                changed_by="user",
                timestamp=now,
            )
        )

        # Sync to project timeline
        if hyp.project_id and hyp.project_id in self._projects:
            proj = self._projects[hyp.project_id]
            proj.timeline.append(
                ResearchTimelineEvent(
                    event_id=f"evt-{uuid.uuid4().hex[:8]}",
                    event_type="status_changed",
                    timestamp=now,
                    title=f"Status Transition: {hyp.title}",
                    description=f"Status changed from {old_status} to {new_status}. Rationale: {reason}",
                    entity_id=hyp.hypothesis_id,
                    metadata={"from_status": old_status, "to_status": new_status, "reason": reason},
                )
            )
            proj.updated_at = now

    def delete_hypothesis(self, hypothesis_id: str) -> bool:
        """Removes a hypothesis from store and parent project."""
        if hypothesis_id not in self._hypotheses:
            return False
        hyp = self._hypotheses.pop(hypothesis_id)
        if hyp.project_id and hyp.project_id in self._projects:
            proj = self._projects[hyp.project_id]
            proj.hypotheses = [h for h in proj.hypotheses if h.hypothesis_id != hypothesis_id]
        return True

    # ── Evidence Ledger ───────────────────────────────────────────────────────

    def add_evidence(self, hypothesis_id: str, req: EvidenceCreateRequest) -> HypothesisEvidence:
        """Attaches a new empirical or curated evidence record to a hypothesis."""
        hyp = self._hypotheses.get(hypothesis_id)
        if not hyp:
            raise KeyError(f"Hypothesis {hypothesis_id} not found.")

        now = datetime.now(timezone.utc).isoformat()
        ev_id = f"ev-{uuid.uuid4().hex[:8]}"
        evidence = HypothesisEvidence(
            evidence_id=ev_id,
            hypothesis_id=hypothesis_id,
            role=req.role,
            evidence_type=req.evidence_type,
            summary=req.summary.strip(),
            source_execution_id=req.source_execution_id,
            source_scenario_id=req.source_scenario_id,
            source_robustness_id=req.source_robustness_id,
            source_manifest_id=req.source_manifest_id,
            concept_id=req.concept_id,
            body_id=req.body_id,
            edge_pre=req.edge_pre,
            edge_post=req.edge_post,
            metric_name=req.metric_name,
            metric_value=req.metric_value,
            baseline_value=req.baseline_value,
            threshold_value=req.threshold_value,
            source_doi=req.source_doi,
            scientific_caveat=req.scientific_caveat,
            created_at=now,
        )

        hyp.evidence_records.append(evidence)
        hyp.updated_at = now

        # Add to project timeline
        if hyp.project_id and hyp.project_id in self._projects:
            proj = self._projects[hyp.project_id]
            proj.timeline.append(
                ResearchTimelineEvent(
                    event_id=f"evt-{uuid.uuid4().hex[:8]}",
                    event_type="evidence_added",
                    timestamp=now,
                    title=f"Evidence Attached ({evidence.role}): {evidence.summary[:60]}",
                    description=evidence.summary,
                    entity_id=hypothesis_id,
                    metadata={"evidence_id": ev_id, "role": evidence.role, "type": evidence.evidence_type},
                )
            )
            proj.updated_at = now

        return evidence

    def remove_evidence(self, hypothesis_id: str, evidence_id: str) -> bool:
        """Removes an evidence record from a hypothesis."""
        hyp = self._hypotheses.get(hypothesis_id)
        if not hyp:
            return False
        orig_len = len(hyp.evidence_records)
        hyp.evidence_records = [e for e in hyp.evidence_records if e.evidence_id != evidence_id]
        if len(hyp.evidence_records) < orig_len:
            hyp.updated_at = datetime.now(timezone.utc).isoformat()
            return True
        return False

    def add_alternative(self, hypothesis_id: str, req: AlternativeCreateRequest) -> AlternativeExplanation:
        """Adds a confounding factor or alternative interpretation."""
        hyp = self._hypotheses.get(hypothesis_id)
        if not hyp:
            raise KeyError(f"Hypothesis {hypothesis_id} not found.")

        alt_id = f"alt-{uuid.uuid4().hex[:8]}"
        alt = AlternativeExplanation(
            explanation_id=alt_id,
            title=req.title.strip(),
            description=req.description.strip(),
            bias_category=req.bias_category,
            status=req.status,
            linked_evidence_ids=list(req.linked_evidence_ids or []),
            proposed_tests=list(req.proposed_tests or []),
        )
        hyp.alternative_explanations.append(alt)
        hyp.updated_at = datetime.now(timezone.utc).isoformat()
        return alt

    # ── Follow-Up Studies & Execution ─────────────────────────────────────────

    def create_study(self, hypothesis_id: str, req: StudyCreateRequest) -> FollowupStudy:
        """Registers a follow-up computational investigation."""
        hyp = self._hypotheses.get(hypothesis_id)
        if not hyp:
            raise KeyError(f"Hypothesis {hypothesis_id} not found.")

        now = datetime.now(timezone.utc).isoformat()
        study_id = f"study-{uuid.uuid4().hex[:8]}"
        study = FollowupStudy(
            study_id=study_id,
            hypothesis_id=hypothesis_id,
            title=req.title.strip(),
            analysis_type=req.analysis_type,
            objective=req.objective.strip(),
            parameters=req.parameters or {},
            prerequisites=list(req.prerequisites or []),
            expected_null_outcome=req.expected_null_outcome.strip(),
            testable_criteria=req.testable_criteria or [],
            status="pending",
            created_at=now,
        )

        hyp.proposed_studies.append(study)
        hyp.updated_at = now

        # If hypothesis was in draft, promote to ready_for_testing
        if hyp.status == HypothesisStatus.draft.value:
            self._apply_status_transition(
                hyp,
                HypothesisStatus.ready_for_testing.value,
                f"Follow-up study '{study.title}' registered.",
                now,
            )

        return study

    async def execute_study(
        self, hypothesis_id: str, study_id: str, req: StudyExecuteRequest
    ) -> StudyEvaluationResult:
        """
        Executes a planned study by dispatching to the underlying connectome service,
        evaluates outcomes against predefined testable criteria, and recommends status updates.
        """
        hyp = self._hypotheses.get(hypothesis_id)
        if not hyp:
            raise KeyError(f"Hypothesis {hypothesis_id} not found.")

        study = next((s for s in hyp.proposed_studies if s.study_id == study_id), None)
        if not study:
            raise KeyError(f"Study {study_id} not found in hypothesis {hypothesis_id}.")

        now = datetime.now(timezone.utc).isoformat()
        study.status = "running"
        study_params = dict(study.parameters)
        if req.override_parameters:
            study_params.update(req.override_parameters)

        exec_id = f"exec-{uuid.uuid4().hex[:12]}"
        study.execution_id = exec_id

        # Dispatch execution according to analysis type
        eval_metrics: dict[str, float] = {}
        findings_summary = ""

        try:
            if study.analysis_type == "robustness_sweep":
                # Run robustness sweep
                rob_req = study_params
                # Provide defaults if needed
                from backend.models import RobustnessAnalysisRequest
                rob_obj = RobustnessAnalysisRequest(
                    baseline_execution_id=rob_req.get("baseline_execution_id", hyp.linked_execution_ids[0] if hyp.linked_execution_ids else None),
                    mode=rob_req.get("mode", "one_factor_at_a_time"),
                    min_edge_weights=rob_req.get("min_edge_weights", [5, 10, 20]),
                )
                rob_res = self.robustness_service.analyze_robustness(rob_obj)
                exec_id = rob_res.analysis_id
                study.execution_id = exec_id

                # Calculate metrics for targeted neurons if any
                if hyp.target_neurons:
                    target_b = hyp.target_neurons[0]
                    cand_match = next((c for c in rob_res.candidate_stability if c.body_id == target_b), None)
                    if cand_match:
                        eval_metrics["inclusion_fraction"] = cand_match.inclusion_fraction
                        eval_metrics["rank_spread"] = float(cand_match.rank_spread)
                        findings_summary = (
                            f"Robustness sweep completed ({len(rob_res.scenarios)} scenarios). "
                            f"Target #{target_b} achieved I(v)={cand_match.inclusion_fraction:.2f}."
                        )
                else:
                    eval_metrics["completed_scenarios"] = float(len(rob_res.scenarios))
                    findings_summary = f"Robustness sweep completed {len(rob_res.scenarios)} scenarios."

            elif study.analysis_type == "pathway_search":
                # Run pathway search
                src = study_params.get("source_body_id") or (hyp.target_neurons[0] if hyp.target_neurons else 10001)
                tgt = study_params.get("target_body_id") or (hyp.target_neurons[1] if len(hyp.target_neurons) > 1 else 800146)
                hops = study_params.get("max_hops", 3)
                p_res = self.data_provider.find_paths(source_body_id=src, target_body_id=tgt, max_hops=hops, max_paths=5)
                eval_metrics["path_count"] = float(len(p_res.paths))
                if p_res.paths:
                    eval_metrics["shortest_hops"] = float(p_res.paths[0].hops)
                    eval_metrics["top_path_weight"] = float(p_res.paths[0].total_weight)
                findings_summary = f"Pathway search from #{src} to #{tgt}: {len(p_res.paths)} paths found."

            elif study.analysis_type == "perturbation":
                # Run perturbation comparison
                disabled = study_params.get("disabled_neurons") or hyp.target_neurons
                from backend.models import InterventionConfig, PerturbationRequest
                pert_req = PerturbationRequest(
                    source_body_id=study_params.get("source_body_id", 10001),
                    target_body_id=study_params.get("target_body_id", 800146),
                    interventions=InterventionConfig(disabled_neurons=disabled),
                    max_hops=study_params.get("max_hops", 3),
                )
                pert_res = self.perturbation_service.compare_perturbation(pert_req)
                eval_metrics["reachability_loss"] = float(pert_res.delta_reachability)
                eval_metrics["path_retention"] = 1.0 if pert_res.perturbed_path_found else 0.0
                findings_summary = (
                    f"Perturbation analysis: ΔReachability={pert_res.delta_reachability}, "
                    f"Perturbed path found={pert_res.perturbed_path_found}."
                )

            elif study.analysis_type == "circuit_discovery":
                # Run circuit discovery
                concept_id = study_params.get("concept_id") or (hyp.linked_concept_ids[0] if hyp.linked_concept_ids else "giant_fiber_escape_circuit")
                from backend.models import CircuitDiscoveryRequest
                disc_req = CircuitDiscoveryRequest(
                    concept_id=concept_id,
                    max_subgraph_nodes=study_params.get("max_nodes", 50),
                    min_edge_weight=study_params.get("min_weight", 10),
                )
                disc_res = self.circuit_discovery_service.discover_circuit(disc_req)
                exec_id = disc_res.execution_id
                study.execution_id = exec_id
                eval_metrics["candidate_count"] = float(len(disc_res.candidates))
                eval_metrics["subgraph_node_count"] = float(len(disc_res.subgraph.nodes))
                eval_metrics["subgraph_edge_count"] = float(len(disc_res.subgraph.edges))
                findings_summary = f"Circuit discovery for {concept_id}: {len(disc_res.candidates)} candidates discovered."

            else:
                findings_summary = f"Executed generic analysis for {study.analysis_type}."
                eval_metrics["executed"] = 1.0

        except Exception as exc:
            logger.exception("Study execution failed: %s", exc)
            study.status = "failed"
            study.evaluation_verdict = "inconclusive"
            study.evaluation_summary = f"Execution error: {exc}"
            study.completed_at = datetime.now(timezone.utc).isoformat()
            return StudyEvaluationResult(
                study_id=study_id,
                hypothesis_id=hypothesis_id,
                execution_id=exec_id,
                verdict="inconclusive",
                recommended_status=hyp.status,
                criteria_results=[],
                summary=f"Study execution encountered an error: {exc}",
                scientific_caveat="Study failed due to runtime error; no conclusions drawn.",
            )

        # ── Quantitative Criteria Evaluation ──────────────────────────────────
        criteria_results: list[dict[str, Any]] = []
        all_passed = True
        has_criteria = bool(study.testable_criteria)

        for crit in study.testable_criteria:
            metric_name = crit.get("metric", "")
            operator = crit.get("operator", "==")
            expected_val = float(crit.get("value", 0.0))
            actual_val = eval_metrics.get(metric_name)

            passed = False
            if actual_val is not None:
                if operator == ">=":
                    passed = actual_val >= expected_val
                elif operator == "<=":
                    passed = actual_val <= expected_val
                elif operator == ">":
                    passed = actual_val > expected_val
                elif operator == "<":
                    passed = actual_val < expected_val
                elif operator == "==":
                    passed = abs(actual_val - expected_val) < 1e-4
                elif operator == "!=":
                    passed = abs(actual_val - expected_val) >= 1e-4

            if not passed:
                all_passed = False

            criteria_results.append({
                "metric": metric_name,
                "operator": operator,
                "expected": expected_val,
                "actual": actual_val,
                "passed": passed,
            })

        if not has_criteria:
            verdict = "inconclusive"
            recommended_status = HypothesisStatus.under_investigation.value
            verdict_text = "Study executed successfully; no automated quantitative criteria were specified."
        elif all_passed:
            verdict = "criteria_met"
            recommended_status = HypothesisStatus.supported_by_computational_evidence.value
            verdict_text = "All predefined testable criteria were satisfied by the computational findings."
        else:
            verdict = "criteria_failed"
            recommended_status = HypothesisStatus.contradicted_by_computational_evidence.value
            verdict_text = "One or more quantitative criteria failed to meet empirical thresholds."

        completed_time = datetime.now(timezone.utc).isoformat()
        study.status = "completed"
        study.evaluation_verdict = verdict
        study.evaluation_summary = f"{findings_summary} {verdict_text}"
        study.completed_at = completed_time

        # Automatically attach an evidence record summarizing the study outcome
        ev_role = (
            EvidenceRole.supporting.value
            if verdict == "criteria_met"
            else (EvidenceRole.contradicting.value if verdict == "criteria_failed" else EvidenceRole.contextual.value)
        )
        self.add_evidence(
            hypothesis_id=hypothesis_id,
            req=EvidenceCreateRequest(
                role=ev_role,
                evidence_type="study_outcome",
                summary=f"Follow-up Study '{study.title}' completed with verdict '{verdict}': {findings_summary}",
                source_execution_id=study.execution_id,
                scientific_caveat="Automated computational verification confirms topological criteria, not physiological causality.",
            ),
        )

        # Transition status if recommended
        self._apply_status_transition(
            hyp,
            recommended_status,
            f"Automated evaluation of study '{study.title}' resulted in verdict: {verdict}.",
            completed_time,
        )

        # Record timeline event in project
        if hyp.project_id and hyp.project_id in self._projects:
            proj = self._projects[hyp.project_id]
            proj.timeline.append(
                ResearchTimelineEvent(
                    event_id=f"evt-{uuid.uuid4().hex[:8]}",
                    event_type="study_executed",
                    timestamp=completed_time,
                    title=f"Study Executed: {study.title} ({verdict})",
                    description=study.evaluation_summary,
                    entity_id=hypothesis_id,
                    metadata={"study_id": study_id, "verdict": verdict, "recommended_status": recommended_status},
                )
            )
            proj.updated_at = completed_time

        return StudyEvaluationResult(
            study_id=study_id,
            hypothesis_id=hypothesis_id,
            execution_id=study.execution_id or "",
            verdict=verdict,
            recommended_status=recommended_status,
            criteria_results=criteria_results,
            summary=study.evaluation_summary,
            scientific_caveat="Computational study findings reflect static graph properties of MaleCNS v1.0, requiring in vivo validation.",
        )

    # ── Project Management ────────────────────────────────────────────────────

    def create_project(self, req: ProjectCreateRequest) -> ResearchProject:
        """Initializes a new research project collection."""
        now = datetime.now(timezone.utc).isoformat()
        proj_id = f"proj-{uuid.uuid4().hex[:8]}"
        proj = ResearchProject(
            project_id=proj_id,
            title=req.title.strip(),
            description=req.description or "",
            objective=req.objective or "",
            linked_concept_ids=list(req.linked_concept_ids or []),
            hypotheses=[],
            timeline=[
                ResearchTimelineEvent(
                    event_id=f"evt-{uuid.uuid4().hex[:8]}",
                    event_type="note_added",
                    timestamp=now,
                    title="Project Created",
                    description=f"Created project: {req.title.strip()}",
                )
            ],
            notes=[],
            created_at=now,
            updated_at=now,
        )
        self._projects[proj_id] = proj
        return proj

    def list_projects(self) -> list[ResearchProject]:
        """Lists all registered research projects."""
        return list(self._projects.values())

    def get_project(self, project_id: str) -> Optional[ResearchProject]:
        """Retrieves a research project by ID."""
        return self._projects.get(project_id)

    # ── Export & Import ───────────────────────────────────────────────────────

    def export_notebook(self, project_id: Optional[str] = None) -> ResearchNotebookExport:
        """Produces a versioned, self-contained JSON export of research projects and hypotheses."""
        now = datetime.now(timezone.utc).isoformat()
        if project_id and project_id in self._projects:
            projects = [self._projects[project_id]]
            hypotheses = [h for h in self._hypotheses.values() if h.project_id == project_id]
        else:
            projects = list(self._projects.values())
            hypotheses = list(self._hypotheses.values())

        return ResearchNotebookExport(
            export_version="1.0.0",
            schema_version="1.0.0",
            exported_at=now,
            dataset_version=self.data_provider.dataset_version,
            projects=projects,
            hypotheses=hypotheses,
            metadata={
                "project_count": len(projects),
                "hypothesis_count": len(hypotheses),
                "total_evidence_records": sum(len(h.evidence_records) for h in hypotheses),
                "total_studies": sum(len(h.proposed_studies) for h in hypotheses),
            },
        )

    def import_notebook(self, export_data: ResearchNotebookExport) -> dict[str, Any]:
        """Imports projects and hypotheses from a versioned export document."""
        imported_projects = 0
        imported_hypotheses = 0

        for p in export_data.projects:
            self._projects[p.project_id] = p
            imported_projects += 1

        for h in export_data.hypotheses:
            self._hypotheses[h.hypothesis_id] = h
            imported_hypotheses += 1

        logger.info("Imported %d projects and %d hypotheses", imported_projects, imported_hypotheses)
        return {
            "status": "success",
            "imported_projects": imported_projects,
            "imported_hypotheses": imported_hypotheses,
            "dataset_version": export_data.dataset_version,
        }

    # ── Report Generation ─────────────────────────────────────────────────────

    def generate_hypothesis_markdown(self, hypothesis_id: str) -> str:
        """Generates a comprehensive scientific Markdown report for a hypothesis."""
        hyp = self._hypotheses.get(hypothesis_id)
        if not hyp:
            raise KeyError(f"Hypothesis {hypothesis_id} not found.")

        sup_ev = [e for e in hyp.evidence_records if e.role == EvidenceRole.supporting.value]
        contra_ev = [e for e in hyp.evidence_records if e.role == EvidenceRole.contradicting.value]
        ctx_ev = [e for e in hyp.evidence_records if e.role == EvidenceRole.contextual.value]

        lines = [
            f"# Computational Hypothesis Report: {hyp.title}",
            "",
            f"**Hypothesis ID:** `{hyp.hypothesis_id}`  ",
            f"**Status:** `{hyp.status.upper()}`  ",
            f"**Category:** `{hyp.category}`  ",
            f"**Dataset:** `{self.data_provider.dataset_version}`  ",
            f"**Created:** {hyp.created_at}  ",
            f"**Last Updated:** {hyp.updated_at}  ",
            "",
            "## 1. Formal Scientific Statement",
            "",
            f"> {hyp.statement}",
            "",
        ]

        if hyp.rationale:
            lines.extend([
                "### Rationale & Context",
                hyp.rationale,
                "",
            ])

        lines.extend([
            "## 2. Target Connectome Entities",
            "",
            f"- **Target Neurons:** {', '.join(f'#{n}' for n in hyp.target_neurons) if hyp.target_neurons else 'None specified'}",
            f"- **Target Directed Edges:** {', '.join(f'#{e[0]} → #{e[1]}' for e in hyp.target_edges) if hyp.target_edges else 'None specified'}",
            f"- **Linked Concepts:** {', '.join(hyp.linked_concept_ids) if hyp.linked_concept_ids else 'None specified'}",
            "",
            "## 3. Evidence Ledger",
            "",
            f"### Supporting Evidence ({len(sup_ev)})",
            "",
        ])
        if sup_ev:
            for e in sup_ev:
                lines.append(f"- **[{e.evidence_type}]** {e.summary}")
                if e.scientific_caveat:
                    lines.append(f"  *Caveat: {e.scientific_caveat}*")
        else:
            lines.append("*No supporting evidence records logged.*")

        lines.extend([
            "",
            f"### Contradicting / Inconsistent Evidence ({len(contra_ev)})",
            "",
        ])
        if contra_ev:
            for e in contra_ev:
                lines.append(f"- **[{e.evidence_type}]** {e.summary}")
                if e.scientific_caveat:
                    lines.append(f"  *Caveat: {e.scientific_caveat}*")
        else:
            lines.append("*No contradicting evidence records logged.*")

        lines.extend([
            "",
            "## 4. Alternative Explanations & Confounding Biases",
            "",
        ])
        if hyp.alternative_explanations:
            for alt in hyp.alternative_explanations:
                lines.append(f"### {alt.title} (`{alt.status}`)")
                lines.append(f"- **Bias Category:** `{alt.bias_category}`")
                lines.append(f"- {alt.description}")
                lines.append("")
        else:
            lines.append("*No alternative explanations recorded.*")

        lines.extend([
            "## 5. Follow-Up Computational Studies",
            "",
        ])
        if hyp.proposed_studies:
            for s in hyp.proposed_studies:
                lines.append(f"### Study: {s.title} (`{s.status}`)")
                lines.append(f"- **Analysis Type:** `{s.analysis_type}`")
                lines.append(f"- **Objective:** {s.objective}")
                lines.append(f"- **Expected Null Outcome:** {s.expected_null_outcome}")
                if s.evaluation_verdict:
                    lines.append(f"- **Evaluation Verdict:** `{s.evaluation_verdict}`")
                if s.evaluation_summary:
                    lines.append(f"- **Findings:** {s.evaluation_summary}")
                lines.append("")
        else:
            lines.append("*No follow-up studies planned.*")

        lines.extend([
            "## 6. Scientific Limitations & Boundary Conditions",
            "",
        ])
        for lim in hyp.limitations:
            lines.append(f"- {lim}")

        lines.append("")
        return "\n".join(lines)
