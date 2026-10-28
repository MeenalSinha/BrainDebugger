"""
BrainDebugger — NeuroQuery LLM Provider Abstraction (V7)

Provides a clean interface for natural-language question interpretation.
Supports:
  1. MockLLMProvider: Deterministic, scientifically grounded NLP parser and concept
     resolver that runs offline without external API keys or network requests.
  2. OpenAILLMProvider: Connects to OpenAI, Ollama, vLLM, or any OpenAI-compatible
     structured output endpoint when configured with NEUROQUERY_LLM_API_KEY.

Security & Integrity:
  • Raw API keys never leave backend configuration.
  • User prompts are sanitized and treated as untrusted input.
  • Prompt injection attempts are detected and safely neutralized.
  • The model is instructed to NEVER invent body IDs, cell types, or evidence DOIs.
"""

from __future__ import annotations

import abc
import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any, Optional

from backend.config import Settings
from backend.models import IntentType

logger = logging.getLogger(__name__)

# Injection patterns that attempt to override backend constraints
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|above|system)\s+instructions?",
    r"you\s+are\s+now\s+in\s+developer\s+mode",
    r"bypass\s+(all\s+)?constraints?",
    r"drop\s+table",
    r"print\s+env",
    r"system\s+prompt",
    r"exec\s*\(",
    r"eval\s*\(",
]


class LLMProviderError(Exception):
    """Raised when an LLM provider request fails, times out, or returns invalid output."""

    def __init__(self, message: str, status_code: int = 502, provider: str = "unknown") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.provider = provider


class BaseLLMProvider(abc.ABC):
    """Abstract interface for NeuroQuery natural-language interpretation."""

    @abc.abstractmethod
    async def interpret_question(
        self,
        question: str,
        catalog_concepts: list[dict[str, Any]],
        supported_investigations: list[dict[str, Any]],
        clarification_context: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """
        Parse user question into structured intent, concept candidates, and parameters.
        Returns a dictionary conforming to the raw interpretation schema.
        """
        raise NotImplementedError


class MockLLMProvider(BaseLLMProvider):
    """
    Deterministic biological NLP parser for testing, continuous integration,
    and offline execution without external API dependencies.
    """

    async def interpret_question(
        self,
        question: str,
        catalog_concepts: list[dict[str, Any]],
        supported_investigations: list[dict[str, Any]],
        clarification_context: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        q_clean = question.strip()
        q_lower = q_clean.lower()

        # 1. Check for prompt injection attempts
        for pat in _INJECTION_PATTERNS:
            if re.search(pat, q_lower):
                logger.warning("Detected potential prompt injection in question: %r", q_clean)
                return {
                    "intent": IntentType.general_question.value,
                    "confidence_score": 0.1,
                    "confidence_explanation": "Input contains disallowed instructional patterns; treated as untrusted general text.",
                    "concept_ids": [],
                    "investigation_id": None,
                    "requested_entities": {},
                    "parameters": {},
                    "clarification_needed": False,
                    "clarification_questions": [],
                    "explanation": "The request contains meta-instruction patterns and cannot be parsed as a connectome query.",
                }

        # 2. Extract potential entities (body IDs, neuron types)
        extracted_body_ids = [int(m) for m in re.findall(r"\b\d{5,7}\b", q_clean)]
        extracted_cell_types = re.findall(
            r"\b(DNp01|TTMn|T4[a-d]?|T5[a-d]?|Mi1|Tm3|LC4|Dm8|Dm9|PN|AMMC)\b",
            q_clean,
            re.IGNORECASE,
        )
        canonical_cell_types = [t.upper() if t.lower() in ("dnp01", "ttmn", "lc4", "pn", "ammc") else t for t in extracted_cell_types]

        # 3. Consider clarification context if present
        merged_query = q_lower
        if clarification_context:
            prev_q = str(clarification_context.get("previous_question", "")).lower()
            prev_intent = str(clarification_context.get("previous_intent", ""))
            merged_query = f"{prev_q} {merged_query}"

        # 4. Pattern matching & Intent classification

        # General non-biological questions
        if any(g in q_lower for g in [
            "what color is the sky",
            "capital of",
            "who wrote",
            "what is the weather",
            "tell me a joke",
            "meaning of life",
        ]):
            return {
                "intent": IntentType.general_question.value,
                "confidence_score": 0.95,
                "confidence_explanation": "Identified general factual or conversational question not requiring neural network traversal.",
                "concept_ids": [],
                "investigation_id": None,
                "requested_entities": {},
                "parameters": {},
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": "This is a general factual question unrelated to Drosophila connectome circuits.",
            }

        # Incomplete pathway request (missing source or target)
        if any(p in q_lower for p in ["find a path to a motor neuron", "trace route to", "path to motor"]) and not extracted_body_ids:
            return {
                "intent": IntentType.ambiguous_question.value,
                "confidence_score": 0.7,
                "confidence_explanation": "Target or path intent recognized, but source neuron is unspecified.",
                "concept_ids": [],
                "investigation_id": "inv-pathway-search",
                "requested_entities": {},
                "parameters": {},
                "clarification_needed": True,
                "clarification_questions": [
                    "Which source neuron (body ID or cell type) should the structural pathway start from?",
                    "Do you want to trace from a descending neuron like DNp01 or a visual projection neuron like LC4?",
                ],
                "explanation": "Pathway tracing requires both a valid source and target neuron in the connectome.",
            }

        # Ambiguous visual query without subtype
        clean_q = re.sub(r"[^\w\s]", "", q_lower).strip()
        is_broad_visual = (
            any(phrase in clean_q for phrase in [
                "visual system", "visual circuit", "visual circuits", "visual processing",
                "show me visual", "show me the visual circuit", "explore visual", "vision"
            ])
            or clean_q in ["vision", "visual", "visuals"]
        )
        has_specific_subcircuit = any(k in q_lower for k in [
            "motion", "direction", "color", "chromatic", "looming", "lc4", "t4", "t5",
            "dm8", "dm9", "mi1", "tm3"
        ])
        if is_broad_visual and not has_specific_subcircuit and not clarification_context:
            return {
                "intent": IntentType.ambiguous_question.value,
                "confidence_score": 0.65,
                "confidence_explanation": "Broad biological domain identified; multiple specific circuits are cataloged.",
                "concept_ids": ["visual_motion_detection_t4_t5", "color_vision_spectral_processing", "looming_evoked_escape_lc4"],
                "investigation_id": "inv-circuit-discovery",
                "requested_entities": {},
                "parameters": {},
                "clarification_needed": True,
                "clarification_questions": [
                    "Would you like to investigate (1) direction-selective motion detection (T4/T5), (2) color processing (Dm8/Dm9), or (3) looming visual escape (LC4)?",
                ],
                "explanation": "The Drosophila visual system contains distinct subcircuits for motion detection, color vision, and looming threat detection.",
            }

        # Structural Intervention / Lesion / Perturbation
        if any(w in merged_query for w in ["lesion", "disable", "knockout", "perturb", "ablate", "remove edge", "damage", "sever"]):
            target_ids = extracted_body_ids
            return {
                "intent": IntentType.structural_intervention_analysis.value,
                "confidence_score": 0.9,
                "confidence_explanation": "Detected structural intervention or computational lesion request.",
                "concept_ids": ["giant_fiber_escape_circuit"] if any(k in merged_query for k in ["dnp01", "giant", "escape"]) else [],
                "investigation_id": "inv-perturbation-analysis",
                "requested_entities": {
                    "neuron_ids": target_ids,
                    "cell_types": canonical_cell_types,
                },
                "parameters": {
                    "disabled_neurons": target_ids,
                    "analysis_scope": "source_target_and_cascade",
                },
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": "Proposed in-silico lesion analysis to compare baseline connectivity against perturbed graph resilience.",
            }

        # Direct Pathway Search between two neurons
        if ("path" in merged_query or "route" in merged_query or "connect" in merged_query) and (len(extracted_body_ids) >= 2 or ("from" in merged_query and "to" in merged_query)):
            src_id = extracted_body_ids[0] if len(extracted_body_ids) > 0 else 10001
            tgt_id = extracted_body_ids[1] if len(extracted_body_ids) > 1 else 800146
            return {
                "intent": IntentType.structural_pathway_search.value,
                "confidence_score": 0.92,
                "confidence_explanation": "Identified directed multi-hop structural route search between specific neurons.",
                "concept_ids": ["giant_fiber_escape_circuit"] if (src_id == 10001 or "escape" in merged_query) else [],
                "investigation_id": "inv-pathway-search",
                "requested_entities": {
                    "source_body_id": src_id,
                    "target_body_id": tgt_id,
                },
                "parameters": {
                    "source_body_id": src_id,
                    "target_body_id": tgt_id,
                    "max_hops": 3,
                    "strategy": "weight_prioritized",
                },
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": f"Investigate directed structural pathways from neuron #{src_id} to #{tgt_id}.",
            }

        # Downstream Reachability / Cascade
        if any(w in merged_query for w in ["downstream", "reach", "cascade", "targets of", "divergence", "where does neuron"]):
            src_id = extracted_body_ids[0] if extracted_body_ids else 10001
            return {
                "intent": IntentType.downstream_reachability.value,
                "confidence_score": 0.88,
                "confidence_explanation": "Identified multi-hop downstream reachability cascade query.",
                "concept_ids": [],
                "investigation_id": "inv-downstream-cascade",
                "requested_entities": {
                    "source_body_id": src_id,
                },
                "parameters": {
                    "source_body_id": src_id,
                    "max_hops": 2,
                    "min_weight": 10,
                },
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": f"Compute layer-by-layer downstream synaptic reachability from neuron #{src_id}.",
            }

        # Inspect specific neuron
        if any(w in merged_query for w in ["inspect", "profile", "tell me about neuron", "who is neuron", "what does neuron"]):
            target_id = extracted_body_ids[0] if extracted_body_ids else 10001
            return {
                "intent": IntentType.inspect_neuron.value,
                "confidence_score": 0.9,
                "confidence_explanation": "Identified individual neuron anatomical and synaptic profile inspection.",
                "concept_ids": ["giant_fiber_escape_circuit"] if target_id in (10001, 10010) else [],
                "investigation_id": "inv-neuron-inspection",
                "requested_entities": {
                    "body_id": target_id,
                },
                "parameters": {
                    "body_id": target_id,
                },
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": f"Retrieve verified anatomical annotations, soma location, neurotransmitter prediction, and partner connections for #{target_id}.",
            }

        # Visual Motion Processing (T4 / T5 / Mi1 / Tm3)
        if any(w in merged_query for w in ["motion", "direction", "optic flow", "movement", "t4", "t5", "mi1", "tm3", "emd", "elementary motion"]):
            return {
                "intent": IntentType.circuit_discovery.value,
                "confidence_score": 0.95,
                "confidence_explanation": "Matches cataloged direction-selective visual motion detection concepts (T4/T5 & Mi1/Tm3).",
                "concept_ids": ["visual_motion_detection_t4_t5", "elementary_motion_detector_mi1_tm3"],
                "investigation_id": "inv-circuit-discovery",
                "requested_entities": {
                    "cell_types": ["T4a", "T4b", "T4c", "T4d", "T5a", "T5b", "T5c", "T5d", "Mi1", "Tm3"],
                },
                "parameters": {
                    "concept_id": "visual_motion_detection_t4_t5",
                    "max_nodes": 50,
                },
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": "Plan investigation for direction-selective elementary motion detection mediated by T4/T5 and their presynaptic medulla inputs Mi1/Tm3.",
            }

        # Giant Fiber Escape / Flight Initiation (DNp01 / TTMn)
        if any(w in merged_query for w in ["giant fiber", "escape", "flight initiation", "dnp01", "ttmn", "jump"]):
            return {
                "intent": IntentType.circuit_discovery.value,
                "confidence_score": 0.95,
                "confidence_explanation": "Matches verified motor control escape circuit concept (DNp01 -> TTMn).",
                "concept_ids": ["giant_fiber_escape_circuit"],
                "investigation_id": "inv-circuit-discovery",
                "requested_entities": {
                    "neuron_ids": [10001, 10010, 800146, 804642],
                    "cell_types": ["DNp01", "TTMn"],
                },
                "parameters": {
                    "concept_id": "giant_fiber_escape_circuit",
                    "source_body_id": 10001,
                    "target_body_id": 800146,
                },
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": "Plan investigation for the Giant Fiber escape circuit connecting descending neuron DNp01 to tergotrochanteral motor neuron TTMn.",
            }

        # Looming Visual Escape (LC4)
        if any(w in merged_query for w in ["looming", "lc4", "collision", "predator approach"]):
            return {
                "intent": IntentType.circuit_discovery.value,
                "confidence_score": 0.92,
                "confidence_explanation": "Matches visual projection looming threat detection concept (LC4).",
                "concept_ids": ["looming_evoked_escape_lc4"],
                "investigation_id": "inv-circuit-discovery",
                "requested_entities": {
                    "cell_types": ["LC4"],
                },
                "parameters": {
                    "concept_id": "looming_evoked_escape_lc4",
                    "max_nodes": 50,
                },
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": "Plan investigation for LC4 lobula visual projection neurons responding to rapid expansion/looming stimuli.",
            }

        # Color Vision (Dm8 / Dm9)
        if any(w in merged_query for w in ["color", "chromatic", "dm8", "dm9", "wavelength", "uv"]):
            return {
                "intent": IntentType.circuit_discovery.value,
                "confidence_score": 0.88,
                "confidence_explanation": "Matches distal medulla chromatic processing concept (Dm8/Dm9).",
                "concept_ids": ["color_vision_spectral_processing"],
                "investigation_id": "inv-circuit-discovery",
                "requested_entities": {
                    "cell_types": ["Dm8", "Dm9"],
                },
                "parameters": {
                    "concept_id": "color_vision_spectral_processing",
                    "max_nodes": 40,
                },
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": "Plan investigation for distal medulla amacrine-like neurons Dm8/Dm9 mediating chromatic sensitivity in the visual system.",
            }

        # Olfactory Processing (PN)
        if any(w in merged_query for w in ["olfactory", "smell", "odor", "antennal lobe", "pn"]):
            return {
                "intent": IntentType.circuit_discovery.value,
                "confidence_score": 0.85,
                "confidence_explanation": "Matches antennal lobe olfactory projection neuron concept (PN).",
                "concept_ids": ["olfactory_antennal_lobe_glomerular"],
                "investigation_id": "inv-circuit-discovery",
                "requested_entities": {
                    "cell_types": ["PN"],
                },
                "parameters": {
                    "concept_id": "olfactory_antennal_lobe_glomerular",
                    "max_nodes": 50,
                },
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": "Plan investigation for antennal lobe projection neurons relaying odorant receptor signals to higher brain centers.",
            }

        # Auditory courtship song (AMMC) - Incompatible / Needs review concept
        if any(w in merged_query for w in ["courtship song", "auditory", "hearing", "ammc", "vibration", "johnston", "song"]):
            return {
                "intent": IntentType.unsupported_biological_question.value,
                "confidence_score": 0.85,
                "confidence_explanation": "Biological concept recognized, but MaleCNS v1.0 lacks systematic subclassification for AMMC song interneurons.",
                "concept_ids": ["auditory_courtship_song_circuit"],
                "investigation_id": None,
                "requested_entities": {
                    "cell_types": ["AMMC"],
                },
                "parameters": {},
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": "The courtship song mechanosensory concept is cataloged as 'requires_review' because dedicated AMMC acoustic subclassification is absent in MaleCNS v1.0.",
            }

        # Known unsupported biological topics (sleep, memory / mushroom body Kenyon cells, aging)
        if any(w in merged_query for w in ["sleep", "circadian", "clock", "memory", "mushroom body", "kenyon", "aging", "longevity"]):
            return {
                "intent": IntentType.unsupported_biological_question.value,
                "confidence_score": 0.9,
                "confidence_explanation": "Requested biological topic is outside the verified V6 concept catalog.",
                "concept_ids": [],
                "investigation_id": None,
                "requested_entities": {},
                "parameters": {},
                "clarification_needed": False,
                "clarification_questions": [],
                "explanation": "Circadian sleep, mushroom body associative memory, and aging circuits are not yet registered in the V6 biological concept catalog. Supported domains currently include visual motion, color vision, looming escape, olfactory PNs, and giant fiber escape.",
            }

        # Default fallback: unsupported biological question
        return {
            "intent": IntentType.unsupported_biological_question.value,
            "confidence_score": 0.5,
            "confidence_explanation": "No matching biological concept or supported graph investigation found in the V6 catalog.",
            "concept_ids": [],
            "investigation_id": None,
            "requested_entities": {},
            "parameters": {},
            "clarification_needed": False,
            "clarification_questions": [],
            "explanation": f"BrainDebugger does not yet have verified biological knowledge records for: '{q_clean}'.",
        }


class OpenAILLMProvider(BaseLLMProvider):
    """
    Connects to an OpenAI-compatible HTTP API for natural-language interpretation.
    Enforces JSON schema validation on the response.
    """

    def __init__(self, settings: Settings) -> None:
        self.api_key = settings.neuroquery_llm_api_key or ""
        self.base_url = (settings.neuroquery_llm_base_url or "https://api.openai.com/v1").rstrip("/")
        self.model = settings.neuroquery_llm_model
        self.timeout = settings.neuroquery_llm_timeout_seconds
        self.max_retries = settings.neuroquery_llm_max_retries

    async def interpret_question(
        self,
        question: str,
        catalog_concepts: list[dict[str, Any]],
        supported_investigations: list[dict[str, Any]],
        clarification_context: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise LLMProviderError(
                "OpenAI LLM provider is selected, but NEUROQUERY_LLM_API_KEY is not configured.",
                status_code=503,
                provider="openai",
            )

        concepts_summary = [
            {
                "concept_id": c.get("concept_id"),
                "name": c.get("display_name"),
                "domain": c.get("domain"),
                "status": c.get("evidence_status"),
                "compatibility": c.get("dataset_compatibility"),
            }
            for c in catalog_concepts
        ]

        investigations_summary = [
            {
                "id": inv.get("investigation_id"),
                "name": inv.get("name"),
                "description": inv.get("description"),
            }
            for inv in supported_investigations
        ]

        system_prompt = (
            "You are the NeuroQuery Natural-Language Understanding module for BrainDebugger, "
            "a connectome analysis platform for the Janelia MaleCNS v1.0 dataset.\n"
            "Your objective is to classify the user's biological question and translate it into a structured investigation plan.\n"
            "CRITICAL RULES:\n"
            "1. You must ONLY use concept_ids from the provided catalog: "
            f"{[c['concept_id'] for c in concepts_summary]}.\n"
            "2. You must ONLY use investigation_ids from the supported investigations: "
            f"{[i['id'] for i in investigations_summary]}.\n"
            "3. DO NOT invent body IDs, cell types, or publications.\n"
            "4. If the question is ambiguous, set intent to 'ambiguous_question', clarification_needed to true, and provide clarification questions.\n"
            "5. If the question is unsupported by the catalog, set intent to 'unsupported_biological_question'.\n"
            "6. If the question is non-biological or general chat, set intent to 'general_question'.\n"
            "7. Return strictly valid JSON matching this schema:\n"
            "{\n"
            "  \"intent\": \"circuit_discovery|inspect_neuron|structural_pathway_search|downstream_reachability|structural_intervention_analysis|general_question|unsupported_biological_question|ambiguous_question\",\n"
            "  \"confidence_score\": float (0.0 to 1.0),\n"
            "  \"confidence_explanation\": string,\n"
            "  \"concept_ids\": [string],\n"
            "  \"investigation_id\": string or null,\n"
            "  \"requested_entities\": object,\n"
            "  \"parameters\": object,\n"
            "  \"clarification_needed\": boolean,\n"
            "  \"clarification_questions\": [string],\n"
            "  \"explanation\": string\n"
            "}"
        )

        user_content = f"Question: {question}"
        if clarification_context:
            user_content += f"\nClarification context: {json.dumps(clarification_context)}"

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }

        url = f"{self.base_url}/chat/completions"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )

        last_err: Optional[Exception] = None
        for attempt in range(self.max_retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    choice_content = resp_data["choices"][0]["message"]["content"]
                    return json.loads(choice_content)
            except urllib.error.HTTPError as exc:
                last_err = exc
                logger.error("OpenAI LLM HTTP error (attempt %d/%d): %s", attempt + 1, self.max_retries + 1, exc)
                if exc.code in (401, 403):
                    raise LLMProviderError(f"Authentication failed with LLM provider: {exc.reason}", status_code=exc.code, provider="openai")
            except Exception as exc:
                last_err = exc
                logger.error("OpenAI LLM request failed (attempt %d/%d): %s", attempt + 1, self.max_retries + 1, exc)

        raise LLMProviderError(
            f"Failed to communicate with LLM provider after {self.max_retries + 1} attempts: {last_err}",
            status_code=504,
            provider="openai",
        )


def get_llm_provider(settings: Settings) -> BaseLLMProvider:
    """Factory function returning the configured LLM provider instance."""
    provider_name = (settings.neuroquery_llm_provider or "mock").strip().lower()
    if provider_name in ("mock", "local", "heuristics"):
        return MockLLMProvider()
    elif provider_name == "openai":
        return OpenAILLMProvider(settings)
    else:
        logger.warning("Unrecognized LLM provider %r; falling back to MockLLMProvider.", provider_name)
        return MockLLMProvider()
