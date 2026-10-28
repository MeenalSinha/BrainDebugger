"""
BrainDebugger — NeuroQuery Query Planning Service (V7)

Translates natural-language biological questions into validated, structured,
evidence-grounded investigation plans using:
1. Configured LLM provider (or deterministic MockLLMProvider).
2. V6 NeuroQuery Biological Knowledge Catalog & Supported Investigations.
3. Janelia MaleCNS Connectome v1.0 local dataset provider.

Strict scientific & architectural boundaries:
• V7 generates, validates, explains, and exports investigation plans.
• V7 does NOT execute arbitrary subgraphs or claim circuits are discovered (reserved for V8).
• Model outputs are validated against the catalog; nonexistent concepts or DOIs are rejected.
• Prompts and user inputs are treated as untrusted; injections are safely neutralized.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.config import Settings
from backend.data_provider import LocalFeatherProvider
from backend.knowledge_service import KnowledgeService
from backend.llm_provider import (
    BaseLLMProvider,
    LLMProviderError,
    get_llm_provider,
)
from backend.models import (
    BiologicalConcept,
    EvidenceSource,
    IntentType,
    InvestigationPlan,
    PlanGenerationRequest,
    PlannedOperation,
    PlanSupportStatus,
    PlanValidationResponse,
    SupportedInvestigation,
)

logger = logging.getLogger("backend.query_planner_service")


class QueryPlannerService:
    """Service that orchestrates natural-language understanding into structured investigation plans."""

    def __init__(
        self,
        knowledge_service: KnowledgeService,
        data_provider: LocalFeatherProvider,
        settings: Settings,
        llm_provider: Optional[BaseLLMProvider] = None,
    ) -> None:
        self.knowledge_service = knowledge_service
        self.data_provider = data_provider
        self.settings = settings
        self.llm_provider = llm_provider or get_llm_provider(settings)
        self._plans: dict[str, InvestigationPlan] = {}

    def get_plan(self, plan_id: str) -> Optional[InvestigationPlan]:
        """Retrieves a previously generated or registered plan by ID."""
        return self._plans.get(plan_id)

    def register_plan(self, plan: InvestigationPlan) -> None:
        """Registers a plan in the session store so it can be referenced by plan_id."""
        self._plans[plan.plan_id] = plan

    async def generate_plan(self, req: PlanGenerationRequest) -> InvestigationPlan:
        """
        Receives a user question, queries the LLM provider for structured interpretation,
        resolves concepts and investigations against the V6 catalog, validates entities against
        MaleCNS v1.0, and constructs a validated InvestigationPlan.
        """
        question = req.question.strip()
        if not question:
            raise ValueError("Question cannot be empty.")

        # Gather V6 catalog context
        catalog_concepts = [
            c.model_dump() if hasattr(c, "model_dump") else c.dict()
            for c in self.knowledge_service._concepts.values()
        ]
        supported_invs = [
            i.model_dump() if hasattr(i, "model_dump") else i.dict()
            for i in self.knowledge_service._investigations.values()
        ]

        # Call LLM provider
        try:
            raw = await self.llm_provider.interpret_question(
                question=question,
                catalog_concepts=catalog_concepts,
                supported_investigations=supported_invs,
                clarification_context=req.clarification_context,
            )
        except LLMProviderError as exc:
            logger.error("LLM Provider failure: %s", exc)
            return self._build_provider_failure_plan(question, exc)
        except Exception as exc:
            logger.exception("Unexpected error during question interpretation: %s", exc)
            return self._build_provider_failure_plan(
                question, LLMProviderError(f"Unexpected provider error: {exc}", status_code=500)
            )

        # Parse raw interpretation fields
        raw_intent_str = raw.get("intent", IntentType.general_question.value)
        try:
            intent = IntentType(raw_intent_str)
        except ValueError:
            intent = IntentType.general_question

        confidence_score = raw.get("confidence_score", 0.5)
        confidence_explanation = raw.get("confidence_explanation", "Standard model evaluation.")
        raw_concept_ids = raw.get("concept_ids", [])
        raw_inv_id = raw.get("investigation_id")
        requested_entities = raw.get("requested_entities", {})
        parameters = raw.get("parameters", {})
        clarification_needed = raw.get("clarification_needed", False)
        clarification_questions = raw.get("clarification_questions", [])
        limitations = list(raw.get("limitations", []))
        explanation = raw.get("explanation", "")

        # Merge user-supplied override parameters if provided
        if req.parameters:
            parameters.update(req.parameters)

        validation_findings: list[str] = []

        # 1. Resolve biological concepts against V6 catalog
        resolved_concepts: list[BiologicalConcept] = []
        valid_concept_ids: list[str] = []
        for cid in raw_concept_ids:
            concept = self.knowledge_service._concepts.get(cid)
            if concept is not None:
                resolved_concepts.append(concept)
                valid_concept_ids.append(cid)
                if concept.dataset_compatibility == "incompatible":
                    validation_findings.append(
                        f"Concept '{concept.display_name}' ({cid}) is flagged as incompatible with MaleCNS v1.0."
                    )
                elif concept.evidence_status != "verified":
                    validation_findings.append(
                        f"Concept '{concept.display_name}' has evidence status '{concept.evidence_status}'."
                    )
            else:
                validation_findings.append(
                    f"Suggested concept ID '{cid}' does not exist in the V6 biological catalog and was omitted."
                )

        # 2. Resolve investigation against V6 registry
        investigation: Optional[SupportedInvestigation] = None
        if raw_inv_id:
            investigation = self.knowledge_service._investigations.get(raw_inv_id)
            if investigation is None:
                validation_findings.append(
                    f"Suggested investigation ID '{raw_inv_id}' is not in the supported-investigation registry."
                )
                raw_inv_id = None

        # 3. Resolve evidence sources from resolved concepts
        evidence_sources: list[EvidenceSource] = []
        req_evidence_ids: list[str] = []
        for c in resolved_concepts:
            for s_id in c.source_references:
                if s_id not in req_evidence_ids:
                    req_evidence_ids.append(s_id)
                    source = self.knowledge_service._sources.get(s_id)
                    if source:
                        evidence_sources.append(source)

        # 4. Validate requested entities (e.g., body IDs) against real dataset
        required_dataset_fields = ["body_id", "type", "instance"]
        if "body_id" in requested_entities:
            try:
                bid = int(requested_entities["body_id"])
                # Check with data provider
                neuron = self.data_provider.get_neuron(bid)
                if neuron is not None:
                    validation_findings.append(
                        f"Verified entity body ID {bid} in MaleCNS v1.0 ({neuron.type or 'untyped'}, {neuron.instance or 'no instance'})."
                    )
                    requested_entities["verified"] = True
                    requested_entities["cell_type"] = neuron.type
                else:
                    validation_findings.append(
                        f"Entity body ID {bid} was not found in the MaleCNS v1.0 dataset."
                    )
                    requested_entities["verified"] = False
            except (ValueError, TypeError):
                validation_findings.append(
                    f"Entity body ID '{requested_entities['body_id']}' is not a valid integer."
                )

        source_id_val = requested_entities.get("source_body_id") or requested_entities.get("source_id")
        if source_id_val is not None:
            try:
                s_bid = int(source_id_val)
                s_neuron = self.data_provider.get_neuron(s_bid)
                if s_neuron:
                    validation_findings.append(f"Verified source body ID {s_bid} in MaleCNS v1.0.")
                else:
                    validation_findings.append(f"Source body ID {s_bid} not found in MaleCNS v1.0.")
            except (ValueError, TypeError):
                pass

        target_id_val = requested_entities.get("target_body_id") or requested_entities.get("target_id")
        if target_id_val is not None:
            try:
                t_bid = int(target_id_val)
                t_neuron = self.data_provider.get_neuron(t_bid)
                if t_neuron:
                    validation_findings.append(f"Verified target body ID {t_bid} in MaleCNS v1.0.")
                else:
                    validation_findings.append(f"Target body ID {t_bid} not found in MaleCNS v1.0.")
            except (ValueError, TypeError):
                pass

        # 5. Parameter boundaries validation
        max_hops = parameters.get("max_hops", 3)
        if isinstance(max_hops, (int, float)):
            if max_hops > 5:
                parameters["max_hops"] = 5
                validation_findings.append("Clamped 'max_hops' to maximum supported limit of 5.")
            elif max_hops < 1:
                parameters["max_hops"] = 1
                validation_findings.append("Clamped 'max_hops' to minimum supported limit of 1.")
        else:
            parameters["max_hops"] = 3

        max_nodes = parameters.get("max_nodes", 50)
        if isinstance(max_nodes, (int, float)):
            if max_nodes > 100:
                parameters["max_nodes"] = 100
                validation_findings.append("Clamped 'max_nodes' to maximum supported limit of 100.")
            elif max_nodes < 5:
                parameters["max_nodes"] = 5
        else:
            parameters["max_nodes"] = 50

        # 6. Generate Planned Operations
        planned_operations = self._build_planned_operations(
            intent=intent,
            concept_ids=valid_concept_ids,
            investigation_id=raw_inv_id,
            requested_entities=requested_entities,
            parameters=parameters,
        )

        # 7. Determine Plan Support Status
        if clarification_needed:
            support_status = PlanSupportStatus.needs_clarification
        elif intent == IntentType.unsupported_biological_question:
            support_status = PlanSupportStatus.unsupported
        elif any(c.dataset_compatibility == "incompatible" for c in resolved_concepts):
            support_status = PlanSupportStatus.unsupported
        elif any(c.evidence_status == "partially_supported" for c in resolved_concepts):
            support_status = PlanSupportStatus.partially_supported
        elif intent in (
            IntentType.circuit_discovery,
            IntentType.inspect_neuron,
            IntentType.structural_pathway_search,
            IntentType.downstream_reachability,
            IntentType.structural_intervention_analysis,
        ):
            support_status = PlanSupportStatus.ready_for_review
        else:
            # general_question or ambiguous
            support_status = PlanSupportStatus.ready_for_review

        # Add mandatory V7 scientific disclaimer
        limitations.append(
            "V7 Plan Boundary: This is a structured investigation plan. Circuit discovery, subgraph assembly, and graph traversal will be executed in V8."
        )

        catalog_ver = (
            self.knowledge_service._manifest.version
            if self.knowledge_service._manifest
            else "1.0.0"
        )
        dataset_ver = (
            self.knowledge_service._manifest.dataset_version
            if self.knowledge_service._manifest
            else "male-cns:v1.0"
        )

        plan = InvestigationPlan(
            plan_id=f"plan-{uuid.uuid4().hex[:12]}",
            plan_schema_version="1.0.0",
            original_question=question,
            normalized_question=question.strip(),
            intent=intent,
            confidence_score=confidence_score,
            confidence_explanation=confidence_explanation,
            concept_ids=valid_concept_ids,
            resolved_concepts=resolved_concepts,
            investigation_id=raw_inv_id,
            investigation=investigation,
            requested_entities=requested_entities,
            parameters=parameters,
            planned_operations=planned_operations,
            required_dataset_fields=required_dataset_fields,
            required_evidence_sources=req_evidence_ids,
            evidence_sources=evidence_sources,
            support_status=support_status,
            clarification_needed=clarification_needed,
            clarification_questions=clarification_questions,
            limitations=limitations,
            validation_findings=validation_findings,
            explanation=explanation,
            knowledge_catalog_version=catalog_ver,
            dataset_version=dataset_ver,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        self._plans[plan.plan_id] = plan
        return plan

    def validate_plan(self, plan: InvestigationPlan) -> PlanValidationResponse:
        """
        Validates an existing candidate investigation plan against the V6 catalog,
        registry, parameter ranges, and MaleCNS dataset.
        """
        errors: list[str] = []
        warnings: list[str] = []

        # Check concept existence
        for cid in plan.concept_ids:
            if cid not in self.knowledge_service._concepts:
                errors.append(f"Concept ID '{cid}' does not exist in the V6 catalog.")
            else:
                concept = self.knowledge_service._concepts[cid]
                if concept.dataset_compatibility == "incompatible":
                    warnings.append(
                        f"Concept '{cid}' is incompatible with MaleCNS v1.0 dataset."
                    )

        # Check investigation existence
        if plan.investigation_id:
            if plan.investigation_id not in self.knowledge_service._investigations:
                errors.append(
                    f"Investigation ID '{plan.investigation_id}' does not exist in the supported registry."
                )

        # Check parameter ranges
        hops = plan.parameters.get("max_hops")
        if hops is not None and isinstance(hops, int):
            if hops > 5:
                errors.append("Parameter 'max_hops' exceeds maximum supported limit of 5.")
            elif hops < 1:
                errors.append("Parameter 'max_hops' must be at least 1.")

        nodes = plan.parameters.get("max_nodes")
        if nodes is not None and isinstance(nodes, int):
            if nodes > 100:
                warnings.append("Parameter 'max_nodes' exceeds recommended display limit of 100.")

        # Check operations
        if not plan.planned_operations and plan.intent not in (
            IntentType.general_question,
            IntentType.ambiguous_question,
            IntentType.unsupported_biological_question,
        ):
            warnings.append("Plan specifies no planned operations.")

        # Determine support status
        if errors:
            status = PlanSupportStatus.validation_failed
            valid = False
            summary = f"Plan validation failed with {len(errors)} error(s)."
        elif plan.clarification_needed:
            status = PlanSupportStatus.needs_clarification
            valid = True
            summary = "Plan is structurally valid but requires user clarification."
        elif plan.intent == IntentType.unsupported_biological_question:
            status = PlanSupportStatus.unsupported
            valid = True
            summary = "Plan validated as an unsupported biological query."
        else:
            status = PlanSupportStatus.ready_for_review
            valid = True
            summary = "Investigation plan successfully validated and ready for review."

        return PlanValidationResponse(
            valid=valid,
            plan_id=plan.plan_id,
            errors=errors,
            warnings=warnings,
            support_status=status,
            summary=summary,
        )

    def _build_planned_operations(
        self,
        intent: IntentType,
        concept_ids: list[str],
        investigation_id: Optional[str],
        requested_entities: dict[str, Any],
        parameters: dict[str, Any],
    ) -> list[PlannedOperation]:
        """Constructs safe, allowlisted PlannedOperation items for the plan."""
        ops: list[PlannedOperation] = []

        if intent == IntentType.circuit_discovery:
            ops.append(
                PlannedOperation(
                    operation_id="op-concept-mapping",
                    tool_name="KnowledgeService.get_candidates_for_concept",
                    description="Resolve candidate neurons matching concept mappings in MaleCNS v1.0.",
                    parameters={"concept_ids": concept_ids},
                    prerequisites=[],
                    is_v8_execution=False,
                )
            )
            ops.append(
                PlannedOperation(
                    operation_id="op-subgraph-expansion",
                    tool_name="ConnectomeGraph.expand_subgraph",
                    description="Extract synaptic adjacency between candidate neuron populations.",
                    parameters={
                        "max_hops": parameters.get("max_hops", 3),
                        "max_nodes": parameters.get("max_nodes", 50),
                    },
                    prerequisites=["op-concept-mapping"],
                    is_v8_execution=True,
                )
            )
            ops.append(
                PlannedOperation(
                    operation_id="op-circuit-ranking",
                    tool_name="CircuitDiscovery.rank_pathways",
                    description="Rank functional routes by synaptic weight and anatomical evidence confidence.",
                    parameters={"ranking_strategy": parameters.get("ranking_strategy", "weight_prioritized")},
                    prerequisites=["op-subgraph-expansion"],
                    is_v8_execution=True,
                )
            )

        elif intent == IntentType.inspect_neuron:
            ops.append(
                PlannedOperation(
                    operation_id="op-neuron-profile",
                    tool_name="NeuronInspector.get_profile",
                    description="Retrieve morphological and synaptic metadata for target neuron from MaleCNS.",
                    parameters={"body_id": requested_entities.get("body_id")},
                    prerequisites=[],
                    is_v8_execution=False,
                )
            )
            ops.append(
                PlannedOperation(
                    operation_id="op-connectivity-summary",
                    tool_name="NeuronInspector.get_connectivity_summary",
                    description="Compute synaptic partner distributions and in/out degree counts.",
                    parameters={"body_id": requested_entities.get("body_id")},
                    prerequisites=["op-neuron-profile"],
                    is_v8_execution=False,
                )
            )

        elif intent == IntentType.structural_pathway_search:
            ops.append(
                PlannedOperation(
                    operation_id="op-pathway-tracer",
                    tool_name="PathwayTracer.find_shortest_paths",
                    description="Compute directed shortest paths and alternative synaptic routes between source and target.",
                    parameters={
                        "source_id": requested_entities.get("source_id"),
                        "target_id": requested_entities.get("target_id"),
                        "max_hops": parameters.get("max_hops", 3),
                    },
                    prerequisites=[],
                    is_v8_execution=False,
                )
            )

        elif intent == IntentType.downstream_reachability:
            ops.append(
                PlannedOperation(
                    operation_id="op-downstream-cascade",
                    tool_name="PathwayTracer.get_downstream_cascade",
                    description="Calculate downstream reachability tree from root neuron within bounded hop depth.",
                    parameters={
                        "root_id": requested_entities.get("body_id") or requested_entities.get("source_id"),
                        "max_hops": parameters.get("max_hops", 3),
                    },
                    prerequisites=[],
                    is_v8_execution=False,
                )
            )

        elif intent == IntentType.structural_intervention_analysis:
            ops.append(
                PlannedOperation(
                    operation_id="op-perturbation-simulation",
                    tool_name="PerturbationLab.simulate_intervention",
                    description="Simulate structural lesion of designated neuron/edge and compute residual reachability.",
                    parameters={
                        "target_body_id": requested_entities.get("body_id"),
                        "intervention_type": "neuron_knockout",
                    },
                    prerequisites=[],
                    is_v8_execution=False,
                )
            )

        elif intent == IntentType.general_question:
            ops.append(
                PlannedOperation(
                    operation_id="op-general-reference",
                    tool_name="NeuroQuery.explain_general_question",
                    description="Provide neurobiological context without running connectome graph traversals.",
                    parameters={},
                    prerequisites=[],
                    is_v8_execution=False,
                )
            )

        return ops

    def _build_provider_failure_plan(
        self, question: str, exc: LLMProviderError
    ) -> InvestigationPlan:
        """Constructs an honest error plan when the configured provider fails or is unreachable."""
        return InvestigationPlan(
            plan_id=f"plan-err-{uuid.uuid4().hex[:8]}",
            plan_schema_version="1.0.0",
            original_question=question,
            normalized_question=question.strip(),
            intent=IntentType.general_question,
            confidence_score=0.0,
            confidence_explanation="Provider failure prevented NLP parsing.",
            concept_ids=[],
            resolved_concepts=[],
            investigation_id=None,
            investigation=None,
            requested_entities={},
            parameters={},
            planned_operations=[],
            required_dataset_fields=[],
            required_evidence_sources=[],
            evidence_sources=[],
            support_status=PlanSupportStatus.provider_unavailable,
            clarification_needed=False,
            clarification_questions=[],
            limitations=[
                f"LLM Provider Error: {exc.message} (Status: {exc.status_code})",
                "Ensure NEUROQUERY_LLM_PROVIDER and associated API settings are correctly configured in .env.",
            ],
            validation_findings=["Planning could not proceed due to model provider error."],
            explanation=f"The configured natural-language model provider ({exc.provider}) could not be reached: {exc.message}",
            knowledge_catalog_version="1.0.0",
            dataset_version="male-cns:v1.0",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
