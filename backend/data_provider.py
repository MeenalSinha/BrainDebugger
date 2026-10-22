"""
BrainDebugger — Local Feather Data Provider

Reads the MaleCNS v1.0 dataset from the locally downloaded Feather files.
This is the primary data source when NEUPRINT_TOKEN is not configured.

The local files are the official CC BY-licensed dataset downloads from:
  https://www.janelia.org/project-team/flyem/malecns

Dataset: male-cns:v1.0
Attribution: Schlegel et al., Whole-brain annotation and multi-connectome
  cell typing of Drosophila, Nature 634, 139–152 (2024).

Files used (from DATA_DIR):
  body-annotations-male-cns-v1.0-minconf-0.5.feather
  connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather
  body-neurotransmitters-male-cns-v1.0.feather
  body-stats-male-cns-v1.0-minconf-0.5.feather

The provider is loaded once at startup (lazy singleton) and then kept in
memory.  The full connectome-weights file is NOT loaded into memory by
default; queries use efficient pandas filtering on the smaller
traced-only subset.
"""

from __future__ import annotations

import heapq
import logging
import math
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import pyarrow.feather as feather

from backend.config import Settings
from backend.models import (
    CascadeEdge,
    CascadeHopLayer,
    CascadeNode,
    Connection,
    ConnectionListResponse,
    ConnectivitySummaryResponse,
    DirectionalConnectivitySummary,
    DownstreamCascadeResponse,
    GraphEdge,
    GraphNode,
    GraphResponse,
    Neuron,
    NeuronSearchResponse,
    NeuronSearchResult,
    PathEdge,
    PathItem,
    PathNode,
    PathwaySearchResponse,
)

logger = logging.getLogger(__name__)

DATASET_NAME = "male-cns:v1.0"
DATASET_ATTRIBUTION = (
    "Schlegel et al., Whole-brain annotation and multi-connectome cell typing "
    "of Drosophila, Nature 634, 139–152 (2024). CC BY 4.0."
)

# ── File names ────────────────────────────────────────────────────────────────
_ANNOTATIONS_FILE = "body-annotations-male-cns-v1.0-minconf-0.5.feather"
_WEIGHTS_FILE = "connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather"
_NT_FILE = "body-neurotransmitters-male-cns-v1.0.feather"
_STATS_FILE = "body-stats-male-cns-v1.0-minconf-0.5.feather"


def _nan_to_none(v: object) -> Optional[str]:
    """Convert pandas NaN / None to Python None; leave strings as-is."""
    if v is None:
        return None
    try:
        import math
        if isinstance(v, float) and math.isnan(v):
            return None
    except (TypeError, ValueError):
        pass
    s = str(v).strip()
    return s if s and s.lower() not in ("nan", "none", "<na>") else None


class LocalFeatherProvider:
    """
    Reads and queries the local MaleCNS v1.0 Feather files.

    Raises FileNotFoundError at construction time if a required file is missing.
    The caller (the service layer) is responsible for handling that exception.
    """

    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir
        self._annotations: pd.DataFrame = pd.DataFrame()
        self._weights: pd.DataFrame = pd.DataFrame()
        self._nt: pd.DataFrame = pd.DataFrame()
        self._stats: pd.DataFrame = pd.DataFrame()
        self._loaded = False

        # V3 Fast Graph Indexes
        self._pre_arr: np.ndarray = np.array([], dtype=np.int64)
        self._post_arr: np.ndarray = np.array([], dtype=np.int64)
        self._wt_arr: np.ndarray = np.array([], dtype=np.int64)
        self._type_pre_arr: np.ndarray = np.array([], dtype=object)
        self._type_post_arr: np.ndarray = np.array([], dtype=object)
        self._pre_index: dict[int, tuple[int, int]] = {}
        self._pre_total_weights: dict[int, int] = {}

    def _index_graph(self) -> None:
        """Build high-speed indexed adjacency structures over self._weights."""
        if self._weights.empty:
            return
        t_idx = time.monotonic()
        if not self._weights["body_pre"].is_monotonic_increasing:
            self._weights = self._weights.sort_values("body_pre").reset_index(drop=True)
        self._pre_arr = self._weights["body_pre"].to_numpy()
        self._post_arr = self._weights["body_post"].to_numpy()
        self._wt_arr = self._weights["weight"].to_numpy()
        self._type_pre_arr = (
            self._weights["type_pre"].to_numpy()
            if "type_pre" in self._weights.columns
            else np.array([None] * len(self._weights), dtype=object)
        )
        self._type_post_arr = (
            self._weights["type_post"].to_numpy()
            if "type_post" in self._weights.columns
            else np.array([None] * len(self._weights), dtype=object)
        )
        unique_pres, starts, counts = np.unique(self._pre_arr, return_index=True, return_counts=True)
        self._pre_index = {int(b): (int(s), int(s + c)) for b, s, c in zip(unique_pres, starts, counts)}
        self._pre_total_weights = {
            int(b): int(np.sum(self._wt_arr[s:e])) for b, (s, e) in self._pre_index.items()
        }
        logger.info(
            "Indexed graph adjacency: %d presynaptic neurons in %.2fs",
            len(self._pre_index),
            time.monotonic() - t_idx,
        )

    def _ensure_graph_indexed(self) -> None:
        """Ensure adjacency structures are populated even if load() was bypassed (e.g. unit tests)."""
        if not self._pre_index and not self._weights.empty:
            self._index_graph()

    def load(self) -> None:
        """Load required files into memory.  Call once at startup."""
        t0 = time.monotonic()
        logger.info("Loading MaleCNS local Feather files from %s", self._data_dir)

        ann_path = self._data_dir / _ANNOTATIONS_FILE
        wt_path = self._data_dir / _WEIGHTS_FILE
        nt_path = self._data_dir / _NT_FILE
        stats_path = self._data_dir / _STATS_FILE

        for p in (ann_path, wt_path, nt_path):
            if not p.exists():
                raise FileNotFoundError(
                    f"Required data file not found: {p}\n"
                    "Place the MaleCNS v1.0 Feather files in DATA_DIR."
                )

        # Annotations — 211 K rows, 36 columns
        self._annotations = feather.read_table(ann_path).to_pandas()
        self._annotations = self._annotations.set_index("bodyId", drop=False)
        logger.info("Loaded annotations: %d rows", len(self._annotations))

        # Connectome weights (traced-only subset to stay within memory budget)
        self._weights = feather.read_table(wt_path).to_pandas()
        logger.info("Loaded weights: %d rows", len(self._weights))
        self._index_graph()

        # Neurotransmitters — optional
        if nt_path.exists():
            self._nt = feather.read_table(nt_path).to_pandas()
            self._nt = self._nt.set_index("body", drop=False)
            logger.info("Loaded neurotransmitters: %d rows", len(self._nt))

        # Body-stats — large file; filter to annotated bodies to save memory and ensure instant lookup
        if stats_path.exists():
            try:
                tbl = feather.read_table(
                    stats_path,
                    columns=["body", "pre", "post", "synweight"],
                )
                stats_df = tbl.to_pandas()
                if not self._annotations.empty:
                    ann_ids = set(self._annotations["bodyId"])
                    stats_df = stats_df[stats_df["body"].isin(ann_ids)]
                self._stats = stats_df.set_index("body", drop=False)
                logger.info("Loaded body-stats: %d rows (filtered to annotated bodies)", len(self._stats))
            except Exception as exc:  # column subset may fail on some versions
                logger.warning("Could not load body-stats columns: %s", exc)

        self._loaded = True
        elapsed = time.monotonic() - t0
        logger.info("Data loading complete in %.2fs", elapsed)

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _build_neuron(self, body_id: int) -> Optional[Neuron]:
        """Construct a Neuron from the in-memory data frames, or None."""
        if body_id not in self._annotations.index:
            return None
        row = self._annotations.loc[body_id]

        # NT lookup
        consensus_nt = None
        if not self._nt.empty and body_id in self._nt.index:
            nt_row = self._nt.loc[body_id]
            consensus_nt = _nan_to_none(nt_row.get("consensus_nt"))

        # Stats lookup
        pre_s = post_s = synwt = None
        if not self._stats.empty and body_id in self._stats.index:
            st = self._stats.loc[body_id]
            pre_s = int(st["pre"]) if pd.notna(st.get("pre")) else None
            post_s = int(st["post"]) if pd.notna(st.get("post")) else None
            synwt = int(st["synweight"]) if pd.notna(st.get("synweight")) else None

        return Neuron(
            body_id=int(row["bodyId"]),
            cell_type=_nan_to_none(row.get("type")),
            instance=_nan_to_none(row.get("instance")),
            superclass=_nan_to_none(row.get("superclass")),
            status=_nan_to_none(row.get("status")),
            status_label=_nan_to_none(row.get("statusLabel")),
            soma_side=_nan_to_none(row.get("somaSide")),
            soma_neuromere=_nan_to_none(row.get("somaNeuromere")),
            subclass=_nan_to_none(row.get("subclass")),
            hemi_brain_type=_nan_to_none(row.get("hemibrainType")),
            consensus_nt=consensus_nt,
            pre_synapses=pre_s,
            post_synapses=post_s,
            synweight=synwt,
            entry_nerve=_nan_to_none(row.get("entryNerve")),
            exit_nerve=_nan_to_none(row.get("exitNerve")),
            dimorphism=_nan_to_none(row.get("dimorphism")),
            group=_nan_to_none(row.get("group")),
        )

    def _node_label(self, body_id: int, cell_type: Optional[str], instance: Optional[str]) -> str:
        return cell_type or instance or str(body_id)

    # ── Public API ────────────────────────────────────────────────────────────

    def search(
        self,
        query: str,
        limit: int,
        offset: int = 0,
    ) -> NeuronSearchResponse:
        """
        Search annotations by body_id, cell_type, or instance.

        Strategy:
          1. If query is numeric → exact body_id match.
          2. Otherwise → case-insensitive substring in 'type' or 'instance'.
        """
        q = query.strip()
        ann = self._annotations

        match_field = "cell_type"

        if q.isdigit():
            bid = int(q)
            mask = ann["bodyId"] == bid
            match_field = "body_id"
        else:
            q_lower = q.lower()
            mask = (
                ann["type"].fillna("").str.lower().str.contains(q_lower, regex=False)
                | ann["instance"].fillna("").str.lower().str.contains(q_lower, regex=False)
            )

        matched = ann[mask]
        total = len(matched)
        page = matched.iloc[offset : offset + limit]

        results = []
        for _, row in page.iterrows():
            results.append(
                NeuronSearchResult(
                    body_id=int(row["bodyId"]),
                    cell_type=_nan_to_none(row.get("type")),
                    instance=_nan_to_none(row.get("instance")),
                    superclass=_nan_to_none(row.get("superclass")),
                    status=_nan_to_none(row.get("status")),
                    match_field=match_field,
                )
            )

        return NeuronSearchResponse(
            results=results,
            total=total,
            limit=limit,
            offset=offset,
            query=q,
            dataset=DATASET_NAME,
        )

    def get_neuron(self, body_id: int) -> Optional[Neuron]:
        """Return a single neuron by body_id or None if not found."""
        return self._build_neuron(body_id)

    def get_connectivity_summary(
        self,
        body_id: int,
    ) -> Optional[ConnectivitySummaryResponse]:
        """
        Calculate connectivity intelligence metrics from actual loaded source data.

        Metrics:
          - incoming: partner count (unique body_pre), record count, sum of weights, post-synapses from body-stats.
          - outgoing: partner count (unique body_post), record count, sum of weights, pre-synapses from body-stats.
        """
        if body_id not in self._annotations.index:
            return None

        wt = self._weights
        inc_df = wt[wt["body_post"] == body_id] if not wt.empty else pd.DataFrame()
        out_df = wt[wt["body_pre"] == body_id] if not wt.empty else pd.DataFrame()

        inc_partners = int(inc_df["body_pre"].nunique()) if not inc_df.empty else 0
        inc_records = len(inc_df)
        inc_weight = int(inc_df["weight"].sum()) if not inc_df.empty else 0

        out_partners = int(out_df["body_post"].nunique()) if not out_df.empty else 0
        out_records = len(out_df)
        out_weight = int(out_df["weight"].sum()) if not out_df.empty else 0

        # Stats lookup
        pre_s = post_s = None
        if not self._stats.empty and body_id in self._stats.index:
            st = self._stats.loc[body_id]
            pre_s = int(st["pre"]) if pd.notna(st.get("pre")) else None
            post_s = int(st["post"]) if pd.notna(st.get("post")) else None

        return ConnectivitySummaryResponse(
            body_id=body_id,
            incoming=DirectionalConnectivitySummary(
                direction="incoming",
                partner_count=inc_partners,
                record_count=inc_records,
                total_weight=inc_weight,
                body_stat_synapses=post_s,
            ),
            outgoing=DirectionalConnectivitySummary(
                direction="outgoing",
                partner_count=out_partners,
                record_count=out_records,
                total_weight=out_weight,
                body_stat_synapses=pre_s,
            ),
            source_file=_WEIGHTS_FILE,
            is_traced_only_subset=True,
            coverage_notice=(
                f"Counts and weights reflect connections present in the loaded "
                f"{DATASET_NAME} traced-only dataset (min confidence 0.5) and do not "
                "represent the entire biological connectome."
            ),
            dataset=DATASET_NAME,
        )

    def get_connections(
        self,
        body_id: int,
        direction: str,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "weight",
        sort_order: str = "desc",
        partner_id: Optional[int] = None,
        partner_type: Optional[str] = None,
        min_weight: Optional[int] = None,
    ) -> ConnectionListResponse:
        """
        Retrieve incoming or outgoing connections for a neuron with sorting,
        filtering, and pagination.

        direction: 'incoming' — connections WHERE body_post == body_id
                   'outgoing' — connections WHERE body_pre == body_id
        """
        wt = self._weights
        if wt.empty:
            return ConnectionListResponse(
                body_id=body_id,
                direction=direction,
                connections=[],
                returned_count=0,
                total_matched=0,
                total_in_source=0,
                unique_partners=0,
                total=0,
                limit=limit,
                offset=offset,
                has_more=False,
                sort_by=sort_by,
                sort_order=sort_order,
                partner_filter=partner_type,
                dataset=DATASET_NAME,
                source_file=_WEIGHTS_FILE,
                is_traced_only_subset=True,
            )

        partner_col = "body_pre" if direction == "incoming" else "body_post"
        partner_type_col = "type_pre" if direction == "incoming" else "type_post"

        if direction == "incoming":
            matched = wt[wt["body_post"] == body_id]
        else:
            matched = wt[wt["body_pre"] == body_id]

        total_in_source = len(matched)

        # Filtering
        filtered = matched
        if partner_id is not None:
            filtered = filtered[filtered[partner_col] == partner_id]
        if partner_type:
            q_pt = partner_type.strip().lower()
            filtered = filtered[
                filtered[partner_type_col].fillna("").str.lower().str.contains(q_pt, regex=False)
            ]
        if min_weight is not None:
            filtered = filtered[filtered["weight"] >= min_weight]

        total_matched = len(filtered)
        unique_partners = int(filtered[partner_col].nunique()) if not filtered.empty else 0

        # Sorting
        ascending = (sort_order.lower() == "asc")
        if sort_by == "partner_id":
            sort_cols = [partner_col, "weight"]
            sort_ascs = [ascending, False]
        elif sort_by == "partner_type":
            sort_cols = [partner_type_col, "weight"]
            sort_ascs = [ascending, False]
        else:  # default "weight"
            sort_cols = ["weight", partner_col]
            sort_ascs = [ascending, True]

        sorted_df = filtered.sort_values(by=sort_cols, ascending=sort_ascs)

        # Pagination
        page = sorted_df.iloc[offset : offset + limit]
        has_more = (offset + len(page)) < total_matched

        connections = []
        ann = self._annotations
        for _, r in page.iterrows():
            b_pre = int(r["body_pre"])
            b_post = int(r["body_post"])

            inst_pre = None
            sup_pre = None
            if not ann.empty and b_pre in ann.index:
                row_pre = ann.loc[b_pre]
                inst_pre = _nan_to_none(row_pre.get("instance"))
                sup_pre = _nan_to_none(row_pre.get("superclass"))

            inst_post = None
            sup_post = None
            if not ann.empty and b_post in ann.index:
                row_post = ann.loc[b_post]
                inst_post = _nan_to_none(row_post.get("instance"))
                sup_post = _nan_to_none(row_post.get("superclass"))

            connections.append(
                Connection(
                    body_pre=b_pre,
                    body_post=b_post,
                    weight=int(r["weight"]),
                    type_pre=_nan_to_none(r.get("type_pre")),
                    type_post=_nan_to_none(r.get("type_post")),
                    instance_pre=inst_pre,
                    instance_post=inst_post,
                    superclass_pre=sup_pre,
                    superclass_post=sup_post,
                )
            )

        return ConnectionListResponse(
            body_id=body_id,
            direction=direction,
            connections=connections,
            returned_count=len(connections),
            total_matched=total_matched,
            total_in_source=total_in_source,
            unique_partners=unique_partners,
            total=total_matched,
            limit=limit,
            offset=offset,
            has_more=has_more,
            sort_by=sort_by,
            sort_order=sort_order,
            partner_filter=partner_type,
            dataset=DATASET_NAME,
            source_file=_WEIGHTS_FILE,
            is_traced_only_subset=True,
        )

    def get_neighborhood(
        self,
        body_id: int,
        max_nodes: int,
        max_edges_per_direction: int,
    ) -> GraphResponse:
        """
        Build the local directed graph neighborhood for body_id.

        Retrieves the top N incoming and top N outgoing connections,
        then assembles a Cytoscape-ready payload.  Deduplicates nodes
        and edges by their stable IDs.  Sets is_partial=True when a limit
        was reached.
        """
        wt = self._weights
        half = min(max_edges_per_direction, (max_nodes - 1) // 2)

        incoming_rows = wt[wt["body_post"] == body_id].nlargest(half, "weight")
        outgoing_rows = wt[wt["body_pre"] == body_id].nlargest(half, "weight")

        node_ids: set[int] = {body_id}
        edges_dict: dict[str, GraphEdge] = {}

        # Collect all partner IDs
        for _, r in incoming_rows.iterrows():
            node_ids.add(int(r["body_pre"]))
            eid = f"{int(r['body_pre'])}_{int(r['body_post'])}"
            if eid not in edges_dict:
                edges_dict[eid] = GraphEdge(
                    id=eid,
                    source=str(int(r["body_pre"])),
                    target=str(int(r["body_post"])),
                    body_pre=int(r["body_pre"]),
                    body_post=int(r["body_post"]),
                    weight=int(r["weight"]),
                    type_pre=_nan_to_none(r.get("type_pre")),
                    type_post=_nan_to_none(r.get("type_post")),
                )

        for _, r in outgoing_rows.iterrows():
            node_ids.add(int(r["body_post"]))
            eid = f"{int(r['body_pre'])}_{int(r['body_post'])}"
            if eid not in edges_dict:
                edges_dict[eid] = GraphEdge(
                    id=eid,
                    source=str(int(r["body_pre"])),
                    target=str(int(r["body_post"])),
                    body_pre=int(r["body_pre"]),
                    body_post=int(r["body_post"]),
                    weight=int(r["weight"]),
                    type_pre=_nan_to_none(r.get("type_pre")),
                    type_post=_nan_to_none(r.get("type_post")),
                )

        is_partial = len(node_ids) >= max_nodes

        # Build node list, cap at max_nodes
        node_ids_list = list(node_ids)[:max_nodes]
        nodes = []
        for bid in node_ids_list:
            row = self._annotations.loc[bid] if bid in self._annotations.index else None
            ct = _nan_to_none(row.get("type")) if row is not None else None
            inst = _nan_to_none(row.get("instance")) if row is not None else None
            sup = _nan_to_none(row.get("superclass")) if row is not None else None
            stat = _nan_to_none(row.get("status")) if row is not None else None

            cons_nt = None
            if not self._nt.empty and bid in self._nt.index:
                cons_nt = _nan_to_none(self._nt.loc[bid].get("consensus_nt"))

            nodes.append(
                GraphNode(
                    id=str(bid),
                    body_id=bid,
                    label=self._node_label(bid, ct, inst),
                    cell_type=ct,
                    instance=inst,
                    superclass=sup,
                    status=stat,
                    consensus_nt=cons_nt,
                    is_selected=(bid == body_id),
                )
            )

        # Only include edges whose both endpoints are in the node list
        node_id_strs = {str(nid) for nid in node_ids_list}
        edges = [
            e for e in edges_dict.values()
            if e.source in node_id_strs and e.target in node_id_strs
        ]

        return GraphResponse(
            nodes=nodes,
            edges=edges,
            node_count=len(nodes),
            edge_count=len(edges),
            is_partial=is_partial,
            dataset=DATASET_NAME,
            dataset_version="v1.0",
            center_body_id=body_id,
        )

    def verify_dataset(self) -> tuple[bool, str]:
        """Return (ok, message) for the health-check endpoint."""
        if not self._loaded:
            return False, "Data files not loaded."
        ann_count = len(self._annotations)
        wt_count = len(self._weights)
        return True, (
            f"Local data loaded: {ann_count:,} neurons, "
            f"{wt_count:,} connections ({DATASET_NAME})."
        )

    # ── V3: Graph Pathway & Cascade Traversal ─────────────────────────────────

    def get_outgoing_raw(self, u: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Return raw numpy slices for outgoing edges of u: (post_arr, wt_arr, type_pre_arr, type_post_arr)."""
        self._ensure_graph_indexed()
        if u not in self._pre_index:
            return (
                np.array([], dtype=np.int64),
                np.array([], dtype=np.int64),
                np.array([], dtype=object),
                np.array([], dtype=object),
            )
        s, e = self._pre_index[u]
        return self._post_arr[s:e], self._wt_arr[s:e], self._type_pre_arr[s:e], self._type_post_arr[s:e]

    def _get_edge_record(self, u: int, v: int) -> tuple[int, Optional[str], Optional[str]]:
        """Find weight and types for directed edge u -> v."""
        self._ensure_graph_indexed()
        if u in self._pre_index:
            s, e = self._pre_index[u]
            posts = self._post_arr[s:e]
            matches = np.where(posts == v)[0]
            if len(matches) > 0:
                idx = s + matches[0]
                w = int(self._wt_arr[idx])
                tp = _nan_to_none(self._type_pre_arr[idx])
                tpost = _nan_to_none(self._type_post_arr[idx])
                return w, tp, tpost
        return 0, None, None

    def _build_path_node(self, body_id: int, hop: int) -> PathNode:
        ct, inst, sup = None, None, None
        if not self._annotations.empty and body_id in self._annotations.index:
            row = self._annotations.loc[body_id]
            ct = _nan_to_none(row.get("type"))
            inst = _nan_to_none(row.get("instance"))
            sup = _nan_to_none(row.get("superclass"))
        return PathNode(
            body_id=body_id,
            type=ct,
            instance=inst,
            superclass=sup,
            hop=hop,
        )

    def _build_path_edge(
        self,
        pre: int,
        post: int,
        weight: int,
        type_pre: Optional[str] = None,
        type_post: Optional[str] = None,
    ) -> PathEdge:
        inst_pre, inst_post = None, None
        ann = self._annotations
        if not ann.empty:
            if pre in ann.index:
                inst_pre = _nan_to_none(ann.loc[pre].get("instance"))
                if type_pre is None:
                    type_pre = _nan_to_none(ann.loc[pre].get("type"))
            if post in ann.index:
                inst_post = _nan_to_none(ann.loc[post].get("instance"))
                if type_post is None:
                    type_post = _nan_to_none(ann.loc[post].get("type"))
        total_w = self._pre_total_weights.get(pre, 0)
        rf = (weight / total_w) if total_w > 0 else None
        return PathEdge(
            body_pre=pre,
            body_post=post,
            weight=weight,
            type_pre=type_pre,
            type_post=type_post,
            instance_pre=inst_pre,
            instance_post=inst_post,
            relative_weight_fraction=rf,
        )

    def find_paths(
        self,
        source_body_id: int,
        target_body_id: int,
        max_hops: int = 5,
        max_paths: int = 3,
        strategy: str = "shortest",
        min_weight: Optional[int] = None,
    ) -> PathwaySearchResponse:
        """
        Find up to max_paths directed simple paths from source_body_id to target_body_id.
        Preserves edge direction: pre -> post.
        """
        self._ensure_graph_indexed()
        max_hops = max(1, min(max_hops, 10))
        max_paths = max(1, min(max_paths, 20))
        valid_strategies = ("shortest", "weight_prioritized")
        if strategy not in valid_strategies:
            raise ValueError(f"Invalid strategy '{strategy}'. Must be one of {valid_strategies}.")

        # Check endpoints exist in dataset if loaded
        if self._loaded and not self._annotations.empty:
            has_source = (source_body_id in self._annotations.index) or (source_body_id in self._pre_index)
            has_target = (target_body_id in self._annotations.index) or (target_body_id in self._pre_index) or (target_body_id in self._post_arr)
            if not has_source:
                raise KeyError(f"Source neuron bodyId {source_body_id} not found in MaleCNS dataset.")
            if not has_target:
                raise KeyError(f"Target neuron bodyId {target_body_id} not found in MaleCNS dataset.")

        # Edge case: Source equals target (valid 0-hop path)
        if source_body_id == target_body_id:
            same_node = self._build_path_node(source_body_id, 0)
            single_path = PathItem(
                rank=1,
                hops=0,
                nodes=[same_node],
                edges=[],
                score=1.0,
                log_cost=0.0,
                total_weight=0,
                bottleneck_weight=0,
            )
            return PathwaySearchResponse(
                source_body_id=source_body_id,
                target_body_id=target_body_id,
                strategy=strategy,
                max_hops=max_hops,
                max_paths=max_paths,
                paths=[single_path],
                returned_count=1,
                status="same_node",
                is_partial=False,
                explored_nodes=1,
                explored_edges=0,
                dataset=DATASET_NAME,
                source_file=_WEIGHTS_FILE,
            )

        explored_nodes = 0
        explored_edges = 0

        def get_outgoing(u: int):
            nonlocal explored_nodes, explored_edges
            explored_nodes += 1
            if u not in self._pre_index:
                return (
                    np.array([], dtype=np.int64),
                    np.array([], dtype=np.int64),
                    np.array([], dtype=object),
                    np.array([], dtype=object),
                )
            s, e = self._pre_index[u]
            explored_edges += (e - s)
            return self._post_arr[s:e], self._wt_arr[s:e], self._type_pre_arr[s:e], self._type_post_arr[s:e]

        # ── 1. Shortest Structural Strategy (Fewest Hops via BFS + Yen's Algorithm) ──
        if strategy == "shortest":
            def bfs(src: int, dst: int, max_h: int, excl_edges: set[tuple[int, int]], excl_nodes: set[int]):
                queue = deque([(src, [src], 0)])
                visited = set(excl_nodes)
                visited.add(src)
                while queue:
                    curr, path, h = queue.popleft()
                    if curr == dst:
                        return path
                    if h >= max_h:
                        continue
                    posts, wts, _, _ = get_outgoing(curr)
                    candidates = []
                    for p, w in zip(posts, wts):
                        p, w = int(p), int(w)
                        if min_weight is not None and w < min_weight:
                            continue
                        if (curr, p) in excl_edges or p in visited:
                            continue
                        candidates.append((p, w))
                    # Sort candidates deterministically: descending weight, ascending body ID
                    candidates.sort(key=lambda x: (-x[1], x[0]))
                    for p, _ in candidates:
                        visited.add(p)
                        queue.append((p, path + [p], h + 1))
                return None

            p0 = bfs(source_body_id, target_body_id, max_hops, set(), set())
            if not p0:
                return PathwaySearchResponse(
                    source_body_id=source_body_id,
                    target_body_id=target_body_id,
                    strategy=strategy,
                    max_hops=max_hops,
                    max_paths=max_paths,
                    paths=[],
                    returned_count=0,
                    status="no_path_found",
                    is_partial=False,
                    explored_nodes=explored_nodes,
                    explored_edges=explored_edges,
                    dataset=DATASET_NAME,
                    source_file=_WEIGHTS_FILE,
                )

            raw_paths: list[list[int]] = [p0]
            candidate_heap: list[tuple[int, list[int]]] = []
            for k in range(1, max_paths):
                prev = raw_paths[-1]
                for i in range(len(prev) - 1):
                    spur_node = prev[i]
                    root_path = prev[: i + 1]
                    excl_edges = set()
                    for p in raw_paths:
                        if len(p) > i and p[: i + 1] == root_path:
                            excl_edges.add((p[i], p[i + 1]))
                    excl_nodes = set(root_path[:-1])
                    spur_path = bfs(spur_node, target_body_id, max_hops - i, excl_edges, excl_nodes)
                    if spur_path:
                        cand = root_path[:-1] + spur_path
                        if cand not in raw_paths and cand not in [c[1] for c in candidate_heap]:
                            heapq.heappush(candidate_heap, (len(cand), cand))
                if not candidate_heap:
                    break
                _, best_cand = heapq.heappop(candidate_heap)
                raw_paths.append(best_cand)

            raw_paths_weighted = None

        # ── 2. Weight-Prioritized Strategy (Dijkstra Log-Cost + Yen's Algorithm) ─────
        else:
            def dijkstra(src: int, dst: int, max_h: int, excl_edges: set[tuple[int, int]], excl_nodes: set[int]):
                pq = [(0.0, 0, src, [src], 1.0)]
                best_cost = {src: 0.0}
                while pq:
                    cost, h, curr, path, prod = heapq.heappop(pq)
                    if curr == dst:
                        return path, cost, prod
                    if h >= max_h:
                        continue
                    if cost > best_cost.get(curr, float("inf")):
                        continue
                    posts, wts, _, _ = get_outgoing(curr)
                    tot_w = float(self._pre_total_weights.get(curr, 0))
                    if tot_w <= 0:
                        continue
                    candidates = []
                    for p, w in zip(posts, wts):
                        p, w = int(p), float(w)
                        if min_weight is not None and w < min_weight:
                            continue
                        if p in excl_nodes or (curr, p) in excl_edges:
                            continue
                        candidates.append((p, w))
                    candidates.sort(key=lambda x: (-x[1], x[0]))
                    for p, w in candidates:
                        p_vu = w / tot_w
                        edge_cost = -math.log(p_vu)
                        new_cost = cost + edge_cost
                        if new_cost < best_cost.get(p, float("inf")):
                            best_cost[p] = new_cost
                            heapq.heappush(pq, (new_cost, h + 1, p, path + [p], prod * p_vu))
                return None, None, None

            p0, c0, pr0 = dijkstra(source_body_id, target_body_id, max_hops, set(), set())
            if not p0:
                return PathwaySearchResponse(
                    source_body_id=source_body_id,
                    target_body_id=target_body_id,
                    strategy=strategy,
                    max_hops=max_hops,
                    max_paths=max_paths,
                    paths=[],
                    returned_count=0,
                    status="no_path_found",
                    is_partial=False,
                    explored_nodes=explored_nodes,
                    explored_edges=explored_edges,
                    dataset=DATASET_NAME,
                    source_file=_WEIGHTS_FILE,
                )

            raw_paths_weighted: list[tuple[list[int], float, float]] = [(p0, c0, pr0)]
            candidate_heap_w: list[tuple[float, list[int], float]] = []
            for k in range(1, max_paths):
                prev, _, _ = raw_paths_weighted[-1]
                for i in range(len(prev) - 1):
                    spur_node = prev[i]
                    root_path = prev[: i + 1]
                    root_cost = 0.0
                    root_prod = 1.0
                    for r in range(len(root_path) - 1):
                        u, v = root_path[r], root_path[r + 1]
                        posts, wts, _, _ = get_outgoing(u)
                        tot_w = float(self._pre_total_weights.get(u, 1))
                        w = next((float(wt) for pt, wt in zip(posts, wts) if int(pt) == v), 1.0)
                        p_vu = (w / tot_w) if tot_w > 0 else 1.0
                        root_cost += -math.log(p_vu) if p_vu > 0 else 0.0
                        root_prod *= p_vu

                    excl_edges = set()
                    for p, _, _ in raw_paths_weighted:
                        if len(p) > i and p[: i + 1] == root_path:
                            excl_edges.add((p[i], p[i + 1]))
                    excl_nodes = set(root_path[:-1])
                    spur_path, spur_cost, spur_prod = dijkstra(
                        spur_node, target_body_id, max_hops - i, excl_edges, excl_nodes
                    )
                    if spur_path:
                        cand = root_path[:-1] + spur_path
                        total_c = root_cost + spur_cost
                        total_pr = root_prod * spur_prod
                        if cand not in [p[0] for p in raw_paths_weighted] and cand not in [c[1] for c in candidate_heap_w]:
                            heapq.heappush(candidate_heap_w, (total_c, cand, total_pr))
                if not candidate_heap_w:
                    break
                best_c, best_cand, best_pr = heapq.heappop(candidate_heap_w)
                raw_paths_weighted.append((best_cand, best_c, best_pr))

            raw_paths = [p[0] for p in raw_paths_weighted]

        # Convert discovered node lists into typed PathItem objects
        path_items: list[PathItem] = []
        for idx, r_nodes in enumerate(raw_paths):
            p_nodes = [self._build_path_node(nid, hop) for hop, nid in enumerate(r_nodes)]
            p_edges = []
            weights = []
            for i in range(len(r_nodes) - 1):
                u, v = r_nodes[i], r_nodes[i + 1]
                w, tp, tpost = self._get_edge_record(u, v)
                edge_obj = self._build_path_edge(u, v, w, tp, tpost)
                p_edges.append(edge_obj)
                weights.append(w)

            total_w = sum(weights)
            bottleneck_w = min(weights) if weights else 0

            score_val = None
            log_cost_val = None
            if strategy == "weight_prioritized" and raw_paths_weighted is not None:
                _, log_cost_val, score_val = raw_paths_weighted[idx]

            path_items.append(
                PathItem(
                    rank=idx + 1,
                    hops=len(p_edges),
                    nodes=p_nodes,
                    edges=p_edges,
                    score=score_val,
                    log_cost=log_cost_val,
                    total_weight=total_w,
                    bottleneck_weight=bottleneck_w,
                )
            )

        return PathwaySearchResponse(
            source_body_id=source_body_id,
            target_body_id=target_body_id,
            strategy=strategy,
            max_hops=max_hops,
            max_paths=max_paths,
            paths=path_items,
            returned_count=len(path_items),
            status="found",
            is_partial=False,
            explored_nodes=explored_nodes,
            explored_edges=explored_edges,
            dataset=DATASET_NAME,
            source_file=_WEIGHTS_FILE,
        )

    def compute_downstream_cascade(
        self,
        source_body_id: int,
        max_hops: int = 3,
        max_nodes: int = 300,
        max_edges: int = 600,
        min_weight: Optional[int] = None,
    ) -> DownstreamCascadeResponse:
        """
        Compute downstream structural reachability cascade from source_body_id.
        Traverses outgoing directed edges with visited set to prevent infinite loops.
        Assigns each discovered node its minimum discovered hop distance.
        """
        self._ensure_graph_indexed()
        max_hops = max(1, min(max_hops, 6))
        max_nodes = max(1, min(max_nodes, 1000))
        max_edges = max(1, min(max_edges, 2000))

        if self._loaded and not self._annotations.empty:
            has_source = (source_body_id in self._annotations.index) or (source_body_id in self._pre_index)
            if not has_source:
                raise KeyError(f"Source neuron bodyId {source_body_id} not found in MaleCNS dataset.")

        queue = deque([(source_body_id, 0)])
        node_hops: dict[int, int] = {source_body_id: 0}
        edges_list: list[CascadeEdge] = []
        edge_set: set[tuple[int, int]] = set()
        in_degrees: dict[int, int] = defaultdict(int)
        out_degrees: dict[int, int] = defaultdict(int)
        is_truncated = False
        truncation_reason = None

        while queue:
            curr, hop = queue.popleft()
            if hop >= max_hops:
                continue

            posts, wts, _, _ = self.get_outgoing_raw(curr)
            for p, w in zip(posts, wts):
                p, w = int(p), int(w)
                if min_weight is not None and w < min_weight:
                    continue

                if (curr, p) not in edge_set:
                    if len(edges_list) >= max_edges:
                        is_truncated = True
                        truncation_reason = "max_edges_reached"
                        break
                    edge_set.add((curr, p))
                    post_hop = node_hops.get(p, hop + 1)
                    edges_list.append(
                        CascadeEdge(
                            body_pre=curr,
                            body_post=p,
                            weight=w,
                            pre_hop=hop,
                            post_hop=post_hop,
                        )
                    )
                    out_degrees[curr] += 1
                    in_degrees[p] += 1

                if p not in node_hops:
                    if len(node_hops) >= max_nodes:
                        is_truncated = True
                        truncation_reason = "max_nodes_reached"
                        break
                    node_hops[p] = hop + 1
                    queue.append((p, hop + 1))

            if is_truncated:
                break

        # Prune edges to only include nodes that were actually retained in node_hops
        valid_nodes = set(node_hops.keys())
        edges_list = [e for e in edges_list if e.body_pre in valid_nodes and e.body_post in valid_nodes]

        # Recalculate degrees based on pruned edge list
        in_degrees = defaultdict(int)
        out_degrees = defaultdict(int)
        for e in edges_list:
            out_degrees[e.body_pre] += 1
            in_degrees[e.body_post] += 1

        # Calculate per-hop layer statistics
        max_discovered_hop = max(node_hops.values()) if node_hops else 0
        layers: list[CascadeHopLayer] = []
        cum_nodes = 0
        for h in range(max_discovered_hop + 1):
            nodes_at_h = [nid for nid, depth in node_hops.items() if depth == h]
            newly_reached = len(nodes_at_h)
            cum_nodes += newly_reached
            layer_edges = [e for e in edges_list if e.post_hop == h]
            layer_weight = sum(e.weight for e in layer_edges)
            layers.append(
                CascadeHopLayer(
                    hop=h,
                    newly_reached_nodes=newly_reached,
                    cumulative_nodes=cum_nodes,
                    layer_edges=len(layer_edges),
                    layer_weight=layer_weight,
                )
            )

        # Build node models enriched with annotations
        nodes_list: list[CascadeNode] = []
        ann = self._annotations
        for nid, hop in node_hops.items():
            ct, inst, sup = None, None, None
            if not ann.empty and nid in ann.index:
                row = ann.loc[nid]
                ct = _nan_to_none(row.get("type"))
                inst = _nan_to_none(row.get("instance"))
                sup = _nan_to_none(row.get("superclass"))
            nodes_list.append(
                CascadeNode(
                    body_id=nid,
                    type=ct,
                    instance=inst,
                    superclass=sup,
                    hop=hop,
                    in_degree=in_degrees[nid],
                    out_degree=out_degrees[nid],
                )
            )

        return DownstreamCascadeResponse(
            source_body_id=source_body_id,
            max_hops=max_hops,
            max_nodes=max_nodes,
            max_edges=max_edges,
            min_weight=min_weight,
            total_unique_nodes=len(nodes_list),
            total_edges=len(edges_list),
            layers=layers,
            nodes=nodes_list,
            edges=edges_list,
            is_truncated=is_truncated,
            truncation_reason=truncation_reason,
            dataset=DATASET_NAME,
            source_file=_WEIGHTS_FILE,
        )

