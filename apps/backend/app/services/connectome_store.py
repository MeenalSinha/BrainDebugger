from __future__ import annotations

import csv
import io
import json
import re
import statistics
import time
from collections import defaultdict
from pathlib import Path
from typing import Any


VALID_CONNECTION_SORTS = {"weight_desc", "weight_asc", "source_region", "target_region", "neuron_id"}
SEARCH_FIELDS = ("id", "cellType", "instance", "region", "superclass", "predictedNt")


def normalize_search(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


class ConnectomeStore:
    def __init__(self, path: Path):
        self.path = path
        self.summary: dict[str, Any] = {}
        self.neurons: dict[str, dict[str, Any]] = {}
        self.connections: list[dict[str, Any]] = []
        self.regions: list[dict[str, Any]] = []
        self.incoming: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.outgoing: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.search_documents: dict[str, str] = {}
        self.search_tokens: dict[str, set[str]] = defaultdict(set)
        self.search_ngrams: dict[str, set[str]] = defaultdict(set)
        self.loaded_at = 0.0

    def load(self) -> None:
        started = time.perf_counter()
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        self.summary = payload["summary"]
        self.neurons = {str(neuron["bodyId"]): neuron for neuron in payload["neurons"]}
        self.connections = payload["connections"]
        self.regions = payload["regions"]
        self.incoming.clear()
        self.outgoing.clear()
        for edge in self.connections:
            source = str(edge["source"])
            target = str(edge["target"])
            self.outgoing[source].append(edge)
            self.incoming[target].append(edge)
        for collection in (self.incoming, self.outgoing):
            for edges in collection.values():
                edges.sort(key=lambda edge: edge["weight"], reverse=True)
        self.build_search_index()
        self.loaded_at = time.perf_counter() - started

    def dataset_summary(self) -> dict[str, Any]:
        return {
            **self.summary,
            "apiIndexLoadSeconds": round(self.loaded_at, 3),
            "searchIndex": {
                "strategy": "normalized-token-and-trigram-prefilter-with-substring-match",
                "fields": list(SEARCH_FIELDS),
                "documents": len(self.search_documents),
            },
        }

    def build_search_index(self) -> None:
        self.search_documents.clear()
        self.search_tokens.clear()
        self.search_ngrams.clear()
        for neuron in self.neurons.values():
            neuron_id = str(neuron["id"])
            values = [neuron.get(field) for field in SEARCH_FIELDS]
            document = normalize_search(" ".join(str(value or "") for value in values))
            self.search_documents[neuron_id] = document
            for token in set(re.findall(r"[a-z0-9_.:-]+", document)):
                prefixes = {token[:idx] for idx in range(1, min(len(token), 12) + 1)}
                for prefix in prefixes:
                    self.search_tokens[prefix].add(neuron_id)
                for start in range(max(0, len(token) - 2)):
                    self.search_ngrams[token[start : start + 3]].add(neuron_id)

    def get_neuron(self, neuron_id: str) -> dict[str, Any] | None:
        return self.neurons.get(str(neuron_id))

    def search(self, query: str = "", region: str | None = None, cell_type: str | None = None, limit: int = 25) -> list[dict[str, Any]]:
        query = normalize_search(query)
        candidate_ids: list[str]
        if query:
            tokens = re.findall(r"[a-z0-9_.:-]+", query)
            if tokens and any(len(token) >= 3 for token in tokens):
                candidates: set[str] | None = None
                for token in tokens:
                    if len(token) < 3:
                        continue
                    for start in range(len(token) - 2):
                        ids = self.search_ngrams.get(token[start : start + 3], set())
                        candidates = set(ids) if candidates is None else candidates & ids
                candidate_ids = sorted(candidates or [], key=lambda item: int(item) if item.isdigit() else item)
            else:
                candidate_ids = list(self.neurons)
        else:
            candidate_ids = list(self.neurons)
        results = []
        for neuron_id in candidate_ids:
            neuron = self.neurons[neuron_id]
            if query and query not in self.search_documents.get(neuron_id, ""):
                continue
            if region and neuron.get("region") != region:
                continue
            if cell_type and neuron.get("cellType") != cell_type:
                continue
            results.append(self.compact_neuron(neuron))
            if len(results) >= limit:
                break
        return results

    def compact_neuron(self, neuron: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": neuron["id"],
            "bodyId": neuron["bodyId"],
            "cellType": neuron.get("cellType"),
            "region": neuron.get("region"),
            "hemisphere": neuron.get("hemisphere"),
            "incomingPartners": neuron.get("incomingPartners", 0),
            "outgoingPartners": neuron.get("outgoingPartners", 0),
            "predictedNt": neuron.get("predictedNt"),
            "status": neuron.get("status"),
        }

    def connection_rows(
        self,
        neuron_id: str,
        direction: str,
        page: int = 1,
        page_size: int = 25,
        search: str = "",
        sort: str = "weight_desc",
    ) -> tuple[list[dict[str, Any]], int]:
        if sort not in VALID_CONNECTION_SORTS:
            raise ValueError(f"Unsupported connection sort: {sort}")
        edges = self.incoming[str(neuron_id)] if direction == "incoming" else self.outgoing[str(neuron_id)]
        rows = [self.enrich_edge(edge) for edge in edges]
        if search:
            needle = search.lower()
            rows = [
                row
                for row in rows
                if needle in str(row["source"]).lower()
                or needle in str(row["target"]).lower()
                or needle in str(row.get("sourceCellType", "")).lower()
                or needle in str(row.get("targetCellType", "")).lower()
            ]
        reverse = sort != "weight_asc"
        if sort in {"weight_desc", "weight_asc"}:
            rows.sort(key=lambda row: row["weight"], reverse=reverse)
        elif sort == "source_region":
            rows.sort(key=lambda row: row.get("sourceRegion") or "")
        elif sort == "target_region":
            rows.sort(key=lambda row: row.get("targetRegion") or "")
        elif sort == "neuron_id":
            rows.sort(key=lambda row: (row["source"], row["target"]))
        total = len(rows)
        start = max(page - 1, 0) * page_size
        return rows[start : start + page_size], total

    def all_connection_rows(self, neuron_id: str, direction: str, search: str = "", sort: str = "weight_desc") -> list[dict[str, Any]]:
        rows, total = self.connection_rows(neuron_id, direction, page=1, page_size=max(1, len(self.connections)), search=search, sort=sort)
        return rows[:total]

    def enrich_edge(self, edge: dict[str, Any]) -> dict[str, Any]:
        source = self.neurons.get(str(edge["source"]), {})
        target = self.neurons.get(str(edge["target"]), {})
        return {
            **edge,
            "sourceCellType": source.get("cellType", edge.get("sourceCellType")),
            "sourceRegion": source.get("region", edge.get("sourceRegion")),
            "targetCellType": target.get("cellType", edge.get("targetCellType")),
            "targetRegion": target.get("region", edge.get("targetRegion")),
            "sourcePredictedNt": source.get("predictedNt"),
            "targetPredictedNt": target.get("predictedNt"),
            "provenance": "connectome-weights-male-cns-v1.0-minconf-0.5.feather",
            "scopeNote": "Weight is a structural synapse-count measure, not a physiological signal-strength estimate.",
        }

    def connection(self, source: str, target: str) -> dict[str, Any] | None:
        for edge in self.outgoing.get(str(source), []):
            if str(edge["target"]) == str(target):
                return self.enrich_edge(edge)
        return None

    def neighborhood(self, neuron_id: str, direction: str = "both", max_nodes: int = 50) -> dict[str, Any]:
        max_nodes = min(max(max_nodes, 1), 250)
        center = str(neuron_id)
        edge_pool = []
        if direction in {"both", "incoming"}:
            edge_pool.extend(self.incoming.get(center, []))
        if direction in {"both", "outgoing"}:
            edge_pool.extend(self.outgoing.get(center, []))
        edge_pool.sort(key=lambda edge: edge["weight"], reverse=True)

        nodes = {center}
        selected_edges = []
        for edge in edge_pool:
            source = str(edge["source"])
            target = str(edge["target"])
            needed = {source, target} - nodes
            if len(nodes) + len(needed) > max_nodes:
                continue
            nodes.update(needed)
            selected_edges.append(self.enrich_edge(edge))
            if len(nodes) >= max_nodes:
                break
        available_nodes = {center} | {str(e["source"]) for e in edge_pool} | {str(e["target"]) for e in edge_pool}

        return {
            "nodes": [self.compact_neuron(self.neurons[node]) for node in nodes if node in self.neurons],
            "edges": selected_edges,
            "showing": len(nodes),
            "available": len(available_nodes),
            "truncated": len(nodes) < len(available_nodes),
        }

    def statistics(self, neuron_id: str) -> dict[str, Any] | None:
        neuron = self.get_neuron(neuron_id)
        if not neuron:
            return None
        edges = self.incoming[str(neuron_id)] + self.outgoing[str(neuron_id)]
        weights = [edge["weight"] for edge in edges]
        connected_ids = {str(edge["source"]) for edge in edges} | {str(edge["target"]) for edge in edges}
        connected_ids.discard(str(neuron_id))
        regions = {self.neurons[node].get("region") for node in connected_ids if node in self.neurons}
        cell_types = {self.neurons[node].get("cellType") for node in connected_ids if node in self.neurons}
        incoming_degree = len(self.incoming[str(neuron_id)])
        outgoing_degree = len(self.outgoing[str(neuron_id)])
        return {
            "inDegree": incoming_degree,
            "outDegree": outgoing_degree,
            "totalDegree": incoming_degree + outgoing_degree,
            "averageConnectionWeight": round(statistics.mean(weights), 2) if weights else 0,
            "maxConnectionWeight": max(weights) if weights else 0,
            "uniqueConnectedRegions": len({region for region in regions if region}),
            "uniqueConnectedCellTypes": len({cell for cell in cell_types if cell}),
            "incomingOutgoingRatio": round(incoming_degree / outgoing_degree, 3) if outgoing_degree else None,
            "metricScope": "Structural graph metrics over indexed demo-subset connections.",
        }

    def export_report(self, neuron_id: str, fmt: str) -> str:
        neuron = self.get_neuron(neuron_id)
        if not neuron:
            raise KeyError(neuron_id)
        incoming, _ = self.connection_rows(neuron_id, "incoming", page_size=10)
        outgoing, _ = self.connection_rows(neuron_id, "outgoing", page_size=10)
        stats = self.statistics(neuron_id)
        if fmt == "json":
            return json.dumps({"neuron": neuron, "statistics": stats, "topIncoming": incoming, "topOutgoing": outgoing}, indent=2)
        if fmt == "csv":
            return self.connections_csv(incoming, "incoming", include_direction=True) + self.connections_csv(outgoing, "outgoing", include_header=False, include_direction=True)
        return self.markdown_report(neuron, stats, incoming, outgoing)

    def connections_csv(
        self,
        rows: list[dict[str, Any]],
        direction: str,
        *,
        include_header: bool = True,
        include_direction: bool = False,
    ) -> str:
        buffer = io.StringIO()
        fields = ["source", "target", "weight", "sourceCellType", "sourceRegion", "sourcePredictedNt", "targetCellType", "targetRegion", "targetPredictedNt", "provenance"]
        if include_direction:
            fields = ["direction", *fields]
        writer = csv.DictWriter(buffer, fieldnames=fields, extrasaction="ignore")
        if include_header:
            writer.writeheader()
        for row in rows:
            payload = {key: row.get(key) for key in fields}
            if include_direction:
                payload["direction"] = direction
            writer.writerow(payload)
        return buffer.getvalue()

    def markdown_report(self, neuron: dict[str, Any], stats: dict[str, Any] | None, incoming: list[dict[str, Any]], outgoing: list[dict[str, Any]]) -> str:
        lines = [
            f"# BrainDebugger Neuron Analysis Report - {neuron['id']}",
            "",
            "## Metadata",
            f"- Cell type: {neuron.get('cellType')}",
            f"- Region: {neuron.get('region')}",
            f"- Predicted neurotransmitter: {neuron.get('predictedNt')}",
            f"- Dataset: {self.summary.get('dataset')}",
            f"- Mode: {self.summary.get('mode')}",
            "",
            "## Structural Graph Statistics",
        ]
        for key, value in (stats or {}).items():
            lines.append(f"- {key}: {value}")
        lines.extend(["", "## Top Incoming Connections"])
        lines.extend(f"- {row['source']} -> {row['target']} weight {row['weight']}" for row in incoming)
        lines.extend(["", "## Top Outgoing Connections"])
        lines.extend(f"- {row['source']} -> {row['target']} weight {row['weight']}" for row in outgoing)
        lines.extend(
            [
                "",
                "## Scientific Limitations",
                "- Synapse counts are structural graph measurements, not direct physiological signal strengths.",
                "- Predicted neurotransmitters do not automatically establish excitatory or inhibitory effect.",
                "- Graph paths are exploratory computational routes, not validated biological pathways.",
            ]
        )
        return "\n".join(lines)
