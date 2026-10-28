"""
BrainDebugger — Research Program Synthesis, Evidence Gap Analysis & Prioritization Service (V12)

Coordinates project-level research synthesis across multiple hypotheses:
- Cross-hypothesis evidence relationship indexing (shared vs independent sources)
- Deterministic contradiction and inconsistency detection
- Actionable evidence-gap analysis
- Dependency-aware study prioritization and research agenda planning
- Directed Acyclic Graph (DAG) study dependency validation
- Controlled multi-study research campaign preview and execution with failure isolation
- Multi-format synthesis exports (JSON, Markdown, CSV)
"""

from __future__ import annotations

import csv
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.data_provider import LocalFeatherProvider
from backend.hypothesis_service import HypothesisService
from backend.knowledge_service import KnowledgeService
from backend.models import (
    AgendaGenerateRequest,
    CampaignCreateRequest,
    CampaignPreviewResponse,
    CampaignStudyPlan,
    CampaignStudyResult,
    ContradictionRecord,
    ContradictionReviewRequest,
    ContradictionReviewStatus,
    ContradictionSeverity,
    DependencyCreateRequest,
    EvidenceGap,
    GapCategory,
    GapStatus,
    GapUpdateRequest,
    HypothesisRecord,
    ResearchActionRecommendation,
    ResearchAgenda,
    ResearchCampaign,
    ResearchSynthesis,
    StudyDependency,
    StudyDependencyType,
    StudyExecuteRequest,
    SynthesisGenerateRequest,
)

logger = logging.getLogger("backend.research_synthesis_service")


class ResearchSynthesisService:
    """Core domain service for project-level research program synthesis and study prioritization."""

    def __init__(
        self,
        hypothesis_svc: HypothesisService,
        knowledge_svc: KnowledgeService,
        data_provider: LocalFeatherProvider,
    ) -> None:
        self.hypothesis_svc = hypothesis_svc
        self.knowledge_svc = knowledge_svc
        self.data_provider = data_provider

        # In-memory storage for V12 records (keyed by project_id / record_id)
        self._syntheses: dict[str, ResearchSynthesis] = {}
        self._dependencies: dict[str, list[StudyDependency]] = {}  # project_id -> list[StudyDependency]
        self._contradictions: dict[str, dict[str, ContradictionRecord]] = {}  # project_id -> {contradiction_id: record}
        self._gaps: dict[str, dict[str, EvidenceGap]] = {}  # project_id -> {gap_id: gap}
        self._agendas: dict[str, ResearchAgenda] = {}  # project_id -> agenda
        self._campaigns: dict[str, ResearchCampaign] = {}  # campaign_id -> campaign

    # ── Cross-Hypothesis Evidence Synthesis ───────────────────────────────────

    def generate_synthesis(self, project_id: str, req: Optional[SynthesisGenerateRequest] = None) -> ResearchSynthesis:
        """Synthesizes evidence, concepts, neurons, contradictions, and gaps across project hypotheses."""
        project = self.hypothesis_svc.get_project(project_id)
        if not project:
            raise KeyError(f"Research project '{project_id}' not found.")

        req = req or SynthesisGenerateRequest()
        all_hyps = self.hypothesis_svc.list_hypotheses(project_id=project_id)

        # Apply filtering
        if req.included_hypothesis_ids:
            target_ids = set(req.included_hypothesis_ids)
            hyps = [h for h in all_hyps if h.hypothesis_id in target_ids]
        else:
            hyps = all_hyps

        if not req.include_archived:
            hyps = [h for h in hyps if h.status != "archived"]

        now = datetime.now(timezone.utc).isoformat()
        synthesis_id = f"synth-{uuid.uuid4().hex[:8]}"

        # 1. Status distribution
        status_dist: dict[str, int] = {}
        for h in hyps:
            status_dist[h.status] = status_dist.get(h.status, 0) + 1

        # 2. Evidence Indexing: Shared vs Independent
        shared_evidence, independent_evidence = self._index_evidence_sources(hyps)

        # 3. Concept Overlap
        shared_concepts, distinct_concepts = self._index_concepts(hyps)

        # 4. Neuronal Candidate Overlap
        shared_cands, distinct_cands = self._index_candidates(hyps)

        # 5. Directed Edge Overlap (strictly directed u -> v)
        shared_edges, distinct_edges = self._index_directed_edges(hyps)

        # 6. Detect / Update Contradictions
        active_contradictions = self._detect_contradictions(project_id, hyps)

        # 7. Analyze / Update Evidence Gaps
        open_gaps = self._analyze_evidence_gaps(project_id, hyps)

        # 8. Count completed studies
        completed_studies_count = sum(
            len([s for s in h.proposed_studies if s.status == "completed"])
            for h in hyps
        )

        # 9. Snapshot inputs manifest
        source_snapshot_ids = [h.hypothesis_id for h in hyps]
        for h in hyps:
            source_snapshot_ids.extend(h.linked_execution_ids)
            source_snapshot_ids.extend(h.linked_robustness_ids)

        manifest = {
            "manifest_version": "1.0.0",
            "schema_version": "1.0.0",
            "synthesis_id": synthesis_id,
            "project_id": project_id,
            "dataset_version": self.data_provider.dataset_version,
            "catalog_version": self.knowledge_svc.catalog_version,
            "ranking_formula_version": "v12.0",
            "snapshot_source_ids": list(set(source_snapshot_ids)),
            "included_hypothesis_count": len(hyps),
            "generated_at": now,
        }

        caveats = [
            "Shared evidence records indicate common provenance and must not be treated as independent experimental replications.",
            "Topological survival in MaleCNS v1.0 EM graph is static and does not establish in vivo physiological firing necessity.",
            "Absence of an edge or path in bounded graph explorations does not imply biological disconnection.",
            "All prioritization rankings represent decision-support heuristics rather than scientific truths.",
        ]

        synth = ResearchSynthesis(
            synthesis_id=synthesis_id,
            project_id=project_id,
            project_title=project.title,
            project_objective=project.objective or "No objective specified",
            generated_at=now,
            is_fresh=True,
            included_hypothesis_ids=[h.hypothesis_id for h in hyps],
            total_hypotheses=len(hyps),
            status_distribution=status_dist,
            shared_evidence_sources=shared_evidence,
            independent_evidence_sources=independent_evidence,
            shared_concepts=shared_concepts,
            distinct_concepts=distinct_concepts,
            shared_candidate_neuron_ids=shared_cands,
            distinct_candidate_neuron_ids=distinct_cands,
            shared_directed_edges=shared_edges,
            distinct_directed_edges=distinct_edges,
            active_contradictions=active_contradictions,
            open_gaps=open_gaps,
            completed_studies_count=completed_studies_count,
            agenda_summary={
                "total_gaps": len(open_gaps),
                "actionable_gaps": len([g for g in open_gaps if g.is_actionable]),
                "active_contradictions": len(active_contradictions),
            },
            manifest=manifest,
            caveats=caveats,
        )

        self._syntheses[project_id] = synth
        logger.info("Generated synthesis %s for project %s with %d hypotheses", synthesis_id, project_id, len(hyps))
        return synth

    def get_synthesis(self, project_id: str) -> Optional[ResearchSynthesis]:
        """Retrieves the latest saved synthesis snapshot for a project."""
        return self._syntheses.get(project_id)

    # ── Evidence Indexing Helper Methods ──────────────────────────────────────

    def _index_evidence_sources(
        self, hypotheses: list[HypothesisRecord]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Groups evidence records by underlying source to separate shared from independent provenance."""
        source_map: dict[str, list[tuple[str, str, str]]] = {}  # source_key -> [(hyp_id, hyp_title, ev_type)]

        for h in hypotheses:
            for ev in h.evidence_records:
                # Determine underlying source key
                source_key = (
                    ev.source_execution_id
                    or ev.source_robustness_id
                    or getattr(ev, "source_doi", None)
                    or getattr(ev, "scientific_doi", None)
                    or f"entity_{ev.body_id}_{ev.edge_pre}_{ev.edge_post}"
                )
                if not source_key:
                    source_key = f"ev_item_{ev.evidence_id}"

                if source_key not in source_map:
                    source_map[source_key] = []
                source_map[source_key].append((h.hypothesis_id, h.title, ev.evidence_type))

        shared_sources: list[dict[str, Any]] = []
        independent_sources: list[dict[str, Any]] = []

        for source_key, references in source_map.items():
            citing_hyps = list({ref[0] for ref in references})
            item = {
                "source_identifier": source_key,
                "citation_count": len(references),
                "citing_hypothesis_ids": citing_hyps,
                "evidence_types": list({ref[2] for ref in references}),
                "is_shared": len(citing_hyps) > 1,
                "is_independent": len(citing_hyps) == 1,
                "scientific_warning": (
                    f"Referenced across {len(citing_hyps)} separate hypotheses; provides common provenance, NOT independent corroboration."
                    if len(citing_hyps) > 1
                    else "Single-hypothesis evidence binding."
                ),
            }
            if len(citing_hyps) > 1:
                shared_sources.append(item)
            else:
                independent_sources.append(item)

        return shared_sources, independent_sources

    def _index_concepts(
        self, hypotheses: list[HypothesisRecord]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Identifies shared and distinct biological concepts across hypotheses."""
        concept_map: dict[str, list[str]] = {}
        for h in hypotheses:
            for cid in h.linked_concept_ids:
                if cid not in concept_map:
                    concept_map[cid] = []
                concept_map[cid].append(h.hypothesis_id)

        shared: list[dict[str, Any]] = []
        distinct: list[dict[str, Any]] = []

        for cid, hyp_ids in concept_map.items():
            concept_obj = self.knowledge_svc.get_concept(cid)
            concept_name = cid
            concept_verified = False
            if concept_obj:
                concept_val = getattr(concept_obj, "concept", concept_obj)
                concept_name = getattr(concept_val, "display_name", getattr(concept_val, "name", cid))
                concept_verified = getattr(concept_val, "evidence_status", "") == "verified"

            info = {
                "concept_id": cid,
                "name": concept_name,
                "display_name": concept_name,
                "verified": concept_verified,
                "citation_count": len(hyp_ids),
                "citing_hypothesis_ids": list(set(hyp_ids)),
                "caveat": "Shared concept label reflects conceptual scope, not proof of identical biological pathway.",
            }
            if len(set(hyp_ids)) > 1:
                shared.append(info)
            else:
                distinct.append(info)

        return shared, distinct

    def _index_candidates(
        self, hypotheses: list[HypothesisRecord]
    ) -> tuple[list[int], list[int]]:
        """Identifies candidate neurons shared across multiple hypotheses vs unique to one."""
        candidate_counts: dict[int, int] = {}
        for h in hypotheses:
            for nid in h.target_neurons:
                candidate_counts[nid] = candidate_counts.get(nid, 0) + 1

        shared = [nid for nid, count in candidate_counts.items() if count > 1]
        distinct = [nid for nid, count in candidate_counts.items() if count == 1]
        return sorted(shared), sorted(distinct)

    def _index_directed_edges(
        self, hypotheses: list[HypothesisRecord]
    ) -> tuple[list[list[int]], list[list[int]]]:
        """Identifies directed connections (u -> v != v -> u) shared vs distinct."""
        edge_counts: dict[tuple[int, int], int] = {}
        for h in hypotheses:
            for edge in h.target_edges:
                t_edge = (edge[0], edge[1])
                edge_counts[t_edge] = edge_counts.get(t_edge, 0) + 1

        shared = [[e[0], e[1]] for e, count in edge_counts.items() if count > 1]
        distinct = [[e[0], e[1]] for e, count in edge_counts.items() if count == 1]
        return shared, distinct

    # ── Contradiction and Inconsistency Detection ─────────────────────────────

    def _detect_contradictions(
        self, project_id: str, hypotheses: list[HypothesisRecord]
    ) -> list[ContradictionRecord]:
        """Scans hypotheses and results for empirical inconsistencies and configuration mismatches."""
        if project_id not in self._contradictions:
            self._contradictions[project_id] = {}

        now = datetime.now(timezone.utc).isoformat()
        detected: dict[str, ContradictionRecord] = {}

        # Check 1: Candidate Stability Inconsistency
        # Hypothesis claims stability, but attached evidence or robustness shows high spread or low inclusion
        for h in hypotheses:
            if h.category == "candidate_stability":
                for ev in h.evidence_records:
                    if ev.metric_name == "rank_spread" and (ev.metric_value or 0) >= 4.0:
                        cid = f"contra-spread-{h.hypothesis_id}"
                        detected[cid] = ContradictionRecord(
                            contradiction_id=cid,
                            project_id=project_id,
                            category=ContradictionSeverity.confirmed_record_mismatch,
                            description=f"Hypothesis '{h.title}' claims topological stability, but recorded rank spread is {ev.metric_value} (>= 4.0).",
                            affected_hypothesis_ids=[h.hypothesis_id],
                            affected_evidence_ids=[ev.evidence_id],
                            detection_rule="candidate_stability_high_rank_spread_check",
                            required_resolution_info="Re-evaluate candidate stability under evidence-prioritized ranking or downgrade hypothesis status.",
                            created_at=now,
                        )
                    if ev.metric_name == "inclusion_fraction" and (ev.metric_value or 0) < 0.70:
                        cid = f"contra-inclusion-{h.hypothesis_id}"
                        detected[cid] = ContradictionRecord(
                            contradiction_id=cid,
                            project_id=project_id,
                            category=ContradictionSeverity.confirmed_record_mismatch,
                            description=f"Hypothesis '{h.title}' asserts core candidate status, but inclusion fraction is only {ev.metric_value*100:.1f}% (< 70%).",
                            affected_hypothesis_ids=[h.hypothesis_id],
                            affected_evidence_ids=[ev.evidence_id],
                            detection_rule="candidate_stability_low_inclusion_check",
                            required_resolution_info="Evaluate whether candidate is parameter-sensitive or specific to a narrow threshold subset.",
                            created_at=now,
                        )

        # Check 2: Conflicting Findings between Multiple Hypotheses targeting same candidate
        # e.g. One hypothesis is 'supported_by_computational_evidence' while another targeting the same neuron is 'contradicted...'
        candidate_hyps: dict[int, list[HypothesisRecord]] = {}
        for h in hypotheses:
            for nid in h.target_neurons:
                if nid not in candidate_hyps:
                    candidate_hyps[nid] = []
                candidate_hyps[nid].append(h)

        for nid, hyps_targeting in candidate_hyps.items():
            statuses = {h.status for h in hyps_targeting}
            if "supported_by_computational_evidence" in statuses and "contradicted_by_computational_evidence" in statuses:
                cid = f"contra-cand-status-{nid}"
                sup_hyps = [h.hypothesis_id for h in hyps_targeting if h.status == "supported_by_computational_evidence"]
                contra_hyps = [h.hypothesis_id for h in hyps_targeting if h.status == "contradicted_by_computational_evidence"]
                detected[cid] = ContradictionRecord(
                    contradiction_id=cid,
                    project_id=project_id,
                    category=ContradictionSeverity.confirmed_record_mismatch,
                    description=f"Neuron #{nid} has conflicting evaluations: supported in {sup_hyps} but contradicted in {contra_hyps}.",
                    affected_hypothesis_ids=list({h.hypothesis_id for h in hyps_targeting}),
                    detection_rule="cross_hypothesis_outcome_divergence_check",
                    required_resolution_info="Compare parameter scopes and testable criteria between the conflicting studies.",
                    created_at=now,
                )

        # Check 3: Incomplete Study Reference in Supported Hypothesis
        for h in hypotheses:
            if h.status == "supported_by_computational_evidence":
                failed_or_pending = [s for s in h.proposed_studies if s.status in ("failed", "pending")]
                if failed_or_pending and not any(s.status == "completed" and s.evaluation_verdict == "criteria_met" for s in h.proposed_studies):
                    cid = f"contra-unsupported-study-{h.hypothesis_id}"
                    detected[cid] = ContradictionRecord(
                        contradiction_id=cid,
                        project_id=project_id,
                        category=ContradictionSeverity.incomplete_result,
                        description=f"Hypothesis '{h.title}' is marked supported, but has zero completed studies satisfying criteria.",
                        affected_hypothesis_ids=[h.hypothesis_id],
                        affected_study_ids=[s.study_id for s in failed_or_pending],
                        detection_rule="supported_status_without_completed_study_check",
                        required_resolution_info="Execute pending studies or revert hypothesis status to 'ready_for_testing'.",
                        created_at=now,
                    )

        # Merge with existing reviews (preserve user's manual review status if previously recorded)
        for cid, record in detected.items():
            if cid in self._contradictions[project_id]:
                existing = self._contradictions[project_id][cid]
                # Preserve existing review resolution
                if existing.review_status != ContradictionReviewStatus.open:
                    record.review_status = existing.review_status
                    record.resolution_rationale = existing.resolution_rationale
                    record.resolved_by = existing.resolved_by
                    record.resolved_at = existing.resolved_at
            self._contradictions[project_id][cid] = record

        return list(self._contradictions[project_id].values())

    def review_contradiction(
        self, project_id: str, contradiction_id: str, req: ContradictionReviewRequest
    ) -> ContradictionRecord:
        """Records a researcher's classification and resolution rationale for a flagged contradiction."""
        proj_dict = self._contradictions.get(project_id, {})
        if contradiction_id not in proj_dict:
            raise KeyError(f"Contradiction '{contradiction_id}' not found in project '{project_id}'.")

        record = proj_dict[contradiction_id]
        record.review_status = req.review_status
        record.resolution_rationale = req.resolution_rationale.strip()
        record.resolved_by = req.resolved_by or "researcher"
        record.resolved_at = datetime.now(timezone.utc).isoformat()

        logger.info("Reviewed contradiction %s: status=%s", contradiction_id, req.review_status)
        return record

    # ── Evidence Gap Analysis ─────────────────────────────────────────────────

    def _analyze_evidence_gaps(
        self, project_id: str, hypotheses: list[HypothesisRecord]
    ) -> list[EvidenceGap]:
        """Identifies uninvestigated gaps, missing evidence links, and unverified interpretations."""
        if project_id not in self._gaps:
            self._gaps[project_id] = {}

        now = datetime.now(timezone.utc).isoformat()
        detected: dict[str, EvidenceGap] = {}

        for h in hypotheses:
            # Gap 1: Missing Source Evidence
            if not h.evidence_records:
                gid = f"gap-no-ev-{h.hypothesis_id}"
                detected[gid] = EvidenceGap(
                    gap_id=gid,
                    project_id=project_id,
                    category=GapCategory.missing_source_evidence,
                    description=f"Hypothesis '{h.title}' has no attached empirical or literature evidence records.",
                    affected_hypothesis_ids=[h.hypothesis_id],
                    detection_rule="hypothesis_zero_evidence_check",
                    priority_score=0.85,
                    required_information="Attach supporting investigation executions, robustness runs, or literature citations.",
                    is_actionable=True,
                    suggested_action_type="inspect_mappings",
                    suggested_action_description="Scan knowledge catalog mappings or run baseline circuit discovery.",
                    created_at=now,
                )

            # Gap 2: Missing Robustness Evaluation for Stability Claims
            if h.category in ("candidate_stability", "rank_sensitivity") and not h.linked_robustness_ids:
                gid = f"gap-no-rob-{h.hypothesis_id}"
                exec_id = h.linked_execution_ids[0] if h.linked_execution_ids else None
                detected[gid] = EvidenceGap(
                    gap_id=gid,
                    project_id=project_id,
                    category=GapCategory.missing_robustness_evaluation,
                    description=f"Hypothesis '{h.title}' asserts topological stability, but lacks a linked parameter sweep.",
                    affected_hypothesis_ids=[h.hypothesis_id],
                    source_records_inspected=h.linked_execution_ids,
                    detection_rule="stability_claim_lacks_robustness_check",
                    priority_score=0.90,
                    required_information="Run a bounded sensitivity sweep across synaptic thresholds (weights 1, 5, 10).",
                    is_actionable=bool(exec_id),
                    suggested_action_type="run_robustness" if exec_id else "circuit_discovery",
                    suggested_action_description=f"Execute one-factor robustness sweep on baseline execution {exec_id or 'baseline'}.",
                    suggested_study_parameters={"baseline_execution_id": exec_id} if exec_id else None,
                    created_at=now,
                )

            # Gap 3: Insufficient Structural Evidence (target edge without direct verification)
            if h.target_edges and not any(e.evidence_type in ("edge_survival", "direct_synapse") for e in h.evidence_records):
                gid = f"gap-struct-edge-{h.hypothesis_id}"
                first_edge = h.target_edges[0]
                detected[gid] = EvidenceGap(
                    gap_id=gid,
                    project_id=project_id,
                    category=GapCategory.insufficient_structural_evidence,
                    description=f"Hypothesis '{h.title}' targets directed connection #{first_edge[0]} → #{first_edge[1]} without direct synaptic proof.",
                    affected_hypothesis_ids=[h.hypothesis_id],
                    detection_rule="targeted_edge_lacks_direct_verification_check",
                    priority_score=0.75,
                    required_information="Verify physical synaptic connection weight in MaleCNS v1.0.",
                    is_actionable=True,
                    suggested_action_type="pathway_search",
                    suggested_action_description=f"Search direct 1-to-2 hop pathways from #{first_edge[0]} to #{first_edge[1]}.",
                    suggested_study_parameters={"source_id": first_edge[0], "target_id": first_edge[1], "max_hops": 2},
                    created_at=now,
                )

            # Gap 4: Incomplete Follow-Up Studies
            pending_studies = [s for s in h.proposed_studies if s.status == "pending"]
            if pending_studies:
                gid = f"gap-pending-study-{h.hypothesis_id}"
                detected[gid] = EvidenceGap(
                    gap_id=gid,
                    project_id=project_id,
                    category=GapCategory.incomplete_followup_study,
                    description=f"Hypothesis '{h.title}' has {len(pending_studies)} planned study(ies) waiting for execution.",
                    affected_hypothesis_ids=[h.hypothesis_id],
                    affected_claim_or_evidence_ids=[s.study_id for s in pending_studies],
                    detection_rule="pending_followup_studies_check",
                    priority_score=0.80,
                    required_information="Execute planned studies and evaluate outcomes against predefined testable criteria.",
                    is_actionable=True,
                    suggested_action_type="execute_study",
                    suggested_action_description=f"Execute study '{pending_studies[0].title}'.",
                    created_at=now,
                )

            # Gap 5: Unverified Interpretation (No alternative explanations accounted for)
            if not h.alternative_explanations:
                gid = f"gap-no-alt-{h.hypothesis_id}"
                detected[gid] = EvidenceGap(
                    gap_id=gid,
                    project_id=project_id,
                    category=GapCategory.unverified_interpretation,
                    description=f"Hypothesis '{h.title}' has no confounding factors (e.g. degree bias, threshold artifacts) documented.",
                    affected_hypothesis_ids=[h.hypothesis_id],
                    detection_rule="missing_alternative_explanations_check",
                    priority_score=0.60,
                    required_information="Document degree bias, threshold artifacts, or gap junction limitations.",
                    is_actionable=True,
                    suggested_action_type="manual_curation",
                    suggested_action_description="Log plausible confounders in the Alternative Explanations ledger.",
                    created_at=now,
                )

        # Merge with existing gap state (preserve user resolution)
        for gid, gap in detected.items():
            if gid in self._gaps[project_id]:
                existing = self._gaps[project_id][gid]
                if existing.status != GapStatus.open:
                    gap.status = existing.status
                    gap.resolution_notes = existing.resolution_notes
                    gap.resolved_at = existing.resolved_at
            self._gaps[project_id][gid] = gap

        return list(self._gaps[project_id].values())

    def update_gap(self, project_id: str, gap_id: str, req: GapUpdateRequest) -> EvidenceGap:
        """Updates the status and resolution rationale of an evidence gap."""
        proj_gaps = self._gaps.get(project_id, {})
        if gap_id not in proj_gaps:
            raise KeyError(f"Evidence gap '{gap_id}' not found in project '{project_id}'.")

        gap = proj_gaps[gap_id]
        gap.status = req.status
        gap.resolution_notes = req.resolution_notes
        if req.status == GapStatus.resolved:
            gap.resolved_at = datetime.now(timezone.utc).isoformat()
        else:
            gap.resolved_at = None

        logger.info("Updated gap %s: status=%s", gap_id, req.status)
        return gap

    # ── Research Agenda & Study Prioritization ────────────────────────────────

    def generate_agenda(self, project_id: str, req: Optional[AgendaGenerateRequest] = None) -> ResearchAgenda:
        """Generates a ranked, dependency-aware agenda of follow-up investigations using transparent criteria."""
        project = self.hypothesis_svc.get_project(project_id)
        if not project:
            raise KeyError(f"Research project '{project_id}' not found.")

        req = req or AgendaGenerateRequest()
        hyps = self.hypothesis_svc.list_hypotheses(project_id=project_id)
        if req.included_hypothesis_ids:
            hyps = [h for h in hyps if h.hypothesis_id in set(req.included_hypothesis_ids)]

        gaps = [g for g in self._analyze_evidence_gaps(project_id, hyps) if g.status == GapStatus.open and g.is_actionable]
        now = datetime.now(timezone.utc).isoformat()
        agenda_id = f"agenda-{uuid.uuid4().hex[:8]}"

        weights = {
            "gap_importance": req.weight_gap_importance,
            "hypothesis_coverage": req.weight_hypothesis_coverage,
            "uncertainty_reduction": req.weight_uncertainty_reduction,
            "feasibility": req.weight_feasibility,
            "cost_penalty": req.weight_cost_penalty,
        }

        # Normalize weights to sum to 1.0
        total_w = sum(weights.values()) or 1.0
        weights = {k: v / total_w for k, v in weights.items()}

        recommendations: list[ResearchActionRecommendation] = []

        # Action 1: Robustness sweeps for stability gaps
        rob_gaps = [g for g in gaps if g.category == GapCategory.missing_robustness_evaluation]
        for g in rob_gaps:
            hyp_ids = g.affected_hypothesis_ids
            exec_id = g.suggested_study_parameters.get("baseline_execution_id") if g.suggested_study_parameters else None
            if exec_id:
                aid = f"rec-rob-{g.gap_id}"
                # Factors (bounded 0.0 - 1.0)
                f_gap = g.priority_score
                f_hyp = min(len(hyp_ids) / 3.0, 1.0)
                f_unc = 0.85
                f_feas = 1.0  # Robustness lab is fully functional
                f_cost = 0.30  # Low cost (3-4 scenarios)

                p_score = (
                    weights["gap_importance"] * f_gap
                    + weights["hypothesis_coverage"] * f_hyp
                    + weights["uncertainty_reduction"] * f_unc
                    + weights["feasibility"] * f_feas
                    - weights["cost_penalty"] * f_cost
                )
                p_score = round(max(0.05, min(1.0, p_score)), 3)

                recommendations.append(
                    ResearchActionRecommendation(
                        action_id=aid,
                        project_id=project_id,
                        action_type="robustness_sweep",
                        title=f"Execute Robustness Sensitivity Sweep on Baseline {exec_id}",
                        description=f"Evaluates candidate inclusion stability across weight thresholds (1, 5, 10) for {len(hyp_ids)} hypothesis(es).",
                        target_tool="robustness_lab",
                        target_hypothesis_ids=hyp_ids,
                        addressed_gap_ids=[g.gap_id],
                        suggested_parameters={
                            "baseline_execution_id": exec_id,
                            "strategy": "one_factor",
                            "min_edge_weights": [1, 5, 10],
                        },
                        expected_outputs="Inclusion fractions I(v), rank variability spread, directed edge survival.",
                        scientific_limitations="Evaluates computational parameter sensitivity; does not measure biological variability.",
                        estimated_cost_label="low",
                        cost_factors={"scenarios": 3, "estimated_duration_sec": 0.5},
                        priority_score=p_score,
                        priority_breakdown={
                            "gap_importance": f_gap,
                            "hypothesis_coverage": f_hyp,
                            "uncertainty_reduction": f_unc,
                            "feasibility": f_feas,
                            "cost_penalty": f_cost,
                        },
                        is_ready=True,
                    )
                )

        # Action 2: Pathway search for structural connection gaps
        struct_gaps = [g for g in gaps if g.category == GapCategory.insufficient_structural_evidence]
        for g in struct_gaps:
            params = g.suggested_study_parameters or {}
            src = params.get("source_id")
            tgt = params.get("target_id")
            if src and tgt:
                aid = f"rec-path-{g.gap_id}"
                f_gap = g.priority_score
                f_hyp = min(len(g.affected_hypothesis_ids) / 3.0, 1.0)
                f_unc = 0.80
                f_feas = 1.0
                f_cost = 0.15

                p_score = (
                    weights["gap_importance"] * f_gap
                    + weights["hypothesis_coverage"] * f_hyp
                    + weights["uncertainty_reduction"] * f_unc
                    + weights["feasibility"] * f_feas
                    - weights["cost_penalty"] * f_cost
                )
                p_score = round(max(0.05, min(1.0, p_score)), 3)

                recommendations.append(
                    ResearchActionRecommendation(
                        action_id=aid,
                        project_id=project_id,
                        action_type="pathway_search",
                        title=f"Trace Synaptic Route from #{src} to #{tgt}",
                        description=f"Verifies directed structural path continuity and synaptic weights up to {params.get('max_hops', 2)} hops.",
                        target_tool="pathway_tracer",
                        target_hypothesis_ids=g.affected_hypothesis_ids,
                        addressed_gap_ids=[g.gap_id],
                        suggested_parameters={"source_id": src, "target_id": tgt, "max_hops": params.get("max_hops", 2)},
                        expected_outputs="Directed route list, cumulative weights, hop distances.",
                        scientific_limitations="Identifies structural anatomical continuity; does not simulate action potential conduction.",
                        estimated_cost_label="low",
                        cost_factors={"max_hops": params.get("max_hops", 2), "estimated_duration_sec": 0.1},
                        priority_score=p_score,
                        priority_breakdown={
                            "gap_importance": f_gap,
                            "hypothesis_coverage": f_hyp,
                            "uncertainty_reduction": f_unc,
                            "feasibility": f_feas,
                            "cost_penalty": f_cost,
                        },
                        is_ready=True,
                    )
                )

        # Action 3: Execute registered pending studies
        pending_gaps = [g for g in gaps if g.category == GapCategory.incomplete_followup_study]
        for g in pending_gaps:
            for hid in g.affected_hypothesis_ids:
                hyp = self.hypothesis_svc.get_hypothesis(hid)
                if not hyp:
                    continue
                for st in hyp.proposed_studies:
                    if st.status == "pending":
                        aid = f"rec-study-{st.study_id}"
                        f_gap = g.priority_score
                        f_hyp = 0.5
                        f_unc = 0.70
                        f_feas = 1.0
                        f_cost = 0.20

                        p_score = (
                            weights["gap_importance"] * f_gap
                            + weights["hypothesis_coverage"] * f_hyp
                            + weights["uncertainty_reduction"] * f_unc
                            + weights["feasibility"] * f_feas
                            - weights["cost_penalty"] * f_cost
                        )
                        p_score = round(max(0.05, min(1.0, p_score)), 3)

                        recommendations.append(
                            ResearchActionRecommendation(
                                action_id=aid,
                                project_id=project_id,
                                action_type=st.analysis_type,
                                title=f"Execute Planned Study: {st.title}",
                                description=f"Evaluates criteria for hypothesis '{hyp.title}' against null outcome '{st.expected_null_outcome}'.",
                                target_tool=st.analysis_type,
                                target_hypothesis_ids=[hid],
                                addressed_gap_ids=[g.gap_id],
                                suggested_parameters=st.parameters or {},
                                expected_outputs=f"Evaluation verdict for criteria: {st.testable_criteria}",
                                scientific_limitations="Automated computational test of predefined criteria.",
                                estimated_cost_label="low",
                                cost_factors={"estimated_duration_sec": 0.2},
                                priority_score=p_score,
                                priority_breakdown={
                                    "gap_importance": f_gap,
                                    "hypothesis_coverage": f_hyp,
                                    "uncertainty_reduction": f_unc,
                                    "feasibility": f_feas,
                                    "cost_penalty": f_cost,
                                },
                                is_ready=True,
                            )
                        )

        # Sort recommendations by descending priority score
        recommendations.sort(key=lambda r: r.priority_score, reverse=True)

        agenda = ResearchAgenda(
            agenda_id=agenda_id,
            project_id=project_id,
            created_at=now,
            priority_weights=weights,
            recommended_actions=recommendations,
            total_actions=len(recommendations),
            ready_actions=len([r for r in recommendations if r.is_ready]),
            blocked_actions=len([r for r in recommendations if not r.is_ready]),
        )

        self._agendas[project_id] = agenda
        logger.info("Generated research agenda %s with %d recommendations", agenda_id, len(recommendations))
        return agenda

    def get_agenda(self, project_id: str) -> Optional[ResearchAgenda]:
        """Retrieves the latest generated research agenda for a project."""
        return self._agendas.get(project_id)

    # ── Study Dependencies & DAG Validation ───────────────────────────────────

    def create_dependency(self, project_id: str, req: DependencyCreateRequest) -> StudyDependency:
        """Registers a directed prerequisite relationship between two studies."""
        if req.study_id == req.prerequisite_study_id:
            raise ValueError("Self-dependency is invalid: a study cannot depend on itself.")

        if project_id not in self._dependencies:
            self._dependencies[project_id] = []

        now = datetime.now(timezone.utc).isoformat()
        dep = StudyDependency(
            dependency_id=f"dep-{uuid.uuid4().hex[:8]}",
            study_id=req.study_id,
            prerequisite_study_id=req.prerequisite_study_id,
            dependency_type=req.dependency_type,
            description=req.description or "",
            is_satisfied=False,
            created_at=now,
        )

        # Validate cycle creation
        existing_deps = self._dependencies[project_id] + [dep]
        if self._has_cycle(existing_deps):
            raise ValueError(f"Cycle detected: adding dependency {req.study_id} -> {req.prerequisite_study_id} creates a circular dependency.")

        self._dependencies[project_id].append(dep)
        logger.info("Created study dependency %s in project %s", dep.dependency_id, project_id)
        return dep

    def list_dependencies(self, project_id: str) -> list[StudyDependency]:
        """Lists all registered study dependencies for a project."""
        return self._dependencies.get(project_id, [])

    def delete_dependency(self, project_id: str, dependency_id: str) -> bool:
        """Removes a registered study dependency."""
        deps = self._dependencies.get(project_id, [])
        initial_len = len(deps)
        self._dependencies[project_id] = [d for d in deps if d.dependency_id != dependency_id]
        return len(self._dependencies[project_id]) < initial_len

    def _has_cycle(self, dependencies: list[StudyDependency]) -> bool:
        """Checks if a set of dependencies contains a directed cycle (using DFS)."""
        adj: dict[str, list[str]] = {}
        all_nodes: set[str] = set()

        for d in dependencies:
            if d.dependency_type == StudyDependencyType.required_prerequisite:
                # Edge: prerequisite -> dependent
                adj.setdefault(d.prerequisite_study_id, []).append(d.study_id)
                all_nodes.add(d.prerequisite_study_id)
                all_nodes.add(d.study_id)

        visited: dict[str, int] = {}  # 0: unvisited, 1: visiting, 2: visited

        def dfs(node: str) -> bool:
            visited[node] = 1
            for neighbor in adj.get(node, []):
                if visited.get(neighbor) == 1:
                    return True
                if visited.get(neighbor) != 2:
                    if dfs(neighbor):
                        return True
            visited[node] = 2
            return False

        for node in all_nodes:
            if visited.get(node, 0) == 0:
                if dfs(node):
                    return True
        return False

    def validate_dependency_graph(
        self, project_id: str, study_ids: list[str]
    ) -> tuple[list[str], list[str], dict[str, list[str]]]:
        """Validates acyclicity and returns (topological_order, blocked_study_ids, blocking_reasons)."""
        deps = self._dependencies.get(project_id, [])
        relevant_deps = [
            d for d in deps
            if d.study_id in study_ids and d.prerequisite_study_id in study_ids and d.dependency_type == StudyDependencyType.required_prerequisite
        ]

        if self._has_cycle(relevant_deps):
            raise ValueError("Dependency graph contains a directed cycle; valid execution order impossible.")

        # Compute in-degrees for topological sort (prerequisite -> dependent)
        in_degree: dict[str, int] = {sid: 0 for sid in study_ids}
        adj: dict[str, list[str]] = {sid: [] for sid in study_ids}

        for d in relevant_deps:
            adj[d.prerequisite_study_id].append(d.study_id)
            in_degree[d.study_id] = in_degree.get(d.study_id, 0) + 1

        # Kahn's algorithm
        queue = [sid for sid in study_ids if in_degree[sid] == 0]
        order: list[str] = []

        while queue:
            curr = queue.pop(0)
            order.append(curr)
            for neighbor in adj.get(curr, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        # Check for blocked studies and reasons
        blocked: list[str] = []
        reasons: dict[str, list[str]] = {}

        # Look for prerequisite completion
        study_map = self._get_studies_map(project_id)
        for d in relevant_deps:
            prereq = study_map.get(d.prerequisite_study_id)
            if not prereq or prereq.status != "completed":
                if d.study_id not in blocked:
                    blocked.append(d.study_id)
                reasons.setdefault(d.study_id, []).append(
                    f"Prerequisite study '{d.prerequisite_study_id}' is not completed (status: {prereq.status if prereq else 'unknown'})."
                )

        return order, blocked, reasons

    def _get_studies_map(self, project_id: str) -> dict[str, Any]:
        """Internal helper to retrieve all studies in a project mapped by study_id."""
        hyps = self.hypothesis_svc.list_hypotheses(project_id=project_id)
        s_map: dict[str, Any] = {}
        for h in hyps:
            for s in h.proposed_studies:
                s_map[s.study_id] = s
        return s_map

    # ── Controlled Multi-Study Campaigns ──────────────────────────────────────

    def preview_campaign(self, project_id: str, study_ids: list[str]) -> CampaignPreviewResponse:
        """Generates a pre-flight execution preview with dependency ordering, validation, and cost limits."""
        project = self.hypothesis_svc.get_project(project_id)
        if not project:
            raise KeyError(f"Project '{project_id}' not found.")

        study_map = self._get_studies_map(project_id)
        valid_study_ids = [sid for sid in study_ids if sid in study_map]
        warnings: list[str] = []

        if len(valid_study_ids) < len(study_ids):
            warnings.append(f"{len(study_ids) - len(valid_study_ids)} requested study ID(s) were not found in project.")

        try:
            order, blocked_ids, blocking_reasons = self.validate_dependency_graph(project_id, valid_study_ids)
        except ValueError as e:
            return CampaignPreviewResponse(
                project_id=project_id,
                selected_study_ids=valid_study_ids,
                ordered_studies=[],
                total_studies=len(valid_study_ids),
                ready_studies=0,
                blocked_studies=len(valid_study_ids),
                warnings=[f"Dependency validation failed: {str(e)}"],
                can_execute=False,
            )

        study_plans: list[CampaignStudyPlan] = []
        est_scenarios = 0

        for idx, sid in enumerate(order):
            st = study_map[sid]
            is_blocked = sid in blocked_ids
            b_reasons = blocking_reasons.get(sid, [])
            if st.analysis_type == "robustness_sweep":
                est_scenarios += 3
            else:
                est_scenarios += 1

            study_plans.append(
                CampaignStudyPlan(
                    study_id=st.study_id,
                    hypothesis_id=st.hypothesis_id,
                    title=st.title,
                    analysis_type=st.analysis_type,
                    parameters=st.parameters or {},
                    prerequisites=st.prerequisites or [],
                    execution_order_index=idx,
                    is_ready=not is_blocked,
                    blocking_reasons=b_reasons,
                )
            )

        ready_count = len([s for s in study_plans if s.is_ready])
        blocked_count = len(study_plans) - ready_count

        return CampaignPreviewResponse(
            project_id=project_id,
            selected_study_ids=valid_study_ids,
            ordered_studies=study_plans,
            total_studies=len(study_plans),
            ready_studies=ready_count,
            blocked_studies=blocked_count,
            estimated_scenarios=est_scenarios,
            estimated_resource_summary={
                "total_studies": len(study_plans),
                "robustness_scenarios": est_scenarios,
                "concurrency": "sequential",
                "estimated_runtime_seconds": round(len(study_plans) * 0.25, 2),
            },
            warnings=warnings,
            can_execute=ready_count > 0,
        )

    async def execute_campaign(self, project_id: str, req: CampaignCreateRequest) -> ResearchCampaign:
        """Executes a confirmed multi-study campaign with dependency ordering and failure isolation."""
        preview = self.preview_campaign(project_id, req.study_ids)
        if not preview.can_execute:
            raise ValueError(f"Campaign cannot execute: {preview.warnings}")

        campaign_id = f"camp-{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        results: list[CampaignStudyResult] = []
        study_map = self._get_studies_map(project_id)

        failed_studies: set[str] = set()
        skipped_studies: set[str] = set()

        deps = self._dependencies.get(project_id, [])

        logger.info("Starting execution of campaign %s (%d studies)", campaign_id, len(preview.ordered_studies))

        for plan in preview.ordered_studies:
            sid = plan.study_id
            st = study_map[sid]

            # Check if any required prerequisite failed or was skipped
            prereq_deps = [
                d.prerequisite_study_id for d in deps
                if d.study_id == sid and d.dependency_type == StudyDependencyType.required_prerequisite
            ]
            has_failed_prereq = any(p in failed_studies or p in skipped_studies for p in prereq_deps)

            if has_failed_prereq:
                skipped_studies.add(sid)
                results.append(
                    CampaignStudyResult(
                        study_id=sid,
                        hypothesis_id=st.hypothesis_id,
                        status="skipped",
                        error_message="Skipped due to failed or skipped prerequisite study.",
                    )
                )
                continue

            # Execute the study through HypothesisService
            exec_req = StudyExecuteRequest(override_parameters=st.parameters or {})
            start_t = datetime.now()
            try:
                eval_res = await self.hypothesis_svc.execute_study(st.hypothesis_id, sid, exec_req)
                dur = (datetime.now() - start_t).total_seconds() * 1000.0

                results.append(
                    CampaignStudyResult(
                        study_id=sid,
                        hypothesis_id=st.hypothesis_id,
                        execution_id=eval_res.execution_id,
                        status="completed",
                        verdict=eval_res.verdict,
                        evaluation_summary=eval_res.summary,
                        duration_ms=round(dur, 2),
                    )
                )

                if eval_res.verdict != "criteria_met" and req.stop_on_first_failure:
                    failed_studies.add(sid)
                    break

            except Exception as e:
                dur = (datetime.now() - start_t).total_seconds() * 1000.0
                failed_studies.add(sid)
                logger.error("Study %s failed in campaign %s: %s", sid, campaign_id, str(e))
                results.append(
                    CampaignStudyResult(
                        study_id=sid,
                        hypothesis_id=st.hypothesis_id,
                        status="failed",
                        error_message=str(e),
                        duration_ms=round(dur, 2),
                    )
                )
                if req.stop_on_first_failure:
                    break

        completion_now = datetime.now(timezone.utc).isoformat()
        comp_count = len([r for r in results if r.status == "completed"])
        fail_count = len([r for r in results if r.status == "failed"])
        skip_count = len([r for r in results if r.status == "skipped"])

        final_status = "completed"
        if fail_count > 0 and comp_count > 0:
            final_status = "partially_completed"
        elif fail_count > 0 and comp_count == 0:
            final_status = "failed"

        summary = f"Executed {len(results)} of {len(preview.ordered_studies)} studies: {comp_count} completed, {fail_count} failed, {skip_count} skipped."

        campaign = ResearchCampaign(
            campaign_id=campaign_id,
            project_id=project_id,
            status=final_status,
            selected_study_ids=req.study_ids,
            execution_order=[s.study_id for s in preview.ordered_studies],
            study_results=results,
            total_studies=len(preview.ordered_studies),
            completed_count=comp_count,
            failed_count=fail_count,
            skipped_count=skip_count,
            start_time=now,
            completion_time=completion_now,
            summary=summary,
        )

        self._campaigns[campaign_id] = campaign
        logger.info("Campaign %s finished with status: %s", campaign_id, final_status)
        return campaign

    def get_campaign(self, campaign_id: str) -> Optional[ResearchCampaign]:
        """Retrieves a completed or in-progress research campaign record."""
        return self._campaigns.get(campaign_id)

    # ── Multi-Format Synthesis Exports ────────────────────────────────────────

    def generate_synthesis_markdown(self, project_id: str) -> str:
        """Produces a comprehensive human-readable Markdown research report for the project."""
        synth = self._syntheses.get(project_id) or self.generate_synthesis(project_id)

        lines = [
            f"# Research Program Synthesis Report: {synth.project_title}",
            "",
            f"**Project ID:** `{synth.project_id}`  ",
            f"**Synthesis ID:** `{synth.synthesis_id}`  ",
            f"**Dataset Version:** `{synth.manifest.get('dataset_version', 'male-cns:v1.0')}`  ",
            f"**Catalog Version:** `{synth.manifest.get('catalog_version', '1.0.0')}`  ",
            f"**Generated At:** {synth.generated_at}  ",
            "",
            "## 1. Project Objective & Scope",
            "",
            f"> {synth.project_objective}",
            "",
            f"- **Included Hypotheses:** {synth.total_hypotheses}",
            f"- **Completed Studies:** {synth.completed_studies_count}",
            f"- **Status Breakdown:** {', '.join(f'{k}: {v}' for k, v in synth.status_distribution.items())}",
            "",
            "## 2. Cross-Hypothesis Evidence Synthesis",
            "",
            f"### Shared Evidence Sources ({len(synth.shared_evidence_sources)})",
            "",
        ]

        if synth.shared_evidence_sources:
            for s in synth.shared_evidence_sources:
                lines.append(f"- **Source:** `{s['source_identifier']}` (Cited by {s['citation_count']} hypotheses: {', '.join(s['citing_hypothesis_ids'])})")
                lines.append(f"  *Warning: {s['scientific_warning']}*")
        else:
            lines.append("*No shared evidence sources detected across hypotheses.*")

        lines.extend([
            "",
            f"### Independent Evidence Sources ({len(synth.independent_evidence_sources)})",
            "",
        ])
        if synth.independent_evidence_sources:
            for s in synth.independent_evidence_sources[:10]:
                lines.append(f"- `{s['source_identifier']}` -> {s['citing_hypothesis_ids'][0]}")
            if len(synth.independent_evidence_sources) > 10:
                lines.append(f"*(and {len(synth.independent_evidence_sources) - 10} additional independent records)*")
        else:
            lines.append("*No independent evidence records logged.*")

        lines.extend([
            "",
            "## 3. Biological Concepts & Neuronal Entity Overlap",
            "",
            f"- **Shared Biological Concepts:** {', '.join(c['name'] for c in synth.shared_concepts) if synth.shared_concepts else 'None'}",
            f"- **Shared Candidate Neurons:** {', '.join(f'#{n}' for n in synth.shared_candidate_neuron_ids) if synth.shared_candidate_neuron_ids else 'None'}",
            f"- **Shared Directed Edges:** {', '.join(f'#{e[0]} → #{e[1]}' for e in synth.shared_directed_edges) if synth.shared_directed_edges else 'None'}",
            "",
            "## 4. Contradiction & Inconsistency Review Queue",
            "",
        ])

        if synth.active_contradictions:
            for c in synth.active_contradictions:
                lines.append(f"### Inconsistency: `{c.contradiction_id}` [{c.category.value}]")
                lines.append(f"- **Description:** {c.description}")
                lines.append(f"- **Affected Hypotheses:** {', '.join(c.affected_hypothesis_ids)}")
                lines.append(f"- **Review Status:** `{c.review_status.value}`")
                if c.resolution_rationale:
                    lines.append(f"- **Resolution Rationale:** {c.resolution_rationale}")
                lines.append("")
        else:
            lines.append("*No active empirical contradictions or mismatches detected.*")
            lines.append("")

        lines.extend([
            "## 5. Evidence Gap Analysis & Open Items",
            "",
        ])
        if synth.open_gaps:
            for g in synth.open_gaps:
                lines.append(f"- **[{g.category.value.upper()}]** {g.description} *(Actionable: {g.is_actionable}, Priority: {g.priority_score})*")
        else:
            lines.append("*Zero open evidence gaps logged.*")

        lines.extend([
            "",
            "## 6. Scientific Limitations & Disclosure",
            "",
        ])
        for cav in synth.caveats:
            lines.append(f"- {cav}")

        return "\n".join(lines)

    def generate_synthesis_csv(self, project_id: str, table_type: str = "gaps") -> str:
        """Generates structured CSV data for evidence gaps, contradiction records, or study priorities."""
        out = io.StringIO()
        writer = csv.writer(out)

        if table_type == "gaps":
            gaps = list(self._gaps.get(project_id, {}).values())
            writer.writerow(["gap_id", "category", "description", "priority_score", "is_actionable", "status", "created_at"])
            for g in gaps:
                writer.writerow([g.gap_id, g.category.value, g.description, g.priority_score, g.is_actionable, g.status.value, g.created_at])

        elif table_type == "contradictions":
            contras = list(self._contradictions.get(project_id, {}).values())
            writer.writerow(["contradiction_id", "category", "description", "review_status", "resolved_by", "created_at"])
            for c in contras:
                writer.writerow([c.contradiction_id, c.category.value, c.description, c.review_status.value, c.resolved_by or "", c.created_at])

        elif table_type == "agenda":
            agenda = self._agendas.get(project_id)
            writer.writerow(["action_id", "title", "action_type", "target_tool", "priority_score", "is_ready", "estimated_cost"])
            if agenda:
                for a in agenda.recommended_actions:
                    writer.writerow([a.action_id, a.title, a.action_type, a.target_tool, a.priority_score, a.is_ready, a.estimated_cost_label])

        elif table_type == "campaigns":
            camps = [c for c in self._campaigns.values() if c.project_id == project_id]
            writer.writerow(["campaign_id", "status", "total_studies", "completed", "failed", "skipped", "start_time"])
            for cp in camps:
                writer.writerow([cp.campaign_id, cp.status, cp.total_studies, cp.completed_count, cp.failed_count, cp.skipped_count, cp.start_time])

        else:
            raise ValueError(f"Unknown table type '{table_type}'. Supported: 'gaps', 'contradictions', 'agenda', 'campaigns'.")

        return out.getvalue()
