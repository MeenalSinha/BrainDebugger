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

import logging
import time
from pathlib import Path
from typing import Optional

import pandas as pd
import pyarrow.feather as feather

from backend.config import Settings
from backend.models import (
    Connection,
    ConnectionListResponse,
    ConnectivitySummaryResponse,
    DirectionalConnectivitySummary,
    GraphEdge,
    GraphNode,
    GraphResponse,
    Neuron,
    NeuronSearchResponse,
    NeuronSearchResult,
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
