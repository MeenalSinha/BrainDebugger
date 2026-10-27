"""
BrainDebugger — NeuroQuery Knowledge Catalog Validator Script

Validates the biological knowledge catalog against schema, references, and dataset annotations.
Can run in CI / local development.

Usage:
    python scripts/validate_knowledge.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.config import get_settings
from backend.data_provider import LocalFeatherProvider
from backend.knowledge_service import KnowledgeService


def main() -> int:
    print("=" * 65)
    print("  NeuroQuery Biological Knowledge Catalog Validator")
    print("=" * 65)

    settings = get_settings()
    data_dir = Path(settings.data_dir)
    knowledge_dir = data_dir / "knowledge"

    if not knowledge_dir.exists():
        knowledge_dir = ROOT_DIR / "data" / "knowledge"

    print(f"Knowledge Catalog Path: {knowledge_dir}")
    print(f"Dataset Path:           {data_dir}")
    print()

    # Load provider
    provider = LocalFeatherProvider(str(data_dir))
    if data_dir.exists():
        try:
            print("Loading dataset annotations for compatibility check...")
            provider.load()
        except Exception as e:
            print(f"Notice: Could not load full dataset ({e}). Running reference checks only.")

    service = KnowledgeService(provider, knowledge_dir=knowledge_dir)
    report = service.validate_catalog()

    print(f"Catalog Version:        {report.catalog_version}")
    print(f"Dataset Version:        {report.dataset_version}")
    print(f"Total Concepts:         {report.concept_count} ({report.verified_concept_count} verified)")
    print(f"Compatible Mappings:    {report.compatible_mapping_count}")
    print(f"Incompatible Mappings:  {report.incompatible_mapping_count}")
    print()

    if report.warnings:
        print(f"Warnings ({len(report.warnings)}):")
        for w in report.warnings:
            print(f"  [WARN] {w}")
        print()

    if report.errors:
        print(f"Errors ({len(report.errors)}):")
        for err in report.errors:
            print(f"  [ERROR] {err}")
        print()
        print("Knowledge catalog validation FAILED.")
        return 1

    print("Knowledge catalog validation PASSED.")
    print(f"Summary: {report.summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
