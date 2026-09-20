from __future__ import annotations

import heapq
import json
import math
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow.ipc as ipc


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = Path(os.environ.get("MALECNS_RAW_DIR", ROOT.parent / "outputs" / "malecns-connectome"))
OUT_DIR = ROOT / "data" / "demo"
PROCESSED_DIR = ROOT / "data" / "processed"

ANNOTATIONS = RAW_DIR / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
BODY_NT = RAW_DIR / "body-neurotransmitters-male-cns-v1.0.feather"
BODY_STATS = RAW_DIR / "body-stats-male-cns-v1.0-minconf-0.5.feather"
WEIGHTS = RAW_DIR / "connectome-weights-male-cns-v1.0-minconf-0.5.feather"

SEED_COUNT = int(os.environ.get("BRAINDEBUGGER_SEED_COUNT", "650"))
TOP_K_PER_DIRECTION = int(os.environ.get("BRAINDEBUGGER_TOP_K", "80"))
STATS_ROWS = int(os.environ.get("BRAINDEBUGGER_STATS_ROWS", "25000"))


def clean(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if hasattr(value, "item"):
        return clean(value.item())
    if isinstance(value, list):
        return [clean(item) for item in value]
    return value


def read_stats() -> pd.DataFrame:
    parts = []
    rows = 0
    with ipc.open_file(BODY_STATS) as reader:
        for batch_idx in range(reader.num_record_batches):
            batch = reader.get_batch(batch_idx)
            parts.append(batch.to_pandas())
            rows += batch.num_rows
            if rows >= STATS_ROWS:
                break
    frame = pd.concat(parts, ignore_index=True).head(STATS_ROWS)
    return frame.drop_duplicates("body")


def read_annotations(bodies: set[int]) -> dict[int, dict[str, Any]]:
    columns = [
        "bodyId",
        "type",
        "instance",
        "superclass",
        "class",
        "subclass",
        "rootSide",
        "somaSide",
        "somaNeuromere",
        "status",
        "statusLabel",
        "hemibrainType",
        "receptorType",
        "synonyms",
    ]
    frame = pd.read_feather(ANNOTATIONS, columns=columns)
    frame = frame[frame["bodyId"].isin(bodies)]
    return {
        int(row["bodyId"]): {key: clean(value) for key, value in row.items()}
        for row in frame.to_dict(orient="records")
    }


def read_neurotransmitters(bodies: set[int]) -> dict[int, dict[str, Any]]:
    columns = [
        "body",
        "cell_type",
        "predicted_nt",
        "predicted_nt_confidence",
        "consensus_nt",
        "total_nt_predictions",
    ]
    parts = []
    with ipc.open_file(BODY_NT) as reader:
        for idx in range(reader.num_record_batches):
            frame = reader.get_batch(idx).to_pandas()[columns]
            frame = frame[frame["body"].isin(bodies)]
            if not frame.empty:
                parts.append(frame)
    if not parts:
        return {}
    frame = pd.concat(parts, ignore_index=True)
    frame = frame.sort_values("total_nt_predictions", ascending=False).drop_duplicates("body")
    return {
        int(row["body"]): {key: clean(value) for key, value in row.items()}
        for row in frame.to_dict(orient="records")
    }


def push_heap(store: dict[int, list[tuple[int, int, int]]], key: int, item: tuple[int, int, int]) -> None:
    heap = store[key]
    if len(heap) < TOP_K_PER_DIRECTION:
        heapq.heappush(heap, item)
    elif item[0] > heap[0][0]:
        heapq.heapreplace(heap, item)


def scan_weights(seed_bodies: set[int]) -> list[dict[str, int]]:
    incoming: dict[int, list[tuple[int, int, int]]] = defaultdict(list)
    outgoing: dict[int, list[tuple[int, int, int]]] = defaultdict(list)
    with ipc.open_file(WEIGHTS) as reader:
        for batch_idx in range(reader.num_record_batches):
            frame = reader.get_batch(batch_idx).to_pandas()
            hits = frame[frame["body_pre"].isin(seed_bodies) | frame["body_post"].isin(seed_bodies)]
            for row in hits.itertuples(index=False):
                pre = int(row.body_pre)
                post = int(row.body_post)
                weight = int(row.weight)
                if pre in seed_bodies:
                    push_heap(outgoing, pre, (weight, pre, post))
                if post in seed_bodies:
                    push_heap(incoming, post, (weight, pre, post))
            if batch_idx % 250 == 0:
                print(f"Scanned weight batch {batch_idx + 1}/{reader.num_record_batches}", flush=True)

    edges = {(pre, post): weight for heap in outgoing.values() for weight, pre, post in heap}
    edges.update({(pre, post): weight for heap in incoming.values() for weight, pre, post in heap})
    return [
        {"source": pre, "target": post, "weight": weight}
        for (pre, post), weight in sorted(edges.items(), key=lambda item: item[1], reverse=True)
    ]


def region_for(annotation: dict[str, Any], stats_row: dict[str, Any] | None = None) -> str:
    for key in ("somaNeuromere", "superclass", "class"):
        value = annotation.get(key)
        if value:
            return str(value)
    if stats_row:
        for key in ("superclass", "class"):
            value = stats_row.get(key)
            if value:
                return str(value)
    return "unclassified"


def main() -> None:
    for path in (OUT_DIR, PROCESSED_DIR):
        path.mkdir(parents=True, exist_ok=True)

    stats = read_stats()
    seed_bodies = set(int(body) for body in stats.head(SEED_COUNT)["body"].tolist())
    annotations = read_annotations(seed_bodies)
    neurotransmitters = read_neurotransmitters(seed_bodies)
    edges = scan_weights(seed_bodies)

    edge_nodes = {edge["source"] for edge in edges} | {edge["target"] for edge in edges}
    all_bodies = seed_bodies | edge_nodes
    stats_by_body = {
        int(row["body"]): {key: clean(value) for key, value in row.items()}
        for row in stats[stats["body"].isin(all_bodies)].to_dict(orient="records")
    }
    annotations.update(read_annotations(all_bodies - set(annotations)))
    neurotransmitters.update(read_neurotransmitters(all_bodies - set(neurotransmitters)))

    incoming_count: Counter[int] = Counter()
    outgoing_count: Counter[int] = Counter()
    incoming_weight: Counter[int] = Counter()
    outgoing_weight: Counter[int] = Counter()
    for edge in edges:
        outgoing_count[edge["source"]] += 1
        incoming_count[edge["target"]] += 1
        outgoing_weight[edge["source"]] += edge["weight"]
        incoming_weight[edge["target"]] += edge["weight"]

    neurons = []
    for body in sorted(all_bodies):
        annotation = annotations.get(body, {})
        stats_row = stats_by_body.get(body, {})
        nt = neurotransmitters.get(body, {})
        cell_type = annotation.get("type") or stats_row.get("type") or nt.get("cell_type")
        region = region_for(annotation, stats_row)
        neurons.append(
            {
                "id": str(body),
                "bodyId": body,
                "cellType": cell_type or "unclassified",
                "instance": annotation.get("instance") or stats_row.get("instance"),
                "region": region,
                "hemisphere": annotation.get("rootSide") or annotation.get("somaSide"),
                "superclass": annotation.get("superclass") or stats_row.get("superclass"),
                "status": annotation.get("status") or annotation.get("statusLabel"),
                "incomingPartners": int(incoming_count[body]),
                "outgoingPartners": int(outgoing_count[body]),
                "totalIncomingWeight": int(incoming_weight[body]),
                "totalOutgoingWeight": int(outgoing_weight[body]),
                "predictedNt": nt.get("predicted_nt") or nt.get("consensus_nt"),
                "predictedNtConfidence": nt.get("predicted_nt_confidence"),
                "annotation": annotation,
                "provenance": {
                    "metadata": "body-annotations-male-cns-v1.0-minconf-0.5.feather",
                    "connectivity": "connectome-weights-male-cns-v1.0-minconf-0.5.feather",
                    "neurotransmitter": "body-neurotransmitters-male-cns-v1.0.feather",
                },
            }
        )

    neuron_map = {neuron["bodyId"]: neuron for neuron in neurons}
    for edge in edges:
        source = neuron_map.get(edge["source"], {})
        target = neuron_map.get(edge["target"], {})
        edge["sourceRegion"] = source.get("region", "unclassified")
        edge["targetRegion"] = target.get("region", "unclassified")
        edge["sourceCellType"] = source.get("cellType", "unclassified")
        edge["targetCellType"] = target.get("cellType", "unclassified")
        edge["predictedNt"] = source.get("predictedNt")

    region_counts = Counter(neuron["region"] for neuron in neurons)
    region_connections = Counter()
    region_cell_types: dict[str, Counter[str]] = defaultdict(Counter)
    for neuron in neurons:
        region_cell_types[neuron["region"]][neuron["cellType"]] += 1
    for edge in edges:
        region_connections[edge["sourceRegion"]] += 1
        region_connections[edge["targetRegion"]] += 1

    regions = [
        {
            "name": name,
            "neuronCount": count,
            "connectionCount": int(region_connections[name]),
            "mostCommonCellTypes": [
                {"cellType": cell_type, "count": cell_count}
                for cell_type, cell_count in region_cell_types[name].most_common(5)
            ],
        }
        for name, count in sorted(region_counts.items())
    ]

    index = {
        "summary": {
            "dataset": "Janelia MaleCNS v1.0",
            "mode": "demo-subset",
            "indexedAt": datetime.now(timezone.utc).isoformat(),
            "rawPath": str(RAW_DIR),
            "indexedNeurons": len(neurons),
            "indexedConnections": len(edges),
            "availableRegions": len(regions),
            "seedCount": SEED_COUNT,
            "topKPerDirection": TOP_K_PER_DIRECTION,
            "sourceRows": {
                "bodyAnnotations": 211577,
                "bodyNeurotransmitters": 1835518,
                "bodyStats": 88384522,
                "connectomeWeights": 151856684,
                "synPartners": 311833243,
                "synPoints": 357489383,
                "tbarNeurotransmitters": 45656140,
            },
            "scientificScope": [
                "Graph weights are structural synapse counts, not physiological signal strengths.",
                "Predicted neurotransmitters do not by themselves establish excitatory or inhibitory effects.",
                "Paths through the graph are computational hypotheses, not validated biological routes.",
            ],
        },
        "neurons": neurons,
        "connections": edges,
        "regions": regions,
    }
    target = OUT_DIR / "index.json"
    target.write_text(json.dumps(index, indent=2), encoding="utf-8")
    (PROCESSED_DIR / "README.md").write_text(
        "# Processed Data\n\n"
        "BrainDebugger v1.0 stores a real, reproducible demo subset in `data/demo/index.json`.\n"
        "Run `python scripts/preprocess_data.py` after downloading the MaleCNS Feather files.\n",
        encoding="utf-8",
    )
    print(f"Wrote {target} with {len(neurons)} neurons and {len(edges)} connections")


if __name__ == "__main__":
    main()
