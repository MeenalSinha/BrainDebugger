from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class Metadata(BaseModel):
    source: str = "Janelia MaleCNS v1.0"
    computed: bool = False
    mode: str = "demo-subset"
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    query_ms: float | None = None
    truncated: bool = False
    total: int | None = None


class ApiResponse(BaseModel):
    data: Any
    metadata: Metadata
