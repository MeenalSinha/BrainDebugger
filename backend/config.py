"""
BrainDebugger — Central Configuration Module

Reads all application settings from environment variables.
Never scatter os.environ or os.getenv calls elsewhere in the codebase.

Environment variables:
  DATA_DIR          Absolute path to the directory containing the local
                    MaleCNS v1.0 Feather data files.
                    Default: ./data (relative to the working directory)

  NEUPRINT_SERVER   Optional: neuPrint server URL for live API access.
                    Example: https://neuprint.janelia.org
  NEUPRINT_DATASET  Optional: neuPrint dataset identifier.
                    Default: male-cns:v1.0
  NEUPRINT_TOKEN    Optional: neuPrint API bearer token.
                    If omitted, the local Feather files are used exclusively.

  MAX_SEARCH_RESULTS  Maximum neurons returned per search query. Default: 100.
  MAX_CONNECTIONS     Maximum connections returned per partner query. Default: 500.
  MAX_GRAPH_NODES     Maximum nodes in a single graph response. Default: 150.
  HTTP_TIMEOUT        HTTP timeout in seconds for neuPrint calls. Default: 30.
  CACHE_TTL_SECONDS   Response cache lifetime in seconds. Default: 300.
  LOG_LEVEL           Logging level (DEBUG, INFO, WARNING, ERROR). Default: INFO.

Do not add real credentials to .env.example or source control.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env from the project root (parent of this file's directory).
_project_root = Path(__file__).resolve().parent.parent
load_dotenv(_project_root / ".env", override=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Data ────────────────────────────────────────────────────────────────
    data_dir: Path = _project_root / "data"

    # ── neuPrint (all optional; local Feather files used when absent) ───────
    neuprint_server: Optional[str] = None
    neuprint_dataset: str = "male-cns:v1.0"
    neuprint_token: Optional[str] = None

    # ── NeuroQuery LLM Provider (V7) ──────────────────────────────────────────
    neuroquery_llm_provider: str = "mock"
    neuroquery_llm_base_url: Optional[str] = None
    neuroquery_llm_model: str = "gpt-4o"
    neuroquery_llm_api_key: Optional[str] = None
    neuroquery_llm_timeout_seconds: int = 15
    neuroquery_llm_max_retries: int = 2

    # ── Limits ───────────────────────────────────────────────────────────────
    max_search_results: int = 100
    max_connections: int = 500
    max_graph_nodes: int = 150
    http_timeout: int = 30

    # ── Cache ────────────────────────────────────────────────────────────────
    cache_ttl_seconds: int = 300

    # ── Logging ──────────────────────────────────────────────────────────────
    log_level: str = "INFO"

    # ── Derived ──────────────────────────────────────────────────────────────
    @property
    def neuprint_configured(self) -> bool:
        """True only when all three neuPrint settings are present."""
        return bool(
            self.neuprint_server and self.neuprint_token
        )

    @property
    def local_data_available(self) -> bool:
        """True when the expected local data directory contains Feather files."""
        return (
            self.data_dir.is_dir()
            and any(self.data_dir.glob("*.feather"))
        )

    # ── Validators ───────────────────────────────────────────────────────────
    @field_validator("max_search_results", "max_connections", "max_graph_nodes", mode="before")
    @classmethod
    def _positive_int(cls, v: object) -> int:
        val = int(v)
        if val < 1:
            raise ValueError("Limit must be a positive integer.")
        return val

    @field_validator("http_timeout", mode="before")
    @classmethod
    def _positive_timeout(cls, v: object) -> int:
        val = int(v)
        if val < 1:
            raise ValueError("HTTP timeout must be at least 1 second.")
        return val

    @field_validator("log_level", mode="before")
    @classmethod
    def _valid_log_level(cls, v: object) -> str:
        level = str(v).upper()
        if level not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
            raise ValueError(f"Invalid log level: {v!r}")
        return level

    @model_validator(mode="after")
    def _check_data_source(self) -> "Settings":
        """
        Raise a clear startup error when neither a local dataset nor a
        configured neuPrint connection is available.
        """
        if not self.local_data_available and not self.neuprint_configured:
            raise ValueError(
                "No data source is available.\n"
                "Either:\n"
                "  • Place the MaleCNS v1.0 Feather files in DATA_DIR "
                f"({self.data_dir}), or\n"
                "  • Set NEUPRINT_SERVER, NEUPRINT_DATASET, and NEUPRINT_TOKEN "
                "in your .env file."
            )
        return self

    def safe_repr(self) -> dict:
        """Return a dict suitable for logging (never includes secrets)."""
        return {
            "data_dir": str(self.data_dir),
            "local_data_available": self.local_data_available,
            "neuprint_server": self.neuprint_server or "(not set)",
            "neuprint_dataset": self.neuprint_dataset,
            "neuprint_token": "(set)" if self.neuprint_token else "(not set)",
            "neuprint_configured": self.neuprint_configured,
            "max_search_results": self.max_search_results,
            "max_connections": self.max_connections,
            "max_graph_nodes": self.max_graph_nodes,
            "http_timeout": self.http_timeout,
            "cache_ttl_seconds": self.cache_ttl_seconds,
            "log_level": self.log_level,
            "neuroquery_llm_provider": self.neuroquery_llm_provider,
            "neuroquery_llm_model": self.neuroquery_llm_model,
            "neuroquery_llm_api_key": "(set)" if self.neuroquery_llm_api_key else "(not set)",
            "neuroquery_llm_timeout_seconds": self.neuroquery_llm_timeout_seconds,
        }


# ── Module-level singleton ───────────────────────────────────────────────────
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """
    Return the application-wide Settings singleton.
    Call this instead of importing Settings directly so that test code can
    override the singleton without monkey-patching environment variables.
    """
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def configure_logging(settings: Settings) -> None:
    """Apply the log level from settings to the root logger."""
    numeric_level = getattr(logging, settings.log_level, logging.INFO)
    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )
