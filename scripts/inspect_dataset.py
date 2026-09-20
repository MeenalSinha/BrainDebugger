from __future__ import annotations

import json
from pathlib import Path

import pyarrow.ipc as ipc


RAW_DIR = Path(__file__).resolve().parents[2] / "outputs" / "malecns-connectome"
OUT = Path(__file__).resolve().parents[1] / "docs" / "schema-audit.json"


def inspect_file(path: Path) -> dict:
    with ipc.open_file(path) as reader:
        rows = sum(reader.get_batch(i).num_rows for i in range(reader.num_record_batches))
        fields = [{"name": field.name, "type": str(field.type)} for field in reader.schema]
        sample = reader.get_batch(0).slice(0, 3).to_pandas().where(lambda frame: frame.notna(), None)
        return {
            "file": path.name,
            "rows": rows,
            "columns": fields,
            "sample": sample.astype(str).to_dict(orient="records"),
        }


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    audit = {
        "dataset": "Janelia MaleCNS v1.0",
        "raw_dir": str(RAW_DIR),
        "files": [inspect_file(path) for path in sorted(RAW_DIR.glob("*.feather"))],
    }
    OUT.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
