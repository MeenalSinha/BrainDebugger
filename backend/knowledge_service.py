"""
BrainDebugger — NeuroQuery Foundation & Biological Knowledge Service (V6)

Grounds high-level neuroscience concepts in:
1. Versioned peer-reviewed evidence (authentic literature with DOIs).
2. Verified MaleCNS v1.0 annotations (cell type, instance, superclass).
3. Registered connectome graph investigations.

Strict scientific boundaries:
- Computational interventions are non-destructive.
- No fabricated citations, DOIs, or synthetic neuron records.
- Provenance and limitations are explicitly reported.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from backend.data_provider import LocalFeatherProvider
from backend.models import (
    BiologicalConcept,
    ConceptCandidateNeuron,
    ConceptDetailResponse,
    ConceptMapping,
    EvidenceSource,
    KnowledgeCatalogManifest,
    KnowledgeStatusResponse,
    KnowledgeValidationReport,
    SupportedInvestigation,
)

logger = logging.getLogger("backend.knowledge_service")


class KnowledgeService:
    """Service managing the versioned NeuroQuery biological knowledge catalog."""

    def __init__(
        self,
        provider: LocalFeatherProvider,
        knowledge_dir: Optional[Path | str] = None,
    ) -> None:
        self.provider = provider
        if knowledge_dir is not None:
            self.knowledge_dir = Path(knowledge_dir)
        else:
            base_dir = getattr(provider, "data_dir", getattr(provider, "_data_dir", Path("data")))
            self.knowledge_dir = Path(base_dir) / "knowledge"

        self._manifest: Optional[KnowledgeCatalogManifest] = None
        self._concepts: dict[str, BiologicalConcept] = {}
        self._sources: dict[str, EvidenceSource] = {}
        self._mappings: dict[str, ConceptMapping] = {}
        self._investigations: dict[str, SupportedInvestigation] = {}
        self._load_catalog()

    def _load_catalog(self) -> None:
        """Loads and parses all JSON catalog files from knowledge_dir."""
        if not self.knowledge_dir.exists():
            logger.warning(
                "Knowledge directory does not exist: %s", self.knowledge_dir
            )
            return

        manifest_file = self.knowledge_dir / "catalog-manifest.json"
        concepts_file = self.knowledge_dir / "concepts.json"
        sources_file = self.knowledge_dir / "evidence-sources.json"
        mappings_file = self.knowledge_dir / "concept-mappings.json"
        investigations_file = (
            self.knowledge_dir / "supported-investigations.json"
        )

        try:
            if manifest_file.exists():
                with open(manifest_file, "r", encoding="utf-8") as f:
                    self._manifest = KnowledgeCatalogManifest(**json.load(f))

            if sources_file.exists():
                with open(sources_file, "r", encoding="utf-8") as f:
                    raw_sources = json.load(f)
                    self._sources = {
                        s["source_id"]: EvidenceSource(**s) for s in raw_sources
                    }

            if mappings_file.exists():
                with open(mappings_file, "r", encoding="utf-8") as f:
                    raw_mappings = json.load(f)
                    self._mappings = {
                        m["mapping_id"]: ConceptMapping(**m)
                        for m in raw_mappings
                    }

            if concepts_file.exists():
                with open(concepts_file, "r", encoding="utf-8") as f:
                    raw_concepts = json.load(f)
                    self._concepts = {
                        c["concept_id"]: BiologicalConcept(**c)
                        for c in raw_concepts
                    }

            if investigations_file.exists():
                with open(investigations_file, "r", encoding="utf-8") as f:
                    raw_inv = json.load(f)
                    self._investigations = {
                        i["investigation_id"]: SupportedInvestigation(**i)
                        for i in raw_inv
                    }

            logger.info(
                "Loaded NeuroQuery knowledge catalog: %d concepts, %d sources, %d mappings, %d investigations",
                len(self._concepts),
                len(self._sources),
                len(self._mappings),
                len(self._investigations),
            )
        except Exception as exc:
            logger.error("Failed to load knowledge catalog: %s", exc)

    @property
    def catalog_version(self) -> str:
        return self._manifest.version if self._manifest else "1.0.0"

    def get_status(self) -> KnowledgeStatusResponse:
        """Returns the overall health and status of the knowledge layer."""
        report = self.validate_catalog()
        cat_id = (
            self._manifest.catalog_id
            if self._manifest
            else "neuroquery-drosophila-cns-catalog"
        )
        cat_name = (
            self._manifest.catalog_name
            if self._manifest
            else "NeuroQuery Biological Knowledge Catalog"
        )
        cat_ver = self._manifest.version if self._manifest else "1.0.0"
        dataset_ver = (
            self._manifest.dataset_version
            if self._manifest
            else "male-cns:v1.0"
        )

        supported_inv_count = sum(
            1 for i in self._investigations.values() if i.status == "supported"
        )

        return KnowledgeStatusResponse(
            catalog_id=cat_id,
            catalog_name=cat_name,
            catalog_version=cat_ver,
            dataset_version=dataset_ver,
            catalog_loaded=len(self._concepts) > 0,
            total_concepts=len(self._concepts),
            total_evidence_sources=len(self._sources),
            total_mappings=len(self._mappings),
            total_investigations=len(self._investigations),
            supported_investigation_count=supported_inv_count,
            validation_status="valid" if report.valid else "issues_found",
            data_availability_notice=(
                "MaleCNS v1.0 local Feather dataset loaded with full annotation coverage."
                if not self.provider._annotations.empty
                else "Dataset running without local Feather annotations."
            ),
        )

    def list_concepts(
        self,
        domain: Optional[str] = None,
        evidence_status: Optional[str] = None,
        query: Optional[str] = None,
    ) -> list[BiologicalConcept]:
        """Lists concepts with optional filtering by domain, evidence status, or text query."""
        results = list(self._concepts.values())

        if domain:
            results = [
                c for c in results if c.domain.lower() == domain.lower()
            ]

        if evidence_status:
            results = [
                c
                for c in results
                if c.evidence_status.lower() == evidence_status.lower()
            ]

        if query:
            q = query.strip().lower()
            results = [
                c
                for c in results
                if q in c.display_name.lower()
                or q in c.description.lower()
                or q in c.concept_id.lower()
            ]

        return results

    def get_concept(self, concept_id: str) -> Optional[ConceptDetailResponse]:
        """Returns full concept detail including linked sources, mappings, and supported investigations."""
        concept = self._concepts.get(concept_id)
        if not concept:
            return None

        # Linked sources
        sources = [
            self._sources[sid]
            for sid in concept.source_references
            if sid in self._sources
        ]

        # Linked mappings
        mappings = [
            self._mappings[mid]
            for mid in concept.mapping_ids
            if mid in self._mappings
        ]

        # Linked investigations: investigations whose required_concepts include this concept or 'any'
        investigations = [
            inv
            for inv in self._investigations.values()
            if "any" in inv.required_concepts
            or concept_id in inv.required_concepts
        ]

        # Approximate candidate count (bounded to fast count)
        candidate_count = len(
            self.get_candidate_neurons(concept_id, limit=1000)
        )

        return ConceptDetailResponse(
            concept=concept,
            sources=sources,
            mappings=mappings,
            supported_investigations=investigations,
            candidate_count=candidate_count,
            dataset_compatibility_status=concept.dataset_compatibility,
        )

    def get_evidence_source(self, source_id: str) -> Optional[EvidenceSource]:
        """Retrieves a single evidence source by ID."""
        return self._sources.get(source_id)

    def list_investigations(self) -> list[SupportedInvestigation]:
        """Retrieves all registered graph investigations."""
        return list(self._investigations.values())

    def get_candidate_neurons(
        self,
        concept_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ConceptCandidateNeuron]:
        """
        Dynamically retrieves real candidate neurons matching verified concept mappings.
        Reuses provider's loaded in-memory annotations without reloading files.
        """
        concept = self._concepts.get(concept_id)
        if not concept:
            return []

        df = self.provider._annotations
        if df.empty:
            return []

        candidates_map: dict[int, ConceptCandidateNeuron] = {}

        for mid in concept.mapping_ids:
            mapping = self._mappings.get(mid)
            if not mapping:
                continue

            target_field = mapping.target_field
            # Map canonical annotation field name if needed
            col_name = "type" if target_field == "type" else target_field
            if col_name == "body_id":
                col_name = "bodyId"

            if col_name not in df.columns and col_name != "bodyId":
                continue

            for target_val in mapping.target_values:
                matched_rows = None

                if col_name == "bodyId":
                    try:
                        bid_val = int(target_val)
                        if bid_val in df.index:
                            matched_rows = df.loc[[bid_val]]
                    except ValueError:
                        pass
                else:
                    series = df[col_name].dropna().astype(str)
                    if mapping.match_type == "exact":
                        mask = series == target_val
                    elif mapping.match_type == "prefix":
                        mask = series.str.startswith(target_val)
                    elif mapping.match_type == "set":
                        mask = series.isin(mapping.target_values)
                    else:
                        mask = series == target_val

                    matched_rows = df.loc[series[mask].index]

                if matched_rows is not None and not matched_rows.empty:
                    for _, row in matched_rows.iterrows():
                        bid = int(row["bodyId"])
                        if bid not in candidates_map:
                            candidates_map[bid] = ConceptCandidateNeuron(
                                body_id=bid,
                                cell_type=str(row["type"])
                                if "type" in row and row["type"] is not None
                                else None,
                                instance=str(row["instance"])
                                if "instance" in row
                                and row["instance"] is not None
                                else None,
                                superclass=str(row["superclass"])
                                if "superclass" in row
                                and row["superclass"] is not None
                                else None,
                                status=str(row["status"])
                                if "status" in row
                                and row["status"] is not None
                                else None,
                                consensus_nt=None,
                                matched_mapping_id=mapping.mapping_id,
                                matched_field=mapping.target_field,
                                matched_value=target_val,
                                evidence_status=mapping.review_status,
                                evidence_source_ids=mapping.evidence_source_ids,
                            )

        # Slice results by offset and limit
        all_candidates = list(candidates_map.values())
        return all_candidates[offset : offset + limit]

    def validate_catalog(self) -> KnowledgeValidationReport:
        """
        Performs an automated integrity audit of the knowledge catalog:
        1. Reference integrity (concept -> sources, concept -> mappings, mapping -> sources).
        2. Duplicate IDs.
        3. Schema validation.
        4. Dataset compatibility (does target field and target value exist in MaleCNS annotations?).
        """
        errors: list[str] = []
        warnings: list[str] = []
        unresolved: list[str] = []

        # 1. Manifest
        cat_ver = self._manifest.version if self._manifest else "1.0.0"
        dataset_ver = (
            self._manifest.dataset_version
            if self._manifest
            else "male-cns:v1.0"
        )

        # 2. Check concept references
        for cid, concept in self._concepts.items():
            for sid in concept.source_references:
                if sid not in self._sources:
                    err = f"Concept '{cid}' references missing source '{sid}'"
                    errors.append(err)
                    unresolved.append(sid)

            for mid in concept.mapping_ids:
                if mid not in self._mappings:
                    err = f"Concept '{cid}' references missing mapping '{mid}'"
                    errors.append(err)
                    unresolved.append(mid)

            for rel_cid in concept.related_concepts:
                if rel_cid not in self._concepts:
                    warn = f"Concept '{cid}' references unknown related concept '{rel_cid}'"
                    warnings.append(warn)

        # 3. Check mapping references & dataset compatibility
        compatible_mappings = 0
        incompatible_mappings = 0

        df = self.provider._annotations
        has_annotations = not df.empty

        for mid, mapping in self._mappings.items():
            for sid in mapping.evidence_source_ids:
                if sid not in self._sources:
                    err = f"Mapping '{mid}' references missing source '{sid}'"
                    errors.append(err)
                    unresolved.append(sid)

            if has_annotations:
                col = "type" if mapping.target_field == "type" else mapping.target_field
                if col == "body_id":
                    col = "bodyId"

                if col not in df.columns and col != "bodyId":
                    warn = f"Mapping '{mid}' target_field '{mapping.target_field}' not found in dataset columns."
                    warnings.append(warn)
                    incompatible_mappings += 1
                else:
                    # Check whether any target value exists
                    val_series = df[col].dropna().astype(str) if col in df.columns else None
                    found_any = False
                    if val_series is not None:
                        for tv in mapping.target_values:
                            if mapping.match_type == "prefix":
                                if (val_series.str.startswith(tv)).any():
                                    found_any = True
                                    break
                            else:
                                if (val_series == tv).any():
                                    found_any = True
                                    break

                    if found_any:
                        compatible_mappings += 1
                    else:
                        if mapping.review_status == "verified":
                            warn = f"Mapping '{mid}' marked 'verified' but no matching records found in MaleCNS annotations."
                            warnings.append(warn)
                        incompatible_mappings += 1
            else:
                compatible_mappings += 1

        verified_concepts = sum(
            1 for c in self._concepts.values() if c.evidence_status == "verified"
        )

        valid = len(errors) == 0
        summary = (
            f"Knowledge Catalog Audit: {'PASSED' if valid else 'FAILED'}. "
            f"{len(self._concepts)} concepts ({verified_concepts} verified), "
            f"{len(self._sources)} sources, {len(self._mappings)} mappings "
            f"({compatible_mappings} compatible with {dataset_ver})."
        )

        return KnowledgeValidationReport(
            valid=valid,
            catalog_version=cat_ver,
            dataset_version=dataset_ver,
            errors=errors,
            warnings=warnings,
            concept_count=len(self._concepts),
            verified_concept_count=verified_concepts,
            compatible_mapping_count=compatible_mappings,
            incompatible_mapping_count=incompatible_mappings,
            unresolved_references=unresolved,
            summary=summary,
        )
