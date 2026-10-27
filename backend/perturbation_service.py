"""
BrainDebugger — Perturbation Service (V5)

Provides non-destructive structural interventions, comparative path availability,
downstream cascade reachability delta analysis, and reproducible controlled experiments.
All calculations operate over temporary exclusions without modifying the underlying
MaleCNS Feather dataset or in-memory indexes.
"""

from __future__ import annotations

import datetime
import logging
import random
import uuid
from typing import Optional

from backend.data_provider import LocalFeatherProvider
from backend.models import (
    CascadeHopLayer,
    ControlledExperimentRequest,
    ControlledExperimentResponse,
    DisabledEdge,
    InterventionConfig,
    MultiLevelResult,
    PathComparisonResult,
    PathItem,
    PerturbationComparisonRequest,
    PerturbationComparisonResponse,
    PerturbationValidationResponse,
    ReachabilityComparisonResult,
)

logger = logging.getLogger(__name__)


class PerturbationService:
    def __init__(self, provider: LocalFeatherProvider):
        self.provider = provider

    def validate_interventions(self, config: InterventionConfig) -> PerturbationValidationResponse:
        """Validate if disabled neurons and edges genuinely exist in the dataset."""
        edge_tuples = [(e.body_pre, e.body_post) for e in config.disabled_edges]
        val = self.provider.validate_interventions(config.disabled_neurons, edge_tuples)

        verified_edges = [
            DisabledEdge(body_pre=u, body_post=v, weight=w)
            for (u, v, w) in val["verified_edges"]
        ]
        unverified_edges = [
            DisabledEdge(body_pre=u, body_post=v, weight=0)
            for (u, v, _) in val["unverified_edges"]
        ]

        if val["valid"]:
            msg = f"All {len(config.disabled_neurons)} neurons and {len(config.disabled_edges)} edges verified."
        else:
            msg = f"Warning: {len(val['unverified_neurons'])} unverified neurons and {len(val['unverified_edges'])} unverified edges."

        return PerturbationValidationResponse(
            valid=val["valid"],
            verified_neurons=val["verified_neurons"],
            unverified_neurons=val["unverified_neurons"],
            verified_edges=verified_edges,
            unverified_edges=unverified_edges,
            incident_edges_disabled_count=val["incident_edges_disabled_count"],
            message=msg,
        )

    def compare_perturbation(
        self, req: PerturbationComparisonRequest, experiment_id: Optional[str] = None
    ) -> PerturbationComparisonResponse:
        """
        Calculates and compares baseline vs perturbed network for a given source neuron,
        optional target neuron, and intervention configuration.
        """
        exp_id = experiment_id or f"exp-{uuid.uuid4().hex[:8]}"
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

        disabled_n = set(req.interventions.disabled_neurons)
        disabled_e = {(e.body_pre, e.body_post) for e in req.interventions.disabled_edges}

        # ── 1. Path Comparison (if target specified) ──────────────────────────
        path_comp: Optional[PathComparisonResult] = None
        if req.target_body_id is not None:
            # Baseline paths (no interventions)
            base_p = self.provider.find_paths(
                source_body_id=req.source_body_id,
                target_body_id=req.target_body_id,
                max_hops=req.max_hops,
                max_paths=req.max_paths,
                strategy=req.strategy,
                min_weight=req.min_weight,
            )

            # Perturbed paths (with interventions)
            pert_p = self.provider.find_paths(
                source_body_id=req.source_body_id,
                target_body_id=req.target_body_id,
                max_hops=req.max_hops,
                max_paths=req.max_paths,
                strategy=req.strategy,
                min_weight=req.min_weight,
                disabled_neurons=disabled_n,
                disabled_edges=disabled_e,
            )

            endpoint_disabled = (
                req.source_body_id in disabled_n or req.target_body_id in disabled_n
            )
            disabled_ep_id = None
            if req.source_body_id in disabled_n:
                disabled_ep_id = req.source_body_id
            elif req.target_body_id in disabled_n:
                disabled_ep_id = req.target_body_id

            base_exists = len(base_p.paths) > 0
            pert_exists = len(pert_p.paths) > 0
            base_p0: Optional[PathItem] = base_p.paths[0] if base_exists else None
            pert_p0: Optional[PathItem] = pert_p.paths[0] if pert_exists else None

            # Check if original top path survived
            orig_survived = False
            if base_p0 and pert_exists:
                base_node_ids = [n.body_id for n in base_p0.nodes]
                # Did any node in base_p0 get disabled?
                nodes_hit = any(nid in disabled_n for nid in base_node_ids)
                # Did any edge in base_p0 get disabled?
                edges_hit = any(
                    (e.body_pre, e.body_post) in disabled_e for e in base_p0.edges
                )
                orig_survived = (not nodes_hit) and (not edges_hit)

            # Check if an alternative route was found
            alt_found = pert_exists and not orig_survived

            # Delta hops: H_pert - H_base
            delta_h: Optional[int] = None
            if base_p0 and pert_p0:
                delta_h = pert_p0.hops - base_p0.hops

            path_comp = PathComparisonResult(
                source_body_id=req.source_body_id,
                target_body_id=req.target_body_id,
                strategy=req.strategy,
                baseline_route_exists=base_exists,
                baseline_hops=base_p0.hops if base_p0 else None,
                baseline_total_weight=base_p0.total_weight if base_p0 else None,
                baseline_paths_count=len(base_p.paths),
                perturbed_route_exists=pert_exists,
                perturbed_hops=pert_p0.hops if pert_p0 else None,
                perturbed_total_weight=pert_p0.total_weight if pert_p0 else None,
                perturbed_paths_count=len(pert_p.paths),
                original_path_survived=orig_survived,
                alternative_path_found=alt_found,
                delta_hops=delta_h,
                endpoint_disabled=endpoint_disabled,
                disabled_endpoint_id=disabled_ep_id,
                baseline_paths=base_p.paths,
                perturbed_paths=pert_p.paths,
            )

        # ── 2. Reachability / Cascade Comparison ──────────────────────────────
        reach_comp: Optional[ReachabilityComparisonResult] = None
        base_c = self.provider.compute_downstream_cascade(
            source_body_id=req.source_body_id,
            max_hops=req.max_hops,
            max_nodes=req.max_cascade_nodes,
            min_weight=req.min_weight,
        )

        pert_c = self.provider.compute_downstream_cascade(
            source_body_id=req.source_body_id,
            max_hops=req.max_hops,
            max_nodes=req.max_cascade_nodes,
            min_weight=req.min_weight,
            disabled_neurons=disabled_n,
            disabled_edges=disabled_e,
        )

        base_nodes_set = {n.body_id for n in base_c.nodes}
        pert_nodes_set = {n.body_id for n in pert_c.nodes}
        lost_nodes = sorted(list(base_nodes_set - pert_nodes_set))
        delta_r = len(base_nodes_set) - len(pert_nodes_set)
        retention = (
            (len(pert_nodes_set) / len(base_nodes_set)) if len(base_nodes_set) > 0 else 1.0
        )

        # Lost nodes per hop
        lost_per_hop: dict[int, int] = {}
        for n in base_c.nodes:
            if n.body_id not in pert_nodes_set:
                lost_per_hop[n.hop] = lost_per_hop.get(n.hop, 0) + 1

        reach_comp = ReachabilityComparisonResult(
            source_body_id=req.source_body_id,
            max_hops=req.max_hops,
            baseline_reachable_count=len(base_nodes_set),
            perturbed_reachable_count=len(pert_nodes_set),
            delta_reachability=delta_r,
            retention_fraction=round(retention, 4),
            lost_node_ids=lost_nodes,
            lost_nodes_per_hop=lost_per_hop,
            baseline_layers=base_c.layers,
            perturbed_layers=pert_c.layers,
            baseline_cascade=base_c if req.include_cascade_graph else None,
            perturbed_cascade=pert_c if req.include_cascade_graph else None,
        )

        # ── 3. Narrative Summary ──────────────────────────────────────────────
        summary_lines = []
        num_n = len(req.interventions.disabled_neurons)
        num_e = len(req.interventions.disabled_edges)
        summary_lines.append(
            f"Interventions applied: {num_n} neuron(s), {num_e} directed connection(s)."
        )
        if path_comp:
            if path_comp.endpoint_disabled:
                summary_lines.append(
                    f"Target/Source neuron {path_comp.disabled_endpoint_id} is disabled; no structural route possible."
                )
            elif not path_comp.baseline_route_exists:
                summary_lines.append("No baseline route existed between source and target.")
            elif path_comp.original_path_survived:
                summary_lines.append("Original shortest route survived interventions without detour.")
            elif path_comp.alternative_path_found:
                d_txt = f"+{path_comp.delta_hops}" if path_comp.delta_hops and path_comp.delta_hops > 0 else "0"
                summary_lines.append(
                    f"Original path severed. Surviving alternative route discovered ({path_comp.perturbed_hops} hops, ΔH={d_txt})."
                )
            else:
                summary_lines.append("All structural routes between source and target severed.")

        summary_lines.append(
            f"Downstream reachability: {reach_comp.perturbed_reachable_count}/{reach_comp.baseline_reachable_count} nodes retained "
            f"({reach_comp.retention_fraction * 100:.1f}%, ΔR={reach_comp.delta_reachability} lost)."
        )

        return PerturbationComparisonResponse(
            experiment_id=exp_id,
            timestamp=timestamp,
            dataset="male-cns:v1.0",
            source_body_id=req.source_body_id,
            target_body_id=req.target_body_id,
            interventions=req.interventions,
            path_comparison=path_comp,
            reachability_comparison=reach_comp,
            summary_text=" ".join(summary_lines),
        )

    def run_controlled_experiment(
        self, req: ControlledExperimentRequest
    ) -> ControlledExperimentResponse:
        """
        Runs a reproducible, controlled perturbation experiment within the declared graph scope.
        Supports:
          - random_nodes
          - high_degree_nodes
          - random_edges
          - multi_level
        """
        exp_id = f"ctrl-{uuid.uuid4().hex[:8]}"
        seed = req.random_seed if req.random_seed is not None else 42
        rng = random.Random(seed)

        # Baseline cascade to identify eligible scope nodes
        base_c = self.provider.compute_downstream_cascade(
            source_body_id=req.scope_source_id,
            max_hops=req.max_hops,
            max_nodes=300,
        )

        # Eligible nodes (exclude root source and target)
        protected_nodes = {req.scope_source_id}
        if req.scope_target_id:
            protected_nodes.add(req.scope_target_id)

        eligible_nodes = [n for n in base_c.nodes if n.body_id not in protected_nodes]
        eligible_edges = [
            e for e in base_c.edges
            if e.body_pre not in protected_nodes and e.body_post not in protected_nodes
        ]

        disabled_neurons: list[int] = []
        disabled_edges: list[DisabledEdge] = []
        multi_level_results: Optional[list[MultiLevelResult]] = None

        if req.experiment_type == "random_nodes":
            k = min(req.removal_count, len(eligible_nodes))
            sampled = rng.sample(eligible_nodes, k) if k > 0 else []
            disabled_neurons = [n.body_id for n in sampled]

        elif req.experiment_type == "high_degree_nodes":
            # Rank eligible nodes by requested degree
            if req.degree_type == "in":
                eligible_nodes.sort(key=lambda n: (-n.in_degree, n.body_id))
            elif req.degree_type == "out":
                eligible_nodes.sort(key=lambda n: (-n.out_degree, n.body_id))
            else:  # total
                eligible_nodes.sort(key=lambda n: (-(n.in_degree + n.out_degree), n.body_id))

            k = min(req.removal_count, len(eligible_nodes))
            disabled_neurons = [n.body_id for n in eligible_nodes[:k]]

        elif req.experiment_type == "random_edges":
            k = min(req.removal_count, len(eligible_edges))
            sampled_e = rng.sample(eligible_edges, k) if k > 0 else []
            disabled_edges = [
                DisabledEdge(body_pre=e.body_pre, body_post=e.body_post, weight=e.weight)
                for e in sampled_e
            ]

        elif req.experiment_type == "multi_level":
            levels = req.levels or [1, 2, 5, 10]
            multi_level_results = []
            shuffled_nodes = list(eligible_nodes)
            rng.shuffle(shuffled_nodes)

            for lvl in levels:
                lvl_k = min(lvl, len(shuffled_nodes))
                lvl_dis = [n.body_id for n in shuffled_nodes[:lvl_k]]
                
                # Compute reachability for this level
                sub_comp = self.compare_perturbation(
                    PerturbationComparisonRequest(
                        interventions=InterventionConfig(
                            disabled_neurons=lvl_dis,
                            experiment_name=f"multi_lvl_{lvl}",
                        ),
                        source_body_id=req.scope_source_id,
                        target_body_id=req.scope_target_id,
                        max_hops=req.max_hops,
                        include_cascade_graph=False,
                    )
                )
                r_comp = sub_comp.reachability_comparison
                p_comp = sub_comp.path_comparison

                multi_level_results.append(
                    MultiLevelResult(
                        level=lvl,
                        disabled_neurons=lvl_dis,
                        reachable_count=r_comp.perturbed_reachable_count if r_comp else 0,
                        delta_reachability=r_comp.delta_reachability if r_comp else 0,
                        retention_fraction=r_comp.retention_fraction if r_comp else 0.0,
                        path_exists=p_comp.perturbed_route_exists if p_comp else None,
                        path_hops=p_comp.perturbed_hops if p_comp else None,
                    )
                )
            # Default final comparison uses max level
            if levels:
                lvl_k = min(levels[-1], len(shuffled_nodes))
                disabled_neurons = [n.body_id for n in shuffled_nodes[:lvl_k]]

        # Run primary comparison
        int_cfg = InterventionConfig(
            disabled_neurons=disabled_neurons,
            disabled_edges=disabled_edges,
            experiment_name=f"{req.experiment_type}_seed_{seed}",
            random_seed=seed,
        )

        comp = self.compare_perturbation(
            PerturbationComparisonRequest(
                interventions=int_cfg,
                source_body_id=req.scope_source_id,
                target_body_id=req.scope_target_id,
                max_hops=req.max_hops,
                include_cascade_graph=True,
            ),
            experiment_id=exp_id,
        )

        return ControlledExperimentResponse(
            experiment_id=exp_id,
            experiment_type=req.experiment_type,
            random_seed=seed,
            selected_interventions=int_cfg,
            comparison=comp,
            multi_level_results=multi_level_results,
        )
