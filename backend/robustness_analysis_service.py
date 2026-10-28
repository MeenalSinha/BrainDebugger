"""
BrainDebugger — Circuit Robustness & Sensitivity Analysis Service (V10)

Executes bounded computational experiments over the Janelia MaleCNS v1.0 connectome
and NeuroQuery knowledge catalog to evaluate the stability of candidate neurons,
directed synaptic connections, and structural graph metrics under alternative analysis choices.

Core Scientific Principles:
• A single investigation shows what the selected configuration produced.
• A robustness analysis shows how that result changes under explicitly defined alternative configurations.
• Source Immutability: The Janelia MaleCNS dataset and baseline investigation results are never mutated.
• Direction-Sensitive Semantics: Edge u → v is strictly distinct from v → u.
• Explicit Boundaries: Computational stability across parameter sweeps is never claimed to be
  biological proof or physiological action potential firing.
"""

from __future__ import annotations

import collections
import itertools
import logging
import statistics
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.circuit_discovery_service import CircuitDiscoveryService
from backend.config import Settings
from backend.data_provider import LocalFeatherProvider
from backend.knowledge_service import KnowledgeService
from backend.models import (
    CandidateStabilityItem,
    CircuitDiscoveryResult,
    CircuitStructuralMetrics,
    CircuitSubgraphEdge,
    CircuitSubgraphNode,
    DiscoveredCandidateNeuron,
    EdgeStabilityItem,
    ExecutionStatus,
    InvestigationExecutionRecord,
    InvestigationPlan,
    MetricSensitivityItem,
    RankingProfile,
    RobustnessAnalysisRequest,
    RobustnessAnalysisResponse,
    RobustnessManifest,
    RobustnessScenarioDefinition,
    RobustnessScenarioSummary,
)
from backend.query_planner_service import QueryPlannerService

logger = logging.getLogger("backend.robustness_analysis_service")


class RobustnessAnalysisService:
    """
    Coordinates parameterized scenario generation, execution, and stability metrics calculation.
    """

    MAX_SCENARIO_BUDGET = 25  # Guard against computationally unbounded parameter grids

    DEFAULT_PROFILES: list[RankingProfile] = [
        RankingProfile(
            profile_name="baseline_default",
            tier_weight_mult=1.0,
            synaptic_weight_mult=0.5,
            degree_mult=10.0,
            description="Authoritative V8/V9 default ranking (Tier + 0.5*Syn + 10*Deg)",
        ),
        RankingProfile(
            profile_name="connectivity_heavy",
            tier_weight_mult=0.5,
            synaptic_weight_mult=1.5,
            degree_mult=10.0,
            description="High emphasis on total synaptic weight (1.5x) with reduced tier influence (0.5x)",
        ),
        RankingProfile(
            profile_name="hub_topology",
            tier_weight_mult=0.5,
            synaptic_weight_mult=0.5,
            degree_mult=25.0,
            description="High emphasis on subgraph in/out degree (25x) identifying hub interneurons",
        ),
        RankingProfile(
            profile_name="evidence_prioritized",
            tier_weight_mult=2.0,
            synaptic_weight_mult=0.2,
            degree_mult=5.0,
            description="Strict biological tier prioritization (2.0x) with reduced structural weight",
        ),
    ]

    def __init__(
        self,
        circuit_discovery_service: CircuitDiscoveryService,
        knowledge_service: KnowledgeService,
        data_provider: LocalFeatherProvider,
        query_planner_service: Optional[QueryPlannerService] = None,
        settings: Optional[Settings] = None,
    ) -> None:
        self.circuit_discovery_service = circuit_discovery_service
        self.knowledge_service = knowledge_service
        self.data_provider = data_provider
        self.query_planner_service = query_planner_service
        self.settings = settings

        # In-memory store for completed robustness analyses
        self._analyses: dict[str, RobustnessAnalysisResponse] = {}

    def get_analysis(self, analysis_id: str) -> Optional[RobustnessAnalysisResponse]:
        """Retrieves a previously computed robustness analysis response by ID."""
        return self._analyses.get(analysis_id)

    def get_available_profiles(self) -> list[RankingProfile]:
        """Returns standard ranking profiles supported for sensitivity analysis."""
        return list(self.DEFAULT_PROFILES)

    def generate_scenarios(
        self,
        baseline_params: dict[str, Any],
        req: RobustnessAnalysisRequest,
    ) -> list[RobustnessScenarioDefinition]:
        """
        Generates a validated list of discrete parameter scenarios according to the requested strategy.
        Enforces conservative computational budget constraints.
        """
        base_min_weight = int(baseline_params.get("min_edge_weight", 1))
        base_max_nodes = int(baseline_params.get("max_subgraph_nodes", 40))
        base_max_candidates = int(baseline_params.get("max_candidates", 20))
        base_profile = self.DEFAULT_PROFILES[0]

        scenarios: list[RobustnessScenarioDefinition] = []

        # Always include baseline as scenario #0
        baseline_scenario = RobustnessScenarioDefinition(
            scenario_id="scenario-baseline",
            is_baseline=True,
            parameter_label="Baseline Configuration",
            min_edge_weight=base_min_weight,
            max_subgraph_nodes=base_max_nodes,
            max_candidates=base_max_candidates,
            ranking_profile=base_profile,
        )
        scenarios.append(baseline_scenario)

        profiles_map = {p.profile_name: p for p in self.DEFAULT_PROFILES}
        if req.ranking_profiles:
            for p in req.ranking_profiles:
                profiles_map[p.profile_name] = p

        resolved_profiles = list(req.ranking_profiles or [])
        if not resolved_profiles and req.ranking_profile_names:
            resolved_profiles = [profiles_map[name] for name in req.ranking_profile_names if name in profiles_map]

        raw_mode = (req.strategy or req.mode or "one_factor_at_a_time").lower().strip()
        mode = "one_factor_at_a_time" if raw_mode in ("one_factor", "one_factor_at_a_time") else raw_mode

        if mode == "one_factor_at_a_time":
            # 1. Sweep min_edge_weights
            if req.min_edge_weights:
                weights = sorted(list(set(int(w) for w in req.min_edge_weights if int(w) > 0)))
                for w in weights:
                    if w == base_min_weight:
                        continue
                    scenarios.append(
                        RobustnessScenarioDefinition(
                            scenario_id=f"scenario-weight-{w}",
                            is_baseline=False,
                            parameter_label=f"Weight Threshold: ≥ {w}",
                            min_edge_weight=w,
                            max_subgraph_nodes=base_max_nodes,
                            max_candidates=base_max_candidates,
                            ranking_profile=base_profile,
                        )
                    )

            # 2. Sweep max_subgraph_nodes
            if req.max_subgraph_nodes_list:
                nodes = sorted(list(set(int(n) for n in req.max_subgraph_nodes_list if 10 <= int(n) <= 100)))
                for n in nodes:
                    if n == base_max_nodes:
                        continue
                    scenarios.append(
                        RobustnessScenarioDefinition(
                            scenario_id=f"scenario-nodes-{n}",
                            is_baseline=False,
                            parameter_label=f"Max Graph Nodes: {n}",
                            min_edge_weight=base_min_weight,
                            max_subgraph_nodes=n,
                            max_candidates=base_max_candidates,
                            ranking_profile=base_profile,
                        )
                    )

            # 3. Sweep max_candidates
            if req.max_candidates_list:
                cands = sorted(list(set(int(c) for c in req.max_candidates_list if 2 <= int(c) <= 50)))
                for c in cands:
                    if c == base_max_candidates:
                        continue
                    scenarios.append(
                        RobustnessScenarioDefinition(
                            scenario_id=f"scenario-candidates-{c}",
                            is_baseline=False,
                            parameter_label=f"Max Candidates: {c}",
                            min_edge_weight=base_min_weight,
                            max_subgraph_nodes=base_max_nodes,
                            max_candidates=c,
                            ranking_profile=base_profile,
                        )
                    )

            # 4. Sweep ranking_profiles
            if resolved_profiles:
                for prof in resolved_profiles:
                    if prof.profile_name == base_profile.profile_name:
                        continue
                    scenarios.append(
                        RobustnessScenarioDefinition(
                            scenario_id=f"scenario-profile-{prof.profile_name}",
                            is_baseline=False,
                            parameter_label=f"Ranking Profile: {prof.profile_name}",
                            min_edge_weight=base_min_weight,
                            max_subgraph_nodes=base_max_nodes,
                            max_candidates=base_max_candidates,
                            ranking_profile=prof,
                        )
                    )

        elif mode == "grid":
            weights = sorted(list(set(int(w) for w in (req.min_edge_weights or [base_min_weight]) if int(w) > 0)))
            nodes = sorted(list(set(int(n) for n in (req.max_subgraph_nodes_list or [base_max_nodes]) if 10 <= int(n) <= 100)))
            cands = sorted(list(set(int(c) for c in (req.max_candidates_list or [base_max_candidates]) if 2 <= int(c) <= 50)))
            profs = resolved_profiles or [base_profile]

            total_combos = len(weights) * len(nodes) * len(cands) * len(profs)
            if total_combos > self.MAX_SCENARIO_BUDGET:
                raise ValueError(
                    f"Parameter grid generated {total_combos} combinations, exceeding analysis budget limit of {self.MAX_SCENARIO_BUDGET}. "
                    f"Please reduce parameter ranges or use 'one_factor_at_a_time' mode."
                )

            idx = 1
            for w, n, c, p in itertools.product(weights, nodes, cands, profs):
                if w == base_min_weight and n == base_max_nodes and c == base_max_candidates and p.profile_name == base_profile.profile_name:
                    continue
                scenarios.append(
                    RobustnessScenarioDefinition(
                        scenario_id=f"scenario-grid-{idx}",
                        is_baseline=False,
                        parameter_label=f"W≥{w}, N={n}, C={c}, {p.profile_name}",
                        min_edge_weight=w,
                        max_subgraph_nodes=n,
                        max_candidates=c,
                        ranking_profile=p,
                    )
                )
                idx += 1

        else:
            raise ValueError(f"Unsupported scenario generation mode: '{mode}'. Must be 'one_factor_at_a_time' or 'grid'.")

        # Deduplicate scenarios by parameter tuple
        seen = set()
        unique_scenarios = []
        for sc in scenarios:
            key = (sc.min_edge_weight, sc.max_subgraph_nodes, sc.max_candidates, sc.ranking_profile.profile_name)
            if key not in seen:
                seen.add(key)
                unique_scenarios.append(sc)

        if len(unique_scenarios) > self.MAX_SCENARIO_BUDGET:
            unique_scenarios = unique_scenarios[:self.MAX_SCENARIO_BUDGET]

        return unique_scenarios

    def execute_robustness_analysis(self, req: RobustnessAnalysisRequest) -> RobustnessAnalysisResponse:
        """
        Executes a complete sensitivity and robustness analysis.
        Freezes the baseline question, concept mappings, and dataset, while evaluating
        bounded alternative graph extraction and ranking scenarios.
        """
        t0 = time.perf_counter()
        analysis_id = f"robustness-{uuid.uuid4().hex[:12]}"

        # 1. Resolve baseline plan and execution
        target_exec_id = req.execution_id or req.baseline_execution_id
        baseline_exec = None
        if target_exec_id:
            baseline_exec = self.circuit_discovery_service.get_execution(target_exec_id)

        plan_id = req.plan_id or (baseline_exec.plan_id if baseline_exec else None)
        plan = None

        planner = self.query_planner_service or self.circuit_discovery_service.query_planner_service
        if plan_id and planner:
            plan = planner.get_plan(plan_id)

        if not plan and baseline_exec:
            from backend.models import IntentType, PlanSupportStatus
            concept_ids = []
            if baseline_exec.result and hasattr(baseline_exec.result, "resolved_concepts"):
                concept_ids = [c.concept_id for c in baseline_exec.result.resolved_concepts]
            elif baseline_exec.result and hasattr(baseline_exec.result, "candidate_neurons"):
                # Collect from candidates
                c_set = set()
                for c in baseline_exec.result.candidate_neurons:
                    c_set.update(c.matched_concept_ids)
                concept_ids = list(c_set)

            plan = InvestigationPlan(
                plan_id=baseline_exec.plan_id or f"plan-{baseline_exec.execution_id}",
                original_question=baseline_exec.question,
                normalized_question=baseline_exec.question,
                intent=baseline_exec.intent or IntentType.circuit_discovery,
                concept_ids=concept_ids,
                support_status=PlanSupportStatus.ready_for_review,
                created_at=baseline_exec.started_at,
            )

        if not plan:
            raise ValueError(
                f"Valid baseline plan could not be located. Provide a valid 'execution_id' or 'plan_id'."
            )

        # Baseline parameters
        baseline_params = {
            "min_edge_weight": 1,
            "max_subgraph_nodes": 40,
            "max_candidates": 20,
        }
        if req.baseline_overrides:
            baseline_params.update(req.baseline_overrides)

        # Extract baseline params from operations if available
        for op in plan.planned_operations:
            if op.tool_name == "circuit_discovery" or op.tool_name == "connectome_explorer":
                if "min_edge_weight" in op.parameters:
                    baseline_params["min_edge_weight"] = int(op.parameters["min_edge_weight"])
                if "max_nodes" in op.parameters:
                    baseline_params["max_subgraph_nodes"] = int(op.parameters["max_nodes"])
                if "max_candidates" in op.parameters:
                    baseline_params["max_candidates"] = int(op.parameters["max_candidates"])

        # 2. Generate discrete scenario definitions
        scenarios_defs = self.generate_scenarios(baseline_params, req)

        # 3. Execute each scenario isolatedly over real connectome
        completed_scenarios: list[RobustnessScenarioSummary] = []
        scenario_candidates_map: dict[str, list[DiscoveredCandidateNeuron]] = {}
        scenario_edges_map: dict[str, list[CircuitSubgraphEdge]] = {}
        metric_sensitivity_list: list[MetricSensitivityItem] = []
        warnings: list[str] = []

        baseline_summary: Optional[RobustnessScenarioSummary] = None

        for sc in scenarios_defs:
            sc_t0 = time.perf_counter()
            dummy_record = InvestigationExecutionRecord(
                execution_id=f"rec-{sc.scenario_id}",
                plan_id=plan.plan_id,
                status=ExecutionStatus.running,
                question=plan.original_question,
                intent=plan.intent,
                operations_executed=[],
                logs=[],
                started_at=datetime.now(timezone.utc).isoformat(),
            )

            try:
                # Resolve candidate neurons from verified concept mappings
                candidates = self.circuit_discovery_service._resolve_candidate_neurons(
                    concept_ids=plan.concept_ids,
                    max_candidates=sc.max_candidates,
                    record=dummy_record,
                )

                # Extract bounded directed subgraph from Janelia MaleCNS
                nodes, edges, is_partial, partial_reason = self.circuit_discovery_service._construct_bounded_subgraph(
                    candidates=candidates,
                    max_subgraph_nodes=sc.max_subgraph_nodes,
                    min_edge_weight=sc.min_edge_weight,
                    record=dummy_record,
                )

                # Rank candidates transparently using scenario ranking profile
                ranked_candidates = self._rank_candidates_with_profile(
                    candidates=candidates,
                    subgraph_edges=edges,
                    profile=sc.ranking_profile,
                )

                # Calculate structural metrics
                metrics = self.circuit_discovery_service._calculate_structural_metrics(nodes, edges)

                sc_duration = (time.perf_counter() - sc_t0) * 1000.0

                summary = RobustnessScenarioSummary(
                    scenario_id=sc.scenario_id,
                    is_baseline=sc.is_baseline,
                    parameter_label=sc.parameter_label,
                    min_edge_weight=sc.min_edge_weight,
                    max_subgraph_nodes=sc.max_subgraph_nodes,
                    max_candidates=sc.max_candidates,
                    ranking_profile=sc.ranking_profile,
                    candidate_count=len(ranked_candidates),
                    node_count=len(nodes),
                    edge_count=len(edges),
                    density=metrics.density,
                    average_weight=metrics.average_weight,
                    status="completed",
                    execution_duration_ms=round(sc_duration, 2),
                    top_candidate_ids=[c.body_id for c in ranked_candidates[:5]],
                )

                completed_scenarios.append(summary)
                scenario_candidates_map[sc.scenario_id] = ranked_candidates
                scenario_edges_map[sc.scenario_id] = edges

                if sc.is_baseline:
                    baseline_summary = summary

            except Exception as exc:
                logger.warning("Scenario %s failed during execution: %s", sc.scenario_id, exc)
                sc_duration = (time.perf_counter() - sc_t0) * 1000.0
                failed_summary = RobustnessScenarioSummary(
                    scenario_id=sc.scenario_id,
                    is_baseline=sc.is_baseline,
                    parameter_label=sc.parameter_label,
                    min_edge_weight=sc.min_edge_weight,
                    max_subgraph_nodes=sc.max_subgraph_nodes,
                    max_candidates=sc.max_candidates,
                    ranking_profile=sc.ranking_profile,
                    candidate_count=0,
                    node_count=0,
                    edge_count=0,
                    status="failed",
                    execution_duration_ms=round(sc_duration, 2),
                    error=str(exc),
                )
                completed_scenarios.append(failed_summary)
                warnings.append(f"Scenario {sc.scenario_id} failed: {exc}")

        if not baseline_summary:
            # Fallback if baseline scenario failed
            baseline_summary = completed_scenarios[0]

        # 4. Compute Metric Sensitivity (relative to baseline)
        base_node_count = baseline_summary.node_count
        base_edge_count = baseline_summary.edge_count

        for sc_summary in completed_scenarios:
            if sc_summary.status != "completed":
                continue
            metric_sensitivity_list.append(
                MetricSensitivityItem(
                    scenario_id=sc_summary.scenario_id,
                    parameter_label=sc_summary.parameter_label,
                    min_edge_weight=sc_summary.min_edge_weight,
                    max_subgraph_nodes=sc_summary.max_subgraph_nodes,
                    max_candidates=sc_summary.max_candidates,
                    ranking_profile_name=sc_summary.ranking_profile.profile_name,
                    node_count=sc_summary.node_count,
                    edge_count=sc_summary.edge_count,
                    candidate_count=sc_summary.candidate_count,
                    density=sc_summary.density,
                    average_weight=sc_summary.average_weight,
                    delta_nodes=sc_summary.node_count - base_node_count,
                    delta_edges=sc_summary.edge_count - base_edge_count,
                    execution_duration_ms=sc_summary.execution_duration_ms,
                    status=sc_summary.status,
                )
            )

        # 5. Compute Candidate Stability
        successful_scenario_ids = [sc.scenario_id for sc in completed_scenarios if sc.status == "completed"]
        total_successful = len(successful_scenario_ids)

        candidate_stability_list = self._compute_candidate_stability(
            scenario_candidates_map=scenario_candidates_map,
            successful_scenario_ids=successful_scenario_ids,
            baseline_id=baseline_summary.scenario_id,
            top_k_cutoff=req.top_k_cutoff,
        )

        # 6. Compute Directed Edge Stability
        edge_stability_list = self._compute_edge_stability(
            scenario_edges_map=scenario_edges_map,
            successful_scenario_ids=successful_scenario_ids,
            baseline_id=baseline_summary.scenario_id,
        )

        # 7. Summary Indicators
        stable_candidates = [c for c in candidate_stability_list if c.inclusion_fraction >= 0.8]
        retained_top_k = [c for c in candidate_stability_list if c.top_k_retained]
        stable_edges = [e for e in edge_stability_list if e.inclusion_fraction >= 0.8]

        stability_summary = {
            "requested_scenarios": len(scenarios_defs),
            "completed_scenarios": total_successful,
            "failed_scenarios": len(scenarios_defs) - total_successful,
            "evaluated_candidate_count": len(candidate_stability_list),
            "stable_candidate_count": len(stable_candidates),
            "top_k_retained_count": len(retained_top_k),
            "evaluated_edge_count": len(edge_stability_list),
            "stable_edge_count": len(stable_edges),
            "top_k_cutoff": req.top_k_cutoff,
            "stability_threshold_pct": 80.0,
        }

        # 8. Construct Reproducibility Manifest
        total_duration = (time.perf_counter() - t0) * 1000.0

        manifest = RobustnessManifest(
            manifest_version="1.0.0",
            schema_version="1.0.0",
            analysis_id=analysis_id,
            baseline_execution_id=baseline_exec.execution_id if baseline_exec else f"plan-{plan.plan_id}",
            baseline_plan_id=plan.plan_id,
            research_question=plan.original_question,
            dataset_version=getattr(self.data_provider, "dataset_version", None) or "male-cns:v1.0",
            catalog_version=(
                self.knowledge_service._manifest.version
                if getattr(self.knowledge_service, "_manifest", None)
                else "1.0.0"
            ),
            ranking_formula_version="v10.0",
            scenario_strategy=req.strategy or req.mode or "one_factor_at_a_time",
            strategy=req.strategy or req.mode or "one_factor_at_a_time",
            parameter_grid=[sc.parameter_label for sc in scenarios_defs],
            requested_scenarios=len(scenarios_defs),
            completed_scenarios=total_successful,
            failed_scenarios=len(scenarios_defs) - total_successful,
            created_at=datetime.now(timezone.utc).isoformat(),
            execution_duration_total_ms=round(total_duration, 2),
            scientific_limitations=[
                "Sensitivity analysis evaluates computational robustness across bounded parameter scenarios.",
                "Candidate inclusion stability indicates survival under tested thresholds, not calibrated physiological probability.",
                "MaleCNS v1.0 data represents traced-only synaptic connections; unannotated synapses are not evaluated.",
                "Directed graph metrics reflect anatomical connectivity and do not simulate action potential dynamics or biological causality.",
            ],
        )

        response = RobustnessAnalysisResponse(
            analysis_id=analysis_id,
            baseline_execution_id=manifest.baseline_execution_id,
            baseline_summary=baseline_summary,
            scenarios=completed_scenarios,
            candidate_stability=candidate_stability_list,
            edge_stability=edge_stability_list,
            metric_sensitivity=metric_sensitivity_list,
            manifest=manifest,
            stability_summary=stability_summary,
            warnings=warnings,
        )

        self._analyses[analysis_id] = response
        return response

    def _rank_candidates_with_profile(
        self,
        candidates: list[DiscoveredCandidateNeuron],
        subgraph_edges: list[CircuitSubgraphEdge],
        profile: RankingProfile,
    ) -> list[DiscoveredCandidateNeuron]:
        """
        Ranks candidate neurons deterministically according to the specified ranking profile multipliers.
        """
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

        ranked_cands: list[DiscoveredCandidateNeuron] = []
        for c in candidates:
            # Create a shallow copy to prevent state contamination between scenarios
            cand_copy = DiscoveredCandidateNeuron(
                body_id=c.body_id,
                cell_type=c.cell_type,
                instance=c.instance,
                superclass=c.superclass,
                consensus_nt=c.consensus_nt,
                matched_concept_ids=list(c.matched_concept_ids),
                matched_mapping_ids=list(c.matched_mapping_ids),
                matched_field=c.matched_field,
                matched_value=c.matched_value,
                evidence_status=c.evidence_status,
                evidence_tier=c.evidence_tier,
                subgraph_in_degree=cand_in_deg[c.body_id],
                subgraph_out_degree=cand_out_deg[c.body_id],
                subgraph_total_weight=cand_weight[c.body_id],
            )

            tier_score = round(tier_weights.get(cand_copy.evidence_tier, 0.0) * profile.tier_weight_mult, 2)
            synaptic_contrib = round(cand_copy.subgraph_total_weight * profile.synaptic_weight_mult, 2)
            degree_contrib = round((cand_copy.subgraph_in_degree + cand_copy.subgraph_out_degree) * profile.degree_mult, 2)
            cand_copy.ranking_score = round(tier_score + synaptic_contrib + degree_contrib, 2)
            cand_copy.ranking_breakdown = {
                "evidence_tier_weight": tier_score,
                "synaptic_weight_contribution": synaptic_contrib,
                "degree_contribution": degree_contrib,
                "total_score": cand_copy.ranking_score,
            }
            ranked_cands.append(cand_copy)

        # Deterministic sort descending by score, tie-breaking by body_id
        ranked_cands.sort(key=lambda x: (x.ranking_score, -x.body_id), reverse=True)

        for idx, c in enumerate(ranked_cands, start=1):
            deg = c.subgraph_in_degree + c.subgraph_out_degree
            c.explanation = (
                f"Rank #{idx} under {profile.profile_name}: {c.evidence_tier} ({c.matched_field}={c.matched_value}) "
                f"with {deg} connections and {c.subgraph_total_weight} synapses."
            )

        return ranked_cands

    def _compute_candidate_stability(
        self,
        scenario_candidates_map: dict[str, list[DiscoveredCandidateNeuron]],
        successful_scenario_ids: list[str],
        baseline_id: str,
        top_k_cutoff: int = 5,
    ) -> list[CandidateStabilityItem]:
        """
        Calculates candidate neuron inclusion fraction, median rank, and top-k retention across scenarios.
        """
        total_scenarios = len(successful_scenario_ids)
        if total_scenarios == 0:
            return []

        # Map candidate body_id -> metadata
        cand_meta: dict[int, dict[str, Any]] = {}
        cand_ranks: dict[int, dict[str, int]] = collections.defaultdict(dict)

        for sc_id in successful_scenario_ids:
            cands = scenario_candidates_map.get(sc_id, [])
            for rank_idx, c in enumerate(cands, start=1):
                cand_ranks[c.body_id][sc_id] = rank_idx
                if c.body_id not in cand_meta:
                    cand_meta[c.body_id] = {
                        "cell_type": c.cell_type,
                        "instance": c.instance,
                        "evidence_tier": c.evidence_tier,
                    }

        baseline_ranks = cand_ranks.get(baseline_id, {})
        stability_items: list[CandidateStabilityItem] = []

        for body_id, ranks_by_scenario in cand_ranks.items():
            observed_ranks_list = list(ranks_by_scenario.values())
            inclusion_count = len(observed_ranks_list)
            inclusion_fraction = round(inclusion_count / total_scenarios, 4)

            median_rank = float(statistics.median(observed_ranks_list))
            min_rank = min(observed_ranks_list)
            max_rank = max(observed_ranks_list)
            rank_spread = max_rank - min_rank

            baseline_rank = ranks_by_scenario.get(baseline_id)
            in_baseline = baseline_rank is not None

            # Top-k retention: appears in top-k in >= 75% of scenarios where included
            top_k_appearances = sum(1 for r in observed_ranks_list if r <= top_k_cutoff)
            top_k_retained = (top_k_appearances / inclusion_count) >= 0.75 if inclusion_count > 0 else False

            meta = cand_meta[body_id]
            stability_items.append(
                CandidateStabilityItem(
                    body_id=body_id,
                    cell_type=meta["cell_type"],
                    instance=meta["instance"],
                    evidence_tier=meta["evidence_tier"],
                    baseline_rank=baseline_rank,
                    median_rank=round(median_rank, 1),
                    min_rank=min_rank,
                    max_rank=max_rank,
                    rank_spread=rank_spread,
                    inclusion_count=inclusion_count,
                    total_scenarios=total_scenarios,
                    inclusion_fraction=inclusion_fraction,
                    in_baseline=in_baseline,
                    top_k_retained=top_k_retained,
                    observed_ranks=ranks_by_scenario,
                )
            )

        # Sort descending by inclusion fraction, then by median rank ascending
        stability_items.sort(key=lambda x: (x.inclusion_fraction, -x.median_rank, -x.body_id), reverse=True)
        return stability_items

    def _compute_edge_stability(
        self,
        scenario_edges_map: dict[str, list[CircuitSubgraphEdge]],
        successful_scenario_ids: list[str],
        baseline_id: str,
    ) -> list[EdgeStabilityItem]:
        """
        Calculates directed edge inclusion stability across completed scenarios.
        Edge u → v is strictly distinct from v → u.
        """
        total_scenarios = len(successful_scenario_ids)
        if total_scenarios == 0:
            return []

        edge_meta: dict[str, tuple[int, int, int]] = {}  # edge_id -> (source, target, weight)
        edge_scenarios: dict[str, set[str]] = collections.defaultdict(set)

        for sc_id in successful_scenario_ids:
            edges = scenario_edges_map.get(sc_id, [])
            for e in edges:
                edge_id = f"{e.source}_{e.target}"
                edge_scenarios[edge_id].add(sc_id)
                if edge_id not in edge_meta:
                    edge_meta[edge_id] = (e.source, e.target, e.weight)

        baseline_edge_ids = set()
        for e in scenario_edges_map.get(baseline_id, []):
            baseline_edge_ids.add(f"{e.source}_{e.target}")

        edge_stability_items: list[EdgeStabilityItem] = []
        for edge_id, sc_set in edge_scenarios.items():
            source, target, weight = edge_meta[edge_id]
            inclusion_count = len(sc_set)
            inclusion_fraction = round(inclusion_count / total_scenarios, 4)
            in_baseline = edge_id in baseline_edge_ids
            survives_strict = weight >= 10

            edge_stability_items.append(
                EdgeStabilityItem(
                    edge_id=edge_id,
                    source=source,
                    target=target,
                    weight=weight,
                    inclusion_count=inclusion_count,
                    total_scenarios=total_scenarios,
                    inclusion_fraction=inclusion_fraction,
                    in_baseline=in_baseline,
                    survives_strict_threshold=survives_strict,
                )
            )

        # Sort descending by inclusion fraction, then by weight
        edge_stability_items.sort(key=lambda x: (x.inclusion_fraction, x.weight), reverse=True)
        return edge_stability_items
