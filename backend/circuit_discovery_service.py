"""
BrainDebugger — NeuroQuery Circuit Discovery Execution Engine (V8)

Executes validated NeuroQuery investigation plans against real MaleCNS v1.0 data.
Discovers evidence-supported candidate neurons, extracts bounded directed subgraphs,
calculates structural graph metrics, ranks candidates transparently using dual criteria
(evidence tier + in-circuit synaptic connectivity), and coordinates with existing
BrainDebugger investigation modules (Inspector, Pathway Tracer, Perturbation Lab).

Strict Scientific Boundaries:
• All nodes, directed edges, and synaptic weights come directly from Janelia MaleCNS v1.0.
• No synthetic neurons, artificial connections, or fabricated literature citations.
• Structural subgraphs represent anatomical connectivity, not live physiological firing dynamics.
• Traced-only connection weights limitation is explicitly surfaced on all results.
"""

from __future__ import annotations

import collections
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.config import Settings
from backend.data_provider import LocalFeatherProvider
from backend.knowledge_service import KnowledgeService
from backend.models import (
    BiologicalConcept,
    CandidateComparisonSummary,
    CandidateRankDelta,
    CircuitComparisonRequest,
    CircuitComparisonResult,
    CircuitDiscoveryResult,
    CircuitStructuralMetrics,
    CircuitSubgraphEdge,
    CircuitSubgraphExpansionRequest,
    CircuitSubgraphExpansionResponse,
    CircuitSubgraphNode,
    DiscoveredCandidateNeuron,
    EdgeWeightDelta,
    EvidenceComparisonSummary,
    EvidenceSource,
    ExecutionStatus,
    GraphComparisonSummary,
    IntentType,
    InvestigationComparisonQueryInfo,
    InvestigationExecutionRecord,
    InvestigationExecutionRequest,
    InvestigationPlan,
    PlanSupportStatus,
)
from backend.perturbation_service import PerturbationService
from backend.query_planner_service import QueryPlannerService
from backend.service import ConnectomeService

logger = logging.getLogger("backend.circuit_discovery_service")


class CircuitDiscoveryService:
    """
    Controlled execution service for NeuroQuery investigation plans.
    Translates validated plans into allowlisted operations on real connectome data.
    """

    ALLOWED_OPERATIONS = {
        "op-concept-mapping",
        "op-subgraph-expansion",
        "op-circuit-ranking",
        "op-neuron-profile",
        "op-connectivity-summary",
        "op-pathway-tracer",
        "op-downstream-cascade",
        "op-perturbation-simulation",
    }

    def __init__(
        self,
        knowledge_service: KnowledgeService,
        data_provider: LocalFeatherProvider,
        connectome_service: ConnectomeService,
        perturbation_service: Optional[PerturbationService] = None,
        query_planner_service: Optional[QueryPlannerService] = None,
        settings: Optional[Settings] = None,
    ) -> None:
        self.knowledge_service = knowledge_service
        self.data_provider = data_provider
        self.connectome_service = connectome_service
        self.perturbation_service = perturbation_service or PerturbationService(data_provider)
        self.query_planner_service = query_planner_service
        self.settings = settings

        # In-memory execution store for session tracking
        self._executions: dict[str, InvestigationExecutionRecord] = {}

    def get_execution(self, execution_id: str) -> Optional[InvestigationExecutionRecord]:
        """Retrieves a previously executed investigation record by ID."""
        return self._executions.get(execution_id)

    def execute_plan(self, req: InvestigationExecutionRequest) -> CircuitDiscoveryResult:
        """
        Main execution entry point:
        1. Validates the plan against current schema and catalog.
        2. Dispatches to allowlisted operation handlers based on intent.
        3. Assembles an evidence-grounded result with verified provenance.
        """
        t0 = time.monotonic()
        exec_id = f"exec-{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        plan = req.plan
        if not plan and req.plan_id:
            if self.query_planner_service:
                plan = self.query_planner_service.get_plan(req.plan_id)
            if not plan:
                raise ValueError(
                    f"Investigation plan with ID '{req.plan_id}' not found. "
                    "Please provide an embedded plan or generate a plan first."
                )
        elif not plan:
            raise ValueError("Execution request must include either a validated 'plan' object or a valid 'plan_id'.")

        # Revalidate plan before execution
        if self.query_planner_service:
            val_res = self.query_planner_service.validate_plan(plan)
            if not val_res.valid:
                raise ValueError(f"Plan validation failed: {'; '.join(val_res.errors)}")
        elif plan.support_status in (PlanSupportStatus.validation_failed, PlanSupportStatus.unsupported):
            raise ValueError(f"Cannot execute plan with support status '{plan.support_status.value}'.")

        # Initialize record
        record = InvestigationExecutionRecord(
            execution_id=exec_id,
            plan_id=plan.plan_id,
            status=ExecutionStatus.running,
            question=plan.original_question,
            intent=plan.intent,
            operations_executed=[],
            logs=[f"Execution started at {now_iso}", f"Plan ID: {plan.plan_id}, Intent: {plan.intent.value}"],
            started_at=now_iso,
        )
        self._executions[exec_id] = record

        try:
            # Dispatch according to intent
            if plan.intent == IntentType.circuit_discovery:
                result = self._execute_circuit_discovery(exec_id, plan, req, record, t0)
            elif plan.intent == IntentType.inspect_neuron:
                result = self._execute_inspect_neuron(exec_id, plan, req, record, t0)
            elif plan.intent == IntentType.structural_pathway_search:
                result = self._execute_pathway_search(exec_id, plan, req, record, t0)
            elif plan.intent == IntentType.downstream_reachability:
                result = self._execute_downstream_reachability(exec_id, plan, req, record, t0)
            elif plan.intent == IntentType.structural_intervention_analysis:
                result = self._execute_intervention_analysis(exec_id, plan, req, record, t0)
            elif plan.intent in (IntentType.general_question, IntentType.unsupported_biological_question, IntentType.ambiguous_question):
                result = self._execute_informational_plan(exec_id, plan, req, record, t0)
            else:
                raise ValueError(f"Unsupported execution intent: '{plan.intent.value}'")

            record.status = result.execution_status
            record.completed_at = result.completed_at
            record.result = result
            record.logs.append(f"Execution finished with status '{result.execution_status.value}' in {result.execution_duration_ms:.2f}ms")
            return result

        except Exception as exc:
            logger.exception("Error executing NeuroQuery plan %s: %s", plan.plan_id, exc)
            record.status = ExecutionStatus.failed
            record.error = str(exc)
            record.completed_at = datetime.now(timezone.utc).isoformat()
            record.logs.append(f"Execution failed with error: {exc}")
            raise

    # ── Feature 1 & 2: Candidate Neuron Discovery ─────────────────────────────

    def _resolve_candidate_neurons(
        self,
        concept_ids: list[str],
        max_candidates: int,
        record: InvestigationExecutionRecord,
    ) -> list[DiscoveredCandidateNeuron]:
        """
        Discovers candidate neurons matching verified concept mappings from MaleCNS v1.0.
        Preserves multi-concept matching and provenance.
        """
        record.operations_executed.append("op-concept-mapping")
        record.logs.append(f"Resolving candidate neurons for concepts: {concept_ids} (limit={max_candidates})")

        candidates_by_id: dict[int, DiscoveredCandidateNeuron] = {}

        for cid in concept_ids:
            concept = self.knowledge_service._concepts.get(cid)
            if not concept:
                continue

            # Query candidate neurons via KnowledgeService
            concept_candidates = self.knowledge_service.get_candidate_neurons(cid, limit=max_candidates)

            for cand in concept_candidates:
                bid = cand.body_id
                # Determine evidence tier based on mapping status
                mapping = self.knowledge_service._mappings.get(cand.matched_mapping_id)
                review_status = mapping.review_status if mapping else "verified"
                comp_status = concept.dataset_compatibility

                if review_status == "verified" and comp_status == "compatible":
                    tier = "Tier 1 (Verified)"
                elif review_status == "partially_supported" or comp_status == "partial_coverage":
                    tier = "Tier 2 (Partially Supported)"
                elif review_status == "requires_review":
                    tier = "Tier 3 (Under Review)"
                else:
                    tier = "Tier 4 (Exploratory)"

                if bid in candidates_by_id:
                    existing = candidates_by_id[bid]
                    if cid not in existing.matched_concept_ids:
                        existing.matched_concept_ids.append(cid)
                    if cand.matched_mapping_id not in existing.matched_mapping_ids:
                        existing.matched_mapping_ids.append(cand.matched_mapping_id)
                else:
                    # Look up consensus_nt if available
                    consensus_nt = None
                    if not self.data_provider._nt.empty and bid in self.data_provider._nt.index:
                        nt_row = self.data_provider._nt.loc[bid]
                        consensus_nt = str(nt_row.get("consensus_nt")) if "consensus_nt" in nt_row and nt_row.get("consensus_nt") is not None else None

                    candidates_by_id[bid] = DiscoveredCandidateNeuron(
                        body_id=bid,
                        cell_type=cand.cell_type,
                        instance=cand.instance,
                        superclass=cand.superclass,
                        consensus_nt=consensus_nt,
                        matched_concept_ids=[cid],
                        matched_mapping_ids=[cand.matched_mapping_id],
                        matched_field=cand.matched_field,
                        matched_value=cand.matched_value,
                        evidence_status=cand.evidence_status,
                        evidence_tier=tier,
                    )

        result_candidates = list(candidates_by_id.values())[:max_candidates]
        record.logs.append(f"Discovered {len(result_candidates)} candidate neurons matching concept mappings.")
        return result_candidates

    # ── Feature 3: Bounded Subgraph Construction ─────────────────────────────

    def _construct_bounded_subgraph(
        self,
        candidates: list[DiscoveredCandidateNeuron],
        max_subgraph_nodes: int,
        min_edge_weight: int,
        record: InvestigationExecutionRecord,
    ) -> tuple[list[CircuitSubgraphNode], list[CircuitSubgraphEdge], bool, Optional[str]]:
        """
        Extracts an authentic directed synaptic subgraph from MaleCNS v1.0 around candidates.
        Prioritizes candidate neurons, then inter-candidate connections, and finally
        top synaptic partner neurons bounded strictly by max_subgraph_nodes.
        """
        record.operations_executed.append("op-subgraph-expansion")
        record.logs.append(
            f"Constructing bounded subgraph (max_nodes={max_subgraph_nodes}, min_weight={min_edge_weight})"
        )

        cand_ids = {c.body_id for c in candidates}
        if not cand_ids:
            return [], [], False, None

        self.data_provider._ensure_graph_indexed()

        # Step 1: Add all candidates as initial nodes
        nodes_map: dict[int, CircuitSubgraphNode] = {}
        for c in candidates:
            nodes_map[c.body_id] = CircuitSubgraphNode(
                id=str(c.body_id),
                body_id=c.body_id,
                cell_type=c.cell_type,
                instance=c.instance,
                superclass=c.superclass,
                consensus_nt=c.consensus_nt,
                is_candidate=True,
                matched_concept_ids=c.matched_concept_ids,
                evidence_status=c.evidence_status,
            )

        # Step 2: Extract candidate outgoing connections
        inter_candidate_edges: list[tuple[int, int, int]] = []
        partner_candidate_weights: dict[int, int] = collections.defaultdict(int)
        partner_edges: list[tuple[int, int, int]] = []

        for bid in cand_ids:
            if bid in self.data_provider._pre_index:
                s, e = self.data_provider._pre_index[bid]
                posts = self.data_provider._post_arr[s:e]
                wts = self.data_provider._wt_arr[s:e]

                for post_id, wt in zip(posts, wts):
                    post_id = int(post_id)
                    wt = int(wt)
                    if wt < min_edge_weight:
                        continue

                    if post_id in cand_ids:
                        inter_candidate_edges.append((bid, post_id, wt))
                    else:
                        partner_candidate_weights[post_id] += wt
                        partner_edges.append((bid, post_id, wt))

        # Step 3: Extract candidate incoming connections from connectome
        wt_df = self.data_provider._weights
        if not wt_df.empty:
            inc_df = wt_df[wt_df["body_post"].isin(cand_ids) & (wt_df["weight"] >= min_edge_weight)]
            for _, row in inc_df.iterrows():
                pre_id = int(row["body_pre"])
                post_id = int(row["body_post"])
                wt = int(row["weight"])

                if pre_id not in cand_ids:
                    partner_candidate_weights[pre_id] += wt
                    partner_edges.append((pre_id, post_id, wt))

        # Step 4: Prioritize partner nodes to bound subgraph size
        remaining_capacity = max(0, max_subgraph_nodes - len(nodes_map))
        sorted_partners = sorted(partner_candidate_weights.items(), key=lambda x: x[1], reverse=True)

        selected_partners = {p_id for p_id, _ in sorted_partners[:remaining_capacity]}
        is_partial = len(sorted_partners) > remaining_capacity
        partial_reason = (
            f"Subgraph bounded to top {len(nodes_map) + len(selected_partners)} nodes "
            f"by synaptic weight (limit={max_subgraph_nodes})."
            if is_partial
            else None
        )

        # Populate selected partner nodes with metadata
        for p_id in selected_partners:
            ann_row = None
            if p_id in self.data_provider._annotations.index:
                ann_row = self.data_provider._annotations.loc[p_id]

            consensus_nt = None
            if not self.data_provider._nt.empty and p_id in self.data_provider._nt.index:
                nt_row = self.data_provider._nt.loc[p_id]
                consensus_nt = str(nt_row.get("consensus_nt")) if "consensus_nt" in nt_row and nt_row.get("consensus_nt") is not None else None

            nodes_map[p_id] = CircuitSubgraphNode(
                id=str(p_id),
                body_id=p_id,
                cell_type=str(ann_row["type"]) if ann_row is not None and "type" in ann_row and ann_row["type"] is not None else None,
                instance=str(ann_row["instance"]) if ann_row is not None and "instance" in ann_row and ann_row["instance"] is not None else None,
                superclass=str(ann_row["superclass"]) if ann_row is not None and "superclass" in ann_row and ann_row["superclass"] is not None else None,
                consensus_nt=consensus_nt,
                is_candidate=False,
                matched_concept_ids=[],
                evidence_status=None,
            )

        # Step 5: Assemble edges restricted to nodes present in the bounded subgraph
        active_nodes = set(nodes_map.keys())
        edges_map: dict[str, CircuitSubgraphEdge] = {}

        # Add inter-candidate edges
        for u, v, w in inter_candidate_edges:
            if u in active_nodes and v in active_nodes:
                edge_id = f"{u}_{v}"
                edges_map[edge_id] = CircuitSubgraphEdge(
                    id=edge_id,
                    source=u,
                    target=v,
                    weight=w,
                    is_inter_candidate=True,
                )

        # Add partner edges
        for u, v, w in partner_edges:
            if u in active_nodes and v in active_nodes:
                edge_id = f"{u}_{v}"
                if edge_id not in edges_map:
                    edges_map[edge_id] = CircuitSubgraphEdge(
                        id=edge_id,
                        source=u,
                        target=v,
                        weight=w,
                        is_inter_candidate=(u in cand_ids and v in cand_ids),
                    )

        # Update node degrees and total weights
        for edge in edges_map.values():
            if edge.source in nodes_map:
                nodes_map[edge.source].degree += 1
                nodes_map[edge.source].total_weight += edge.weight
            if edge.target in nodes_map:
                nodes_map[edge.target].degree += 1
                nodes_map[edge.target].total_weight += edge.weight

        subgraph_nodes = list(nodes_map.values())
        subgraph_edges = list(edges_map.values())

        record.logs.append(
            f"Assembled subgraph: {len(subgraph_nodes)} nodes ({len(cand_ids)} candidates, {len(selected_partners)} partners), "
            f"{len(subgraph_edges)} directed edges."
        )

        return subgraph_nodes, subgraph_edges, is_partial, partial_reason

    # ── Feature 4: Candidate Circuit Ranking ──────────────────────────────────

    def _rank_candidates(
        self,
        candidates: list[DiscoveredCandidateNeuron],
        subgraph_edges: list[CircuitSubgraphEdge],
        record: InvestigationExecutionRecord,
    ) -> list[DiscoveredCandidateNeuron]:
        """
        Ranks candidates transparently using defined dual criteria:
        1. Biological Evidence Tier (Tier 1 > Tier 2 > Tier 3 > Tier 4)
        2. In-Circuit Synaptic Weight & Degree within the discovered subgraph.
        """
        record.operations_executed.append("op-circuit-ranking")
        record.logs.append("Calculating transparent dual-criteria candidate rankings.")

        # Compute candidate in-circuit degrees and weights
        cand_in_deg: dict[int, int] = collections.defaultdict(int)
        cand_out_deg: dict[int, int] = collections.defaultdict(int)
        cand_weight: dict[int, int] = collections.defaultdict(int)

        for edge in subgraph_edges:
            cand_out_deg[edge.source] += 1
            cand_weight[edge.source] += edge.weight
            cand_in_deg[edge.target] += 1
            cand_weight[edge.target] += edge.weight

        tier_weights = {
            "Tier 1 (Verified)": 1000.0,
            "Tier 2 (Partially Supported)": 500.0,
            "Tier 3 (Under Review)": 200.0,
            "Tier 4 (Exploratory)": 0.0,
        }

        for c in candidates:
            c.subgraph_in_degree = cand_in_deg[c.body_id]
            c.subgraph_out_degree = cand_out_deg[c.body_id]
            c.subgraph_total_weight = cand_weight[c.body_id]

            tier_score = tier_weights.get(c.evidence_tier, 0.0)
            synaptic_contrib = round(c.subgraph_total_weight * 0.5, 2)
            degree_contrib = round((c.subgraph_in_degree + c.subgraph_out_degree) * 10.0, 2)
            c.ranking_score = round(tier_score + synaptic_contrib + degree_contrib, 2)
            c.ranking_breakdown = {
                "evidence_tier_weight": tier_score,
                "synaptic_weight_contribution": synaptic_contrib,
                "degree_contribution": degree_contrib,
                "total_score": c.ranking_score,
            }

        # Sort descending by score, tie-breaking deterministically by body_id
        ranked = sorted(candidates, key=lambda x: (x.ranking_score, -x.body_id), reverse=True)

        for idx, c in enumerate(ranked, start=1):
            deg = c.subgraph_in_degree + c.subgraph_out_degree
            c.explanation = (
                f"Rank #{idx}: {c.evidence_tier} annotation match ({c.matched_field}={c.matched_value}) "
                f"with {deg} directed connections and {c.subgraph_total_weight} synapses in the discovered subgraph."
            )

        return ranked

    # ── Feature 5: Structural Metrics Calculation ─────────────────────────────

    def _calculate_structural_metrics(
        self,
        nodes: list[CircuitSubgraphNode],
        edges: list[CircuitSubgraphEdge],
    ) -> CircuitStructuralMetrics:
        """Calculates authentic graph properties over the bounded discovered subgraph."""
        total_nodes = len(nodes)
        total_edges = len(edges)
        candidate_count = sum(1 for n in nodes if n.is_candidate)
        partner_count = total_nodes - candidate_count

        density = (
            round(total_edges / (total_nodes * (total_nodes - 1)), 4)
            if total_nodes > 1
            else 0.0
        )
        total_wt = sum(e.weight for e in edges)
        avg_wt = round(total_wt / total_edges, 2) if total_edges > 0 else 0.0
        max_wt = max((e.weight for e in edges), default=0)

        # Identify top hub node by degree
        top_hub = max(nodes, key=lambda n: n.degree, default=None)
        top_hub_id = top_hub.body_id if top_hub and top_hub.degree > 0 else None

        # Compute connected components (undirected BFS)
        adj: dict[int, list[int]] = collections.defaultdict(list)
        for e in edges:
            adj[e.source].append(e.target)
            adj[e.target].append(e.source)

        visited: set[int] = set()
        components = 0
        for n in nodes:
            if n.body_id not in visited:
                components += 1
                queue = [n.body_id]
                visited.add(n.body_id)
                while queue:
                    curr = queue.pop(0)
                    for nxt in adj[curr]:
                        if nxt not in visited:
                            visited.add(nxt)
                            queue.append(nxt)

        return CircuitStructuralMetrics(
            total_nodes=total_nodes,
            total_edges=total_edges,
            candidate_nodes_count=candidate_count,
            partner_nodes_count=partner_count,
            density=density,
            average_weight=avg_wt,
            max_weight=max_wt,
            top_hub_body_id=top_hub_id,
            connected_components=max(1, components),
        )

    # ── Intent Handlers ───────────────────────────────────────────────────────

    def _execute_circuit_discovery(
        self,
        exec_id: str,
        plan: InvestigationPlan,
        req: InvestigationExecutionRequest,
        record: InvestigationExecutionRecord,
        t0: float,
    ) -> CircuitDiscoveryResult:
        """Executes full circuit discovery: candidate resolution, subgraph extraction, and ranking."""
        candidates = self._resolve_candidate_neurons(plan.concept_ids, req.max_candidates, record)
        nodes, edges, is_partial, partial_reason = self._construct_bounded_subgraph(
            candidates, req.max_subgraph_nodes, req.min_edge_weight, record
        )
        ranked_candidates = self._rank_candidates(candidates, edges, record)
        metrics = self._calculate_structural_metrics(nodes, edges)

        # Collect evidence sources
        evidence_sources: list[EvidenceSource] = []
        seen_sids = set()
        for cid in plan.concept_ids:
            c = self.knowledge_service._concepts.get(cid)
            if c:
                for sid in c.source_references:
                    if sid not in seen_sids:
                        src = self.knowledge_service.get_evidence_source(sid)
                        if src:
                            evidence_sources.append(src)
                            seen_sids.add(sid)

        limitations = [
            "Traced-only synaptic connection weights from Janelia MaleCNS v1.0.",
            "Subgraphs reflect anatomical wiring candidates; they do not simulate real-time physiological spike transmission.",
            "Neurotransmitter predictions reflect consensus annotations from the connectome, not direct patch-clamp recordings.",
        ]
        if is_partial and partial_reason:
            limitations.append(partial_reason)

        warnings: list[str] = []
        if not candidates:
            warnings.append("No candidate neurons found in dataset annotations for the requested concepts.")

        duration_ms = round((time.monotonic() - t0) * 1000, 2)
        status = ExecutionStatus.partially_completed if is_partial else ExecutionStatus.completed

        return CircuitDiscoveryResult(
            execution_id=exec_id,
            plan_id=plan.plan_id,
            question=plan.original_question,
            intent=plan.intent,
            resolved_concepts=plan.resolved_concepts,
            candidate_neurons=ranked_candidates,
            subgraph_nodes=nodes,
            subgraph_edges=edges,
            structural_metrics=metrics,
            ranking_method="dual_criteria_evidence_and_synaptic_weight",
            evidence_sources=evidence_sources,
            dataset_version=self.settings.neuprint_dataset if self.settings else "male-cns:v1.0",
            catalog_version="1.0.0",
            source_coverage="Traced-only synaptic connection weights from Janelia MaleCNS v1.0",
            limitations=limitations,
            warnings=warnings,
            execution_status=status,
            execution_duration_ms=duration_ms,
            completed_at=datetime.now(timezone.utc).isoformat(),
            is_partial=is_partial,
            partial_reason=partial_reason,
        )

    def _execute_inspect_neuron(
        self,
        exec_id: str,
        plan: InvestigationPlan,
        req: InvestigationExecutionRequest,
        record: InvestigationExecutionRecord,
        t0: float,
    ) -> CircuitDiscoveryResult:
        """Invokes V2 Neuron Inspector service directly for inspect_neuron plans."""
        record.operations_executed.extend(["op-neuron-profile", "op-connectivity-summary"])
        body_id = plan.requested_entities.get("body_id") or plan.parameters.get("body_id")
        if not body_id:
            raise ValueError("Neuron inspection plan missing verified body_id.")

        body_id = int(body_id)
        neuron = self.connectome_service.get_neuron(body_id)
        if not neuron:
            raise ValueError(f"Neuron with body ID {body_id} not found in MaleCNS v1.0.")

        summary = self.connectome_service.get_connectivity_summary(body_id)

        # Single root node + top partners
        node = CircuitSubgraphNode(
            id=str(body_id),
            body_id=body_id,
            cell_type=neuron.cell_type,
            instance=neuron.instance,
            superclass=neuron.superclass,
            consensus_nt=neuron.consensus_nt,
            is_candidate=True,
            degree=summary.incoming.partner_count + summary.outgoing.partner_count if summary else 0,
            total_weight=summary.incoming.total_weight + summary.outgoing.total_weight if summary else 0,
        )

        metrics = CircuitStructuralMetrics(
            total_nodes=1,
            total_edges=0,
            candidate_nodes_count=1,
            partner_nodes_count=0,
            density=0.0,
            average_weight=0.0,
            max_weight=0,
            top_hub_body_id=body_id,
            connected_components=1,
        )

        duration_ms = round((time.monotonic() - t0) * 1000, 2)
        return CircuitDiscoveryResult(
            execution_id=exec_id,
            plan_id=plan.plan_id,
            question=plan.original_question,
            intent=plan.intent,
            resolved_concepts=plan.resolved_concepts,
            candidate_neurons=[],
            subgraph_nodes=[node],
            subgraph_edges=[],
            structural_metrics=metrics,
            ranking_method="neuron_inspector_profile",
            evidence_sources=plan.evidence_sources,
            dataset_version="male-cns:v1.0",
            catalog_version="1.0.0",
            source_coverage="Janelia MaleCNS v1.0",
            limitations=["Neuron Inspector displays single-neuron profile and connectivity distribution."],
            warnings=[],
            execution_status=ExecutionStatus.completed,
            execution_duration_ms=duration_ms,
            completed_at=datetime.now(timezone.utc).isoformat(),
            existing_tool_handoff={
                "tool": "inspector",
                "body_id": body_id,
                "neuron": neuron.model_dump() if hasattr(neuron, "model_dump") else neuron.dict(),
            },
        )

    def _execute_pathway_search(
        self,
        exec_id: str,
        plan: InvestigationPlan,
        req: InvestigationExecutionRequest,
        record: InvestigationExecutionRecord,
        t0: float,
    ) -> CircuitDiscoveryResult:
        """Invokes V3 Pathway Tracer service directly for structural_pathway_search plans."""
        record.operations_executed.append("op-pathway-tracer")
        src_id = (
            plan.requested_entities.get("source_body_id")
            or plan.requested_entities.get("source_id")
            or plan.parameters.get("source_id")
            or plan.parameters.get("source_body_id")
        )
        tgt_id = (
            plan.requested_entities.get("target_body_id")
            or plan.requested_entities.get("target_id")
            or plan.parameters.get("target_id")
            or plan.parameters.get("target_body_id")
        )
        if not src_id or not tgt_id:
            raise ValueError("Structural pathway plan missing verified source_id and target_id.")

        src_id = int(src_id)
        tgt_id = int(tgt_id)
        max_hops = int(plan.parameters.get("max_hops", req.max_hops or 3))

        path_res = self.connectome_service.find_paths(src_id, tgt_id, max_hops=max_hops, max_paths=5)


        nodes_map: dict[int, CircuitSubgraphNode] = {}
        edges_list: list[CircuitSubgraphEdge] = []

        for path in path_res.paths:
            for p_node in path.nodes:
                b = p_node.body_id
                if b not in nodes_map:
                    nodes_map[b] = CircuitSubgraphNode(
                        id=str(b),
                        body_id=b,
                        cell_type=p_node.type,
                        instance=p_node.instance,
                        superclass=p_node.superclass,
                        is_candidate=(b in (src_id, tgt_id)),
                    )

            for p_edge in path.edges:
                edge_id = f"{p_edge.body_pre}_{p_edge.body_post}"
                if not any(e.id == edge_id for e in edges_list):
                    edges_list.append(
                        CircuitSubgraphEdge(
                            id=edge_id,
                            source=p_edge.body_pre,
                            target=p_edge.body_post,
                            weight=p_edge.weight,
                            is_inter_candidate=True,
                        )
                    )

        sub_nodes = list(nodes_map.values())
        metrics = self._calculate_structural_metrics(sub_nodes, edges_list)
        duration_ms = round((time.monotonic() - t0) * 1000, 2)

        return CircuitDiscoveryResult(
            execution_id=exec_id,
            plan_id=plan.plan_id,
            question=plan.original_question,
            intent=plan.intent,
            resolved_concepts=plan.resolved_concepts,
            candidate_neurons=[],
            subgraph_nodes=sub_nodes,
            subgraph_edges=edges_list,
            structural_metrics=metrics,
            ranking_method="pathway_tracer_shortest_path",
            evidence_sources=plan.evidence_sources,
            dataset_version="male-cns:v1.0",
            catalog_version="1.0.0",
            source_coverage="Janelia MaleCNS v1.0",
            limitations=["Path search identifies directed synaptic chains between specified endpoints."],
            warnings=[] if path_res.paths else ["No directed synaptic pathways found within hop limit."],
            execution_status=ExecutionStatus.completed,
            execution_duration_ms=duration_ms,
            completed_at=datetime.now(timezone.utc).isoformat(),
            existing_tool_handoff={
                "tool": "pathway_tracer",
                "source_id": src_id,
                "target_id": tgt_id,
                "paths_count": len(path_res.paths),
            },
        )

    def _execute_downstream_reachability(
        self,
        exec_id: str,
        plan: InvestigationPlan,
        req: InvestigationExecutionRequest,
        record: InvestigationExecutionRecord,
        t0: float,
    ) -> CircuitDiscoveryResult:
        """Invokes V3 Downstream Cascade service directly for downstream_reachability plans."""
        record.operations_executed.append("op-downstream-cascade")
        root_id = (
            plan.requested_entities.get("body_id")
            or plan.requested_entities.get("source_body_id")
            or plan.requested_entities.get("source_id")
            or plan.requested_entities.get("root_id")
            or plan.parameters.get("body_id")
            or plan.parameters.get("source_id")
        )
        if not root_id:
            raise ValueError("Downstream reachability plan missing verified root body_id.")

        root_id = int(root_id)
        max_hops = int(plan.parameters.get("max_hops", req.max_hops or 2))

        cascade = self.connectome_service.compute_downstream_cascade(
            root_id, max_hops=max_hops, max_nodes=req.max_subgraph_nodes
        )

        nodes_map: dict[int, CircuitSubgraphNode] = {
            root_id: CircuitSubgraphNode(id=str(root_id), body_id=root_id, is_candidate=True)
        }
        for c_node in cascade.nodes:
            b = c_node.body_id
            if b not in nodes_map:
                nodes_map[b] = CircuitSubgraphNode(
                    id=str(b),
                    body_id=b,
                    cell_type=c_node.type,
                    instance=c_node.instance,
                    superclass=c_node.superclass,
                    is_candidate=(b == root_id),
                )

        edges_list: list[CircuitSubgraphEdge] = []
        for c_edge in cascade.edges:
            edges_list.append(
                CircuitSubgraphEdge(
                    id=f"{c_edge.body_pre}_{c_edge.body_post}",
                    source=c_edge.body_pre,
                    target=c_edge.body_post,
                    weight=c_edge.weight,
                    is_inter_candidate=(c_edge.body_pre == root_id or c_edge.body_post == root_id),
                )
            )

        sub_nodes = list(nodes_map.values())
        metrics = self._calculate_structural_metrics(sub_nodes, edges_list)
        duration_ms = round((time.monotonic() - t0) * 1000, 2)

        return CircuitDiscoveryResult(
            execution_id=exec_id,
            plan_id=plan.plan_id,
            question=plan.original_question,
            intent=plan.intent,
            resolved_concepts=plan.resolved_concepts,
            candidate_neurons=[],
            subgraph_nodes=sub_nodes,
            subgraph_edges=edges_list,
            structural_metrics=metrics,
            ranking_method="cascade_reachability_breadth_first",
            evidence_sources=plan.evidence_sources,
            dataset_version="male-cns:v1.0",
            catalog_version="1.0.0",
            source_coverage="Janelia MaleCNS v1.0",
            limitations=["Downstream reachability computes breadth-first multi-hop cascade tree."],
            warnings=[],
            execution_status=ExecutionStatus.completed,
            execution_duration_ms=duration_ms,
            completed_at=datetime.now(timezone.utc).isoformat(),
            existing_tool_handoff={
                "tool": "cascade_analyzer",
                "root_id": root_id,
                "reachable_count": cascade.total_unique_nodes,
            },
        )

    def _execute_intervention_analysis(
        self,
        exec_id: str,
        plan: InvestigationPlan,
        req: InvestigationExecutionRequest,
        record: InvestigationExecutionRecord,
        t0: float,
    ) -> CircuitDiscoveryResult:
        """Prepares controlled perturbation intervention handoff, requiring explicit user confirmation."""
        record.operations_executed.append("op-perturbation-simulation")
        duration_ms = round((time.monotonic() - t0) * 1000, 2)

        metrics = CircuitStructuralMetrics(
            total_nodes=0,
            total_edges=0,
            candidate_nodes_count=0,
            partner_nodes_count=0,
            density=0.0,
            average_weight=0.0,
            max_weight=0,
            top_hub_body_id=None,
            connected_components=1,
        )

        return CircuitDiscoveryResult(
            execution_id=exec_id,
            plan_id=plan.plan_id,
            question=plan.original_question,
            intent=plan.intent,
            resolved_concepts=plan.resolved_concepts,
            candidate_neurons=[],
            subgraph_nodes=[],
            subgraph_edges=[],
            structural_metrics=metrics,
            ranking_method="perturbation_lab_comparative_resilience",
            evidence_sources=plan.evidence_sources,
            dataset_version="male-cns:v1.0",
            catalog_version="1.0.0",
            source_coverage="Janelia MaleCNS v1.0",
            limitations=[
                "Structural interventions require researcher review and explicit confirmation before simulating network damage.",
                "Non-destructive intervention testing runs in a temporary virtual overlay.",
            ],
            warnings=["Simulation requires confirmation in Perturbation Lab."],
            execution_status=ExecutionStatus.completed,
            execution_duration_ms=duration_ms,
            completed_at=datetime.now(timezone.utc).isoformat(),
            existing_tool_handoff={
                "tool": "perturbation_lab",
                "requires_confirmation": True,
                "parameters": plan.parameters,
            },
        )

    def _execute_informational_plan(
        self,
        exec_id: str,
        plan: InvestigationPlan,
        req: InvestigationExecutionRequest,
        record: InvestigationExecutionRecord,
        t0: float,
    ) -> CircuitDiscoveryResult:
        """Returns informational explanation for questions that do not map to executable graph queries."""
        duration_ms = round((time.monotonic() - t0) * 1000, 2)
        metrics = CircuitStructuralMetrics(
            total_nodes=0,
            total_edges=0,
            candidate_nodes_count=0,
            partner_nodes_count=0,
            density=0.0,
            average_weight=0.0,
            max_weight=0,
            top_hub_body_id=None,
            connected_components=1,
        )

        limitations = [
            "General questions and unsupported biological inquiries do not construct connectome subgraphs.",
            "Please refer to the Biological Knowledge Catalog or formulate a question regarding visual, motor, or mechanosensory circuits.",
        ]

        return CircuitDiscoveryResult(
            execution_id=exec_id,
            plan_id=plan.plan_id,
            question=plan.original_question,
            intent=plan.intent,
            resolved_concepts=plan.resolved_concepts,
            candidate_neurons=[],
            subgraph_nodes=[],
            subgraph_edges=[],
            structural_metrics=metrics,
            ranking_method="informational_response",
            evidence_sources=plan.evidence_sources,
            dataset_version="male-cns:v1.0",
            catalog_version="1.0.0",
            source_coverage="Janelia MaleCNS v1.0",
            limitations=limitations,
            warnings=[plan.explanation],
            execution_status=ExecutionStatus.completed,
            execution_duration_ms=duration_ms,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

    # ── V9: Subgraph Neighborhood Expansion ───────────────────────────────────

    def expand_subgraph(
        self,
        req: CircuitSubgraphExpansionRequest,
    ) -> CircuitSubgraphExpansionResponse:
        """
        Bounded graph expansion around a selected neuron's recorded neighborhood.
        Queries authentic directed connections from Janelia MaleCNS v1.0, applying
        strict node, edge, and minimum-weight constraints without duplicate nodes or edges.
        """
        self.data_provider._ensure_graph_indexed()
        root_id = req.body_id
        existing_nodes = set(req.existing_node_ids)
        existing_nodes.add(root_id)

        # Check if root neuron exists in dataset
        if root_id not in self.data_provider._annotations.index and root_id not in self.data_provider._pre_index:
            return CircuitSubgraphExpansionResponse(
                root_body_id=root_id,
                direction=req.direction,
                new_nodes=[],
                new_edges=[],
                truncated=False,
                message=f"Body ID {root_id} not found in MaleCNS annotations or connections.",
            )

        new_nodes_map: dict[int, CircuitSubgraphNode] = {}
        new_edges_map: dict[str, CircuitSubgraphEdge] = {}
        candidate_partners: dict[int, int] = collections.defaultdict(int)
        discovered_edges: list[tuple[int, int, int]] = []

        # 1. Outgoing connections if direction in ("both", "outgoing")
        if req.direction in ("both", "outgoing"):
            if root_id in self.data_provider._pre_index:
                s, e = self.data_provider._pre_index[root_id]
                posts = self.data_provider._post_arr[s:e]
                wts = self.data_provider._wt_arr[s:e]
                for post_id, wt in zip(posts, wts):
                    post_id = int(post_id)
                    wt = int(wt)
                    if wt >= req.min_weight:
                        discovered_edges.append((root_id, post_id, wt))
                        if post_id not in existing_nodes:
                            candidate_partners[post_id] += wt

        # 2. Incoming connections if direction in ("both", "incoming")
        if req.direction in ("both", "incoming"):
            wt_df = self.data_provider._weights
            if not wt_df.empty:
                inc_df = wt_df[(wt_df["body_post"] == root_id) & (wt_df["weight"] >= req.min_weight)]
                for _, row in inc_df.iterrows():
                    pre_id = int(row["body_pre"])
                    wt = int(row["weight"])
                    discovered_edges.append((pre_id, root_id, wt))
                    if pre_id not in existing_nodes:
                        candidate_partners[pre_id] += wt

        # Sort candidate partner neurons by total synaptic weight
        sorted_candidates = sorted(candidate_partners.items(), key=lambda x: x[1], reverse=True)
        selected_new_body_ids = {bid for bid, _ in sorted_candidates[:req.max_nodes]}
        truncated = len(sorted_candidates) > req.max_nodes

        # Build new nodes
        for bid in selected_new_body_ids:
            ann_row = None
            if bid in self.data_provider._annotations.index:
                ann_row = self.data_provider._annotations.loc[bid]

            consensus_nt = None
            if not self.data_provider._nt.empty and bid in self.data_provider._nt.index:
                nt_row = self.data_provider._nt.loc[bid]
                consensus_nt = str(nt_row.get("consensus_nt")) if "consensus_nt" in nt_row and nt_row.get("consensus_nt") is not None else None

            new_nodes_map[bid] = CircuitSubgraphNode(
                id=str(bid),
                body_id=bid,
                cell_type=str(ann_row["type"]) if ann_row is not None and "type" in ann_row and ann_row["type"] is not None else None,
                instance=str(ann_row["instance"]) if ann_row is not None and "instance" in ann_row and ann_row["instance"] is not None else None,
                superclass=str(ann_row["superclass"]) if ann_row is not None and "superclass" in ann_row and ann_row["superclass"] is not None else None,
                consensus_nt=consensus_nt,
                is_candidate=False,
                matched_concept_ids=[],
                evidence_status=None,
                is_expanded=True,
            )

        # Build new edges connecting root_id to newly selected nodes or existing nodes
        all_allowed_nodes = set(req.existing_node_ids) | selected_new_body_ids | {root_id}
        for u, v, w in discovered_edges:
            if u in all_allowed_nodes and v in all_allowed_nodes:
                edge_id = f"{u}_{v}"
                if edge_id not in new_edges_map:
                    new_edges_map[edge_id] = CircuitSubgraphEdge(
                        id=edge_id,
                        source=u,
                        target=v,
                        weight=w,
                        is_inter_candidate=False,
                        is_expanded=True,
                    )

        msg = (
            f"Expanded neighborhood around neuron {root_id}: added {len(new_nodes_map)} nodes "
            f"and {len(new_edges_map)} directed edges."
        )
        if truncated:
            msg += f" (Truncated to top {req.max_nodes} partners by weight)."

        return CircuitSubgraphExpansionResponse(
            root_body_id=root_id,
            direction=req.direction,
            new_nodes=list(new_nodes_map.values()),
            new_edges=list(new_edges_map.values()),
            truncated=truncated,
            message=msg,
        )

    # ── V9: Comparative Circuit Analysis ──────────────────────────────────────

    def compare_investigations(
        self,
        req: CircuitComparisonRequest,
    ) -> CircuitComparisonResult:
        """
        Performs authentic comparative analysis between two NeuroQuery investigation results.
        Computes candidate overlap, directed edge overlap (strictly direction-sensitive),
        weight deltas, rank shifts, evidence coverage, and compatibility warnings.
        """
        a = req.result_a
        b = req.result_b

        # 1. Query info
        cids_a = [c.concept_id for c in a.resolved_concepts]
        cids_b = [c.concept_id for c in b.resolved_concepts]

        info_a = InvestigationComparisonQueryInfo(
            question=a.question,
            intent=a.intent,
            concept_ids=cids_a,
            dataset_version=a.dataset_version,
            catalog_version=a.catalog_version,
        )
        info_b = InvestigationComparisonQueryInfo(
            question=b.question,
            intent=b.intent,
            concept_ids=cids_b,
            dataset_version=b.dataset_version,
            catalog_version=b.catalog_version,
        )

        # 2. Candidate comparison
        cand_map_a = {c.body_id: (idx + 1, c) for idx, c in enumerate(a.candidate_neurons)}
        cand_map_b = {c.body_id: (idx + 1, c) for idx, c in enumerate(b.candidate_neurons)}

        set_cand_a = set(cand_map_a.keys())
        set_cand_b = set(cand_map_b.keys())

        shared_cand = sorted(set_cand_a & set_cand_b)
        unique_cand_a = sorted(set_cand_a - set_cand_b)
        unique_cand_b = sorted(set_cand_b - set_cand_a)
        union_cand = set_cand_a | set_cand_b

        cand_jaccard = round(len(shared_cand) / len(union_cand), 4) if union_cand else 1.0

        rank_deltas: list[CandidateRankDelta] = []
        for bid in sorted(union_cand):
            item_a = cand_map_a.get(bid)
            item_b = cand_map_b.get(bid)
            cell_type = (item_a[1].cell_type if item_a else None) or (item_b[1].cell_type if item_b else None)
            rank_deltas.append(
                CandidateRankDelta(
                    body_id=bid,
                    cell_type=cell_type,
                    rank_a=item_a[0] if item_a else None,
                    rank_b=item_b[0] if item_b else None,
                    score_a=item_a[1].ranking_score if item_a else None,
                    score_b=item_b[1].ranking_score if item_b else None,
                    evidence_tier_a=item_a[1].evidence_tier if item_a else None,
                    evidence_tier_b=item_b[1].evidence_tier if item_b else None,
                )
            )

        cand_summary = CandidateComparisonSummary(
            candidates_a_count=len(set_cand_a),
            candidates_b_count=len(set_cand_b),
            shared_candidate_count=len(shared_cand),
            unique_a_candidate_count=len(unique_cand_a),
            unique_b_candidate_count=len(unique_cand_b),
            jaccard_similarity=cand_jaccard,
            shared_candidate_ids=shared_cand,
            unique_a_candidate_ids=unique_cand_a,
            unique_b_candidate_ids=unique_cand_b,
            rank_deltas=rank_deltas,
        )

        # 3. Graph comparison (nodes and directed edges)
        node_ids_a = {n.body_id for n in a.subgraph_nodes}
        node_ids_b = {n.body_id for n in b.subgraph_nodes}
        shared_nodes = sorted(node_ids_a & node_ids_b)
        unique_nodes_a = sorted(node_ids_a - node_ids_b)
        unique_nodes_b = sorted(node_ids_b - node_ids_a)
        union_nodes = node_ids_a | node_ids_b
        node_jaccard = round(len(shared_nodes) / len(union_nodes), 4) if union_nodes else 1.0

        edge_map_a = {f"{e.source}_{e.target}": e for e in a.subgraph_edges}
        edge_map_b = {f"{e.source}_{e.target}": e for e in b.subgraph_edges}
        edge_keys_a = set(edge_map_a.keys())
        edge_keys_b = set(edge_map_b.keys())
        shared_edge_keys = sorted(edge_keys_a & edge_keys_b)
        unique_edge_keys_a = sorted(edge_keys_a - edge_keys_b)
        unique_edge_keys_b = sorted(edge_keys_b - edge_keys_a)
        union_edges = edge_keys_a | edge_keys_b
        edge_jaccard = round(len(shared_edge_keys) / len(union_edges), 4) if union_edges else 1.0

        weight_deltas: list[EdgeWeightDelta] = []
        for ek in shared_edge_keys:
            ea = edge_map_a[ek]
            eb = edge_map_b[ek]
            weight_deltas.append(
                EdgeWeightDelta(
                    id=ek,
                    source=ea.source,
                    target=ea.target,
                    weight_a=ea.weight,
                    weight_b=eb.weight,
                    delta_weight=eb.weight - ea.weight,
                )
            )

        graph_summary = GraphComparisonSummary(
            nodes_a_count=len(node_ids_a),
            nodes_b_count=len(node_ids_b),
            shared_node_count=len(shared_nodes),
            unique_a_node_count=len(unique_nodes_a),
            unique_b_node_count=len(unique_nodes_b),
            node_jaccard_similarity=node_jaccard,
            shared_node_ids=shared_nodes,
            unique_a_node_ids=unique_nodes_a,
            unique_b_node_ids=unique_nodes_b,
            edges_a_count=len(edge_keys_a),
            edges_b_count=len(edge_keys_b),
            shared_edge_count=len(shared_edge_keys),
            unique_a_edge_count=len(unique_edge_keys_a),
            unique_b_edge_count=len(unique_edge_keys_b),
            edge_jaccard_similarity=edge_jaccard,
            shared_edge_ids=shared_edge_keys,
            unique_a_edge_ids=unique_edge_keys_a,
            unique_b_edge_ids=unique_edge_keys_b,
            weight_deltas=weight_deltas,
        )

        # 4. Evidence comparison
        set_cids_a = set(cids_a)
        set_cids_b = set(cids_b)
        shared_cids = sorted(set_cids_a & set_cids_b)
        unique_cids_a = sorted(set_cids_a - set_cids_b)
        unique_cids_b = sorted(set_cids_b - set_cids_a)

        src_ids_a = {s.source_id for s in a.evidence_sources}
        src_ids_b = {s.source_id for s in b.evidence_sources}
        shared_src = sorted(src_ids_a & src_ids_b)
        unique_src_a = sorted(src_ids_a - src_ids_b)
        unique_src_b = sorted(src_ids_b - src_ids_a)

        evidence_summary = EvidenceComparisonSummary(
            concepts_a=sorted(set_cids_a),
            concepts_b=sorted(set_cids_b),
            shared_concepts=shared_cids,
            unique_a_concepts=unique_cids_a,
            unique_b_concepts=unique_cids_b,
            sources_a_count=len(src_ids_a),
            sources_b_count=len(src_ids_b),
            shared_source_ids=shared_src,
            unique_a_source_ids=unique_src_a,
            unique_b_source_ids=unique_src_b,
        )

        # 5. Scientific compatibility warnings
        warnings: list[str] = []
        if a.dataset_version != b.dataset_version:
            warnings.append(
                f"Dataset versions differ: '{a.dataset_version}' vs '{b.dataset_version}'. "
                "Synaptic weight and annotation comparisons may not be strictly like-for-like."
            )
        if a.catalog_version != b.catalog_version:
            warnings.append(
                f"Knowledge catalog versions differ: '{a.catalog_version}' vs '{b.catalog_version}'. "
                "Evidence tiers and mapping rules may reflect different catalog releases."
            )
        if a.intent != b.intent:
            warnings.append(
                f"Investigation intents differ: '{a.intent}' vs '{b.intent}'. "
                "Subgraphs were constructed under different operational scopes."
            )
        if a.ranking_method != b.ranking_method:
            warnings.append(
                f"Ranking methods differ: '{a.ranking_method}' vs '{b.ranking_method}'. "
                "Candidate score comparisons should not be treated as equivalent values."
            )

        return CircuitComparisonResult(
            investigation_a=info_a,
            investigation_b=info_b,
            candidate_comparison=cand_summary,
            graph_comparison=graph_summary,
            evidence_comparison=evidence_summary,
            compatibility_warnings=warnings,
        )
