from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "BrainDebugger"
    dataset_path: Path = Path(__file__).resolve().parents[4] / "data" / "demo" / "index.json"
    api_prefix: str = "/api"


settings = Settings()
