"""
BrainDebugger — Backend Unit Tests

Tests configuration, data models, normalization, edge direction,
error handling, and graph construction logic.

Run:
    pytest tests/ -v

Integration tests (requires local Feather files in DATA_DIR):
    pytest tests/ -v -m integration
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path
from typing import Optional
from unittest.mock import patch

import pytest

# Ensure the project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# ── Configuration tests ───────────────────────────────────────────────────────

class TestConfigValidation:
    """Configuration module validates and rejects bad settings."""

    def _make_settings(self, env: dict):
        """Construct a Settings instance with the given environment overrides."""
        import importlib
        import backend.config as cfg_module
        # Reset singleton
        cfg_module._settings = None
        with patch.dict(os.environ, env, clear=False):
            from backend.config import Settings
            return Settings()

    def test_default_dataset(self):
        from backend.config import Settings
        with patch.dict(os.environ, {"NEUPRINT_DATASET": "male-cns:v1.0"}, clear=False):
            s = Settings()
            assert s.neuprint_dataset == "male-cns:v1.0"

    def test_neuprint_not_configured_without_token(self):
        from backend.config import Settings
        with patch.dict(os.environ, {"NEUPRINT_TOKEN": ""}, clear=False):
            s = Settings()
            assert not s.neuprint_configured

    def test_neuprint_configured_when_server_and_token_set(self):
        from backend.config import Settings
        with patch.dict(
            os.environ,
            {
                "NEUPRINT_SERVER": "https://neuprint.janelia.org",
                "NEUPRINT_TOKEN": "fake-token-for-test",
            },
            clear=False,
        ):
            s = Settings()
            assert s.neuprint_configured

    def test_invalid_log_level_raises(self):
        from pydantic import ValidationError
        from backend.config import Settings
        with patch.dict(os.environ, {"LOG_LEVEL": "VERBOSELY"}, clear=False):
            with pytest.raises(ValidationError):
                Settings()

    def test_safe_repr_omits_token(self):
        from backend.config import Settings
        with patch.dict(
            os.environ,
            {"NEUPRINT_TOKEN": "super-secret-abc123"},
            clear=False,
        ):
            s = Settings()
            r = s.safe_repr()
            assert "super-secret-abc123" not in str(r)
            assert r["neuprint_token"] in ("(set)", "(not set)")


# ── Data model tests ──────────────────────────────────────────────────────────

class TestNeuronModel:
    """Neuron model correctly represents optional and required fields."""

    def test_required_body_id(self):
        from backend.models import Neuron
        n = Neuron(body_id=12345)
        assert n.body_id == 12345

    def test_all_optional_fields_none_by_default(self):
        from backend.models import Neuron
        n = Neuron(body_id=99)
        assert n.cell_type is None
        assert n.instance is None
        assert n.superclass is None
        assert n.consensus_nt is None
        assert n.pre_synapses is None

    def test_full_neuron_round_trips(self):
        from backend.models import Neuron
        n = Neuron(
            body_id=10001,
            cell_type="DNp01",
            instance="DNp01(GF)_R",
            superclass="descending_neuron",
            status="Traced",
            soma_side="R",
            consensus_nt="acetylcholine",
            pre_synapses=100,
            post_synapses=50,
        )
        d = n.model_dump()
        assert d["body_id"] == 10001
        assert d["cell_type"] == "DNp01"
        assert d["soma_side"] == "R"


class TestConnectionModel:
    """Connection model preserves directed edge semantics."""

    def test_edge_direction_preserved(self):
        from backend.models import Connection
        c = Connection(body_pre=100, body_post=200, weight=42)
        assert c.body_pre == 100
        assert c.body_post == 200
        assert c.weight == 42

    def test_edge_direction_not_reversed(self):
        from backend.models import Connection
        c = Connection(body_pre=100, body_post=200, weight=42)
        # Presynaptic must remain pre, postsynaptic must remain post.
        assert c.body_pre != c.body_post
        # A→B must not become B→A
        pre, post = c.body_pre, c.body_post
        assert pre == 100
        assert post == 200

    def test_optional_types_none(self):
        from backend.models import Connection
        c = Connection(body_pre=1, body_post=2, weight=5)
        assert c.type_pre is None
        assert c.type_post is None


class TestGraphModels:
    """Graph node and edge IDs and direction semantics."""

    def test_graph_edge_source_is_pre(self):
        from backend.models import GraphEdge
        e = GraphEdge(
            id="100_200",
            source="100",
            target="200",
            body_pre=100,
            body_post=200,
            weight=10,
        )
        assert e.source == str(e.body_pre)
        assert e.target == str(e.body_post)

    def test_graph_node_id_is_string_of_body_id(self):
        from backend.models import GraphNode
        n = GraphNode(id="10001", body_id=10001, label="DNp01")
        assert n.id == "10001"


# ── Normalization tests ───────────────────────────────────────────────────────

class TestNanToNone:
    """_nan_to_none converts NaN values to None correctly."""

    def test_float_nan_becomes_none(self):
        from backend.data_provider import _nan_to_none
        assert _nan_to_none(float("nan")) is None

    def test_string_nan_becomes_none(self):
        from backend.data_provider import _nan_to_none
        assert _nan_to_none("nan") is None
        assert _nan_to_none("NaN") is None

    def test_none_stays_none(self):
        from backend.data_provider import _nan_to_none
        assert _nan_to_none(None) is None

    def test_valid_string_preserved(self):
        from backend.data_provider import _nan_to_none
        assert _nan_to_none("DNp01") == "DNp01"
        assert _nan_to_none("acetylcholine") == "acetylcholine"

    def test_empty_string_becomes_none(self):
        from backend.data_provider import _nan_to_none
        assert _nan_to_none("") is None
        assert _nan_to_none("  ") is None


# ── Graph processing tests ────────────────────────────────────────────────────

class TestGraphConstruction:
    """Graph construction with known minimal fixture data."""

    def _make_provider_with_data(self):
        """Build a LocalFeatherProvider with injected test DataFrames."""
        import pandas as pd
        from backend.data_provider import LocalFeatherProvider
        from pathlib import Path

        # Minimal fixture: 3 neurons, 2 edges (A→B, A→C)
        annotations = pd.DataFrame({
            "bodyId": [1, 2, 3],
            "type": ["TypeA", "TypeB", "TypeC"],
            "instance": ["Inst_A", "Inst_B", "Inst_C"],
            "superclass": ["class_x", "class_y", "class_z"],
            "status": ["Traced", "Traced", "Traced"],
            "statusLabel": ["Traced", "Traced", "Traced"],
            "somaSide": ["L", "R", "L"],
            "somaNeuromere": [None, None, None],
            "subclass": [None, None, None],
            "hemibrainType": [None, None, None],
        }).set_index("bodyId", drop=False)

        weights = pd.DataFrame({
            "body_pre": [1, 1],
            "body_post": [2, 3],
            "weight": [100, 50],
            "type_pre": ["TypeA", "TypeA"],
            "type_post": ["TypeB", "TypeC"],
        })

        p = LocalFeatherProvider(Path("/fake"))
        p._annotations = annotations
        p._weights = weights
        p._nt = pd.DataFrame()
        p._stats = pd.DataFrame()
        p._loaded = True
        return p

    def test_neighborhood_center_node_present(self):
        p = self._make_provider_with_data()
        g = p.get_neighborhood(body_id=1, max_nodes=10, max_edges_per_direction=5)
        node_ids = {n.body_id for n in g.nodes}
        assert 1 in node_ids

    def test_neighborhood_edges_have_correct_direction(self):
        p = self._make_provider_with_data()
        g = p.get_neighborhood(body_id=1, max_nodes=10, max_edges_per_direction=5)
        for edge in g.edges:
            assert edge.source == str(edge.body_pre)
            assert edge.target == str(edge.body_post)

    def test_neighborhood_no_reversed_edges(self):
        """The edge 1→2 must not appear as 2→1."""
        p = self._make_provider_with_data()
        g = p.get_neighborhood(body_id=1, max_nodes=10, max_edges_per_direction=5)
        for edge in g.edges:
            # Outgoing from 1: source must be '1'
            if edge.body_pre == 1:
                assert edge.source == "1"
                assert edge.target != "1"

    def test_node_count_matches_list_length(self):
        p = self._make_provider_with_data()
        g = p.get_neighborhood(body_id=1, max_nodes=10, max_edges_per_direction=5)
        assert g.node_count == len(g.nodes)
        assert g.edge_count == len(g.edges)

    def test_node_deduplication(self):
        p = self._make_provider_with_data()
        g = p.get_neighborhood(body_id=1, max_nodes=10, max_edges_per_direction=5)
        node_ids = [n.body_id for n in g.nodes]
        assert len(node_ids) == len(set(node_ids)), "Duplicate nodes found"

    def test_edge_deduplication(self):
        p = self._make_provider_with_data()
        g = p.get_neighborhood(body_id=1, max_nodes=10, max_edges_per_direction=5)
        edge_ids = [e.id for e in g.edges]
        assert len(edge_ids) == len(set(edge_ids)), "Duplicate edges found"

    def test_max_nodes_limit_respected(self):
        p = self._make_provider_with_data()
        g = p.get_neighborhood(body_id=1, max_nodes=2, max_edges_per_direction=5)
        assert len(g.nodes) <= 2

    def test_search_by_body_id(self):
        p = self._make_provider_with_data()
        result = p.search("1", limit=10)
        assert result.total >= 1
        assert any(r.body_id == 1 for r in result.results)

    def test_search_by_cell_type(self):
        p = self._make_provider_with_data()
        result = p.search("TypeB", limit=10)
        assert any(r.body_id == 2 for r in result.results)

    def test_search_empty_query_returns_no_fabricated_data(self):
        """Query that matches nothing returns empty results, not fake data."""
        p = self._make_provider_with_data()
        result = p.search("ZZZNOMATCH999", limit=10)
        assert result.total == 0
        assert result.results == []

    def test_get_neuron_returns_none_for_unknown_id(self):
        p = self._make_provider_with_data()
        assert p.get_neuron(99999) is None

    def test_connections_direction_incoming(self):
        p = self._make_provider_with_data()
        resp = p.get_connections(body_id=2, direction="incoming", limit=10)
        assert resp.direction == "incoming"
        for c in resp.connections:
            # All connections must have body_post == 2
            assert c.body_post == 2

    def test_connections_direction_outgoing(self):
        p = self._make_provider_with_data()
        resp = p.get_connections(body_id=1, direction="outgoing", limit=10)
        assert resp.direction == "outgoing"
        for c in resp.connections:
            # All connections must have body_pre == 1
            assert c.body_pre == 1

    def test_center_node_marked_selected(self):
        p = self._make_provider_with_data()
        g = p.get_neighborhood(body_id=1, max_nodes=10, max_edges_per_direction=5)
        center_nodes = [n for n in g.nodes if n.body_id == 1]
        assert len(center_nodes) == 1
        assert center_nodes[0].is_selected


# ── V2 Connectivity Summary & Intelligence Unit Tests ────────────────────────

class TestV2ConnectivitySummary:
    """Mathematical and contract correctness for connectivity intelligence."""

    def _make_provider(self):
        import pandas as pd
        from backend.data_provider import LocalFeatherProvider
        from pathlib import Path

        # 4 neurons: 1 (center), 2, 3, 4
        annotations = pd.DataFrame({
            "bodyId": [1, 2, 3, 4],
            "type": ["CenterType", "PartnerB", "PartnerC", "PartnerD"],
            "instance": ["inst1", "inst2", "inst3", "inst4"],
            "superclass": ["class1", "class2", "class3", "class4"],
            "status": ["Traced", "Traced", "Traced", "Traced"],
            "statusLabel": ["Traced", "Traced", "Traced", "Traced"],
            "somaSide": ["L", "R", "L", "R"],
            "somaNeuromere": [None, None, None, None],
            "subclass": [None, None, None, None],
            "hemibrainType": [None, None, None, None],
        }).set_index("bodyId", drop=False)

        # Connections:
        # Outgoing from 1: 1->2 (wt=40), 1->3 (wt=60) => 2 partners, 2 records, total weight = 100
        # Incoming to 1: 4->1 (wt=15), 2->1 (wt=25)   => 2 partners, 2 records, total weight = 40
        weights = pd.DataFrame({
            "body_pre": [1, 1, 4, 2],
            "body_post": [2, 3, 1, 1],
            "weight": [40, 60, 15, 25],
            "type_pre": ["CenterType", "CenterType", "PartnerD", "PartnerB"],
            "type_post": ["PartnerB", "PartnerC", "CenterType", "CenterType"],
        })

        stats = pd.DataFrame({
            "body": [1, 2],
            "pre": [120, 50],
            "post": [200, 80],
            "synweight": [320, 130],
        }).set_index("body", drop=False)

        p = LocalFeatherProvider(Path("/fake"))
        p._annotations = annotations
        p._weights = weights
        p._nt = pd.DataFrame()
        p._stats = stats
        p._loaded = True
        return p

    def test_summary_calculation_correctness(self):
        p = self._make_provider()
        s = p.get_connectivity_summary(1)
        assert s is not None
        assert s.body_id == 1
        # Outgoing
        assert s.outgoing.partner_count == 2
        assert s.outgoing.record_count == 2
        assert s.outgoing.total_weight == 100
        assert s.outgoing.body_stat_synapses == 120  # pre synapses
        # Incoming
        assert s.incoming.partner_count == 2
        assert s.incoming.record_count == 2
        assert s.incoming.total_weight == 40
        assert s.incoming.body_stat_synapses == 200  # post synapses
        # Source metadata
        assert s.is_traced_only_subset is True
        assert "traced-only" in s.coverage_notice

    def test_summary_nonexistent_neuron_returns_none(self):
        p = self._make_provider()
        assert p.get_connectivity_summary(9999) is None

    def test_summary_isolated_neuron(self):
        import pandas as pd
        p = self._make_provider()
        # Add isolated neuron 5
        isolated_row = pd.DataFrame({
            "bodyId": [5],
            "type": ["Isolated"],
            "instance": ["inst5"],
            "superclass": [None],
            "status": ["Traced"],
            "statusLabel": ["Traced"],
            "somaSide": [None],
            "somaNeuromere": [None],
            "subclass": [None],
            "hemibrainType": [None],
        }).set_index("bodyId", drop=False)
        p._annotations = pd.concat([p._annotations, isolated_row])

        s = p.get_connectivity_summary(5)
        assert s is not None
        assert s.incoming.partner_count == 0
        assert s.incoming.record_count == 0
        assert s.incoming.total_weight == 0
        assert s.outgoing.partner_count == 0
        assert s.outgoing.record_count == 0
        assert s.outgoing.total_weight == 0


# ── V2 Connection Sorting, Filtering & Pagination Unit Tests ─────────────────

class TestV2ConnectionSortingFilteringPagination:
    """Unit tests for connection query parameters."""

    def _make_provider(self):
        import pandas as pd
        from backend.data_provider import LocalFeatherProvider
        from pathlib import Path

        # Neuron 1 has outgoing connections to partners 2, 3, 5, 10, 20
        annotations = pd.DataFrame({
            "bodyId": [1, 2, 3, 5, 10, 20],
            "type": ["SrcType", "GABA_A", "Glutamatergic", "Dopaminergic", "Cholinergic", "GABA_B"],
            "instance": ["src", "inst2", "inst3", "inst5", "inst10", "inst20"],
            "superclass": ["super_src", "super_gaba", "super_glu", "super_dop", "super_chol", "super_gaba"],
            "status": ["Traced"] * 6,
            "statusLabel": ["Traced"] * 6,
            "somaSide": ["L"] * 6,
            "somaNeuromere": [None] * 6,
            "subclass": [None] * 6,
            "hemibrainType": [None] * 6,
        }).set_index("bodyId", drop=False)

        weights = pd.DataFrame({
            "body_pre": [1, 1, 1, 1, 1],
            "body_post": [2, 10, 3, 20, 5],
            "weight": [10, 50, 30, 20, 40],
            "type_pre": ["SrcType"] * 5,
            "type_post": ["GABA_A", "Cholinergic", "Glutamatergic", "GABA_B", "Dopaminergic"],
        })

        p = LocalFeatherProvider(Path("/fake"))
        p._annotations = annotations
        p._weights = weights
        p._nt = pd.DataFrame()
        p._stats = pd.DataFrame()
        p._loaded = True
        return p

    def test_sort_by_weight_descending(self):
        p = self._make_provider()
        res = p.get_connections(body_id=1, direction="outgoing", limit=10, sort_by="weight", sort_order="desc")
        weights = [c.weight for c in res.connections]
        assert weights == [50, 40, 30, 20, 10]

    def test_sort_by_weight_ascending(self):
        p = self._make_provider()
        res = p.get_connections(body_id=1, direction="outgoing", limit=10, sort_by="weight", sort_order="asc")
        weights = [c.weight for c in res.connections]
        assert weights == [10, 20, 30, 40, 50]

    def test_sort_by_partner_id_numerical(self):
        p = self._make_provider()
        res = p.get_connections(body_id=1, direction="outgoing", limit=10, sort_by="partner_id", sort_order="asc")
        partners = [c.body_post for c in res.connections]
        # Numerical order: 2, 3, 5, 10, 20 (NOT lexicographical 10, 2, 20...)
        assert partners == [2, 3, 5, 10, 20]

    def test_sort_by_partner_type(self):
        p = self._make_provider()
        res = p.get_connections(body_id=1, direction="outgoing", limit=10, sort_by="partner_type", sort_order="asc")
        types = [c.type_post for c in res.connections]
        assert types == sorted(types)

    def test_filter_by_partner_id(self):
        p = self._make_provider()
        res = p.get_connections(body_id=1, direction="outgoing", limit=10, partner_id=10)
        assert res.total_matched == 1
        assert res.total_in_source == 5
        assert len(res.connections) == 1
        assert res.connections[0].body_post == 10
        assert res.connections[0].weight == 50

    def test_filter_by_partner_type_case_insensitive_substring(self):
        p = self._make_provider()
        res = p.get_connections(body_id=1, direction="outgoing", limit=10, partner_type="gaba")
        assert res.total_matched == 2
        assert res.total_in_source == 5
        types = {c.type_post for c in res.connections}
        assert types == {"GABA_A", "GABA_B"}

    def test_filter_by_min_weight(self):
        p = self._make_provider()
        res = p.get_connections(body_id=1, direction="outgoing", limit=10, min_weight=30)
        assert res.total_matched == 3
        assert res.total_in_source == 5
        assert all(c.weight >= 30 for c in res.connections)

    def test_pagination_disjoint_pages(self):
        p = self._make_provider()
        # Page 1: 2 items
        p1 = p.get_connections(body_id=1, direction="outgoing", limit=2, offset=0, sort_by="weight", sort_order="desc")
        assert len(p1.connections) == 2
        assert p1.returned_count == 2
        assert p1.total_matched == 5
        assert p1.total_in_source == 5
        assert p1.has_more is True

        # Page 2: 2 items
        p2 = p.get_connections(body_id=1, direction="outgoing", limit=2, offset=2, sort_by="weight", sort_order="desc")
        assert len(p2.connections) == 2
        assert p2.has_more is True

        # Page 3: 1 item (last)
        p3 = p.get_connections(body_id=1, direction="outgoing", limit=2, offset=4, sort_by="weight", sort_order="desc")
        assert len(p3.connections) == 1
        assert p3.has_more is False

        # Disjoint partner verification
        ids1 = {c.body_post for c in p1.connections}
        ids2 = {c.body_post for c in p2.connections}
        ids3 = {c.body_post for c in p3.connections}
        assert ids1.isdisjoint(ids2)
        assert ids2.isdisjoint(ids3)
        assert len(ids1 | ids2 | ids3) == 5

    def test_enriched_partner_metadata(self):
        p = self._make_provider()
        res = p.get_connections(body_id=1, direction="outgoing", limit=5, partner_id=2)
        assert len(res.connections) == 1
        c = res.connections[0]
        assert c.instance_post == "inst2"
        assert c.superclass_post == "super_gaba"


# ── V3 Pathway Tracer Unit Tests ─────────────────────────────────────────────

class TestV3PathwayTracer:
    """Unit tests for directed shortest-path and alternative-path algorithms."""

    def _make_graph_provider(self):
        import pandas as pd
        from backend.data_provider import LocalFeatherProvider
        from pathlib import Path

        # Graph with branches and a cycle:
        # 1 -> 2 (w=10), 1 -> 3 (w=5)  [tot_out(1)=15]
        # 2 -> 4 (w=20), 2 -> 3 (w=2), 2 -> 1 (w=5 cycle) [tot_out(2)=27]
        # 3 -> 4 (w=15) [tot_out(3)=15]
        # 5 -> isolated
        annotations = pd.DataFrame({
            "bodyId": [1, 2, 3, 4, 5],
            "type": ["Type1", "Type2", "Type3", "Type4", "Type5"],
            "instance": ["inst1", "inst2", "inst3", "inst4", "inst5"],
            "superclass": ["super1", "super2", "super3", "super4", "super5"],
            "status": ["Traced"] * 5,
            "statusLabel": ["Traced"] * 5,
            "somaSide": ["L"] * 5,
            "somaNeuromere": [None] * 5,
            "subclass": [None] * 5,
            "hemibrainType": [None] * 5,
        }).set_index("bodyId", drop=False)

        weights = pd.DataFrame({
            "body_pre": [1, 1, 2, 2, 2, 3],
            "body_post": [2, 3, 4, 3, 1, 4],
            "weight": [10, 5, 20, 2, 5, 15],
            "type_pre": ["Type1", "Type1", "Type2", "Type2", "Type2", "Type3"],
            "type_post": ["Type2", "Type3", "Type4", "Type3", "Type1", "Type4"],
        })

        p = LocalFeatherProvider(Path("./data"))
        p._annotations = annotations
        p._weights = weights
        p._loaded = True
        return p

    def test_same_node_zero_hops(self):
        p = self._make_graph_provider()
        res = p.find_paths(source_body_id=1, target_body_id=1)
        assert res.status == "same_node"
        assert res.returned_count == 1
        path = res.paths[0]
        assert path.hops == 0
        assert len(path.nodes) == 1
        assert path.nodes[0].body_id == 1
        assert len(path.edges) == 0
        assert path.total_weight == 0

    def test_direct_one_hop_path(self):
        p = self._make_graph_provider()
        res = p.find_paths(source_body_id=1, target_body_id=2, max_paths=1)
        assert res.status == "found"
        assert res.returned_count == 1
        path = res.paths[0]
        assert path.hops == 1
        assert [n.body_id for n in path.nodes] == [1, 2]
        assert len(path.edges) == 1
        assert path.edges[0].body_pre == 1
        assert path.edges[0].body_post == 2
        assert path.edges[0].weight == 10

    def test_multihop_shortest_path(self):
        p = self._make_graph_provider()
        res = p.find_paths(source_body_id=1, target_body_id=4, max_paths=1, strategy="shortest")
        assert res.status == "found"
        path = res.paths[0]
        assert path.hops == 2  # 1 -> 2 -> 4 or 1 -> 3 -> 4
        assert path.nodes[0].body_id == 1
        assert path.nodes[-1].body_id == 4

    def test_alternative_paths_distinct_and_bounded(self):
        p = self._make_graph_provider()
        res = p.find_paths(source_body_id=1, target_body_id=4, max_paths=3, strategy="shortest")
        assert res.status == "found"
        assert res.returned_count == 3
        # Should find [1, 2, 4], [1, 3, 4], [1, 2, 3, 4]
        node_sequences = [[n.body_id for n in p_item.nodes] for p_item in res.paths]
        assert len(node_sequences) == 3
        assert [1, 2, 4] in node_sequences
        assert [1, 3, 4] in node_sequences
        assert [1, 2, 3, 4] in node_sequences
        # Ranks are 1, 2, 3
        assert [p_item.rank for p_item in res.paths] == [1, 2, 3]

    def test_reversed_direction_no_path(self):
        p = self._make_graph_provider()
        # 4 has no outgoing edges, so 4 -> 1 has no directed path
        res = p.find_paths(source_body_id=4, target_body_id=1)
        assert res.status == "no_path_found"
        assert res.returned_count == 0
        assert len(res.paths) == 0

    def test_cycle_avoidance(self):
        p = self._make_graph_provider()
        # Cycle exists: 1 -> 2 -> 1. Simple paths must not repeat any node.
        res = p.find_paths(source_body_id=1, target_body_id=4, max_paths=5)
        for p_item in res.paths:
            node_ids = [n.body_id for n in p_item.nodes]
            assert len(node_ids) == len(set(node_ids)), f"Cycle detected in simple path: {node_ids}"

    def test_weight_prioritized_ranking_mathematical_score(self):
        p = self._make_graph_provider()
        res = p.find_paths(source_body_id=1, target_body_id=4, max_paths=3, strategy="weight_prioritized")
        assert res.status == "found"
        assert res.returned_count >= 1

        top_path = res.paths[0]
        # For [1, 2, 4]:
        # p(2|1) = 10/15 = 2/3
        # p(4|2) = 20/27
        # Expected Score = (2/3) * (20/27) = 40/81 = ~0.4938
        assert [n.body_id for n in top_path.nodes] == [1, 2, 4]
        assert top_path.score is not None
        assert abs(top_path.score - (40.0 / 81.0)) < 1e-4
        assert top_path.log_cost is not None
        import math
        assert abs(top_path.log_cost - (-math.log(40.0 / 81.0))) < 1e-4

    def test_min_weight_filter_pathway(self):
        p = self._make_graph_provider()
        # If min_weight=12, edge (1,2) with w=10 and (1,3) with w=5 are filtered out
        res = p.find_paths(source_body_id=1, target_body_id=4, min_weight=12)
        assert res.status == "no_path_found"


# ── V3 Downstream Cascade Unit Tests ─────────────────────────────────────────

class TestV3DownstreamCascade:
    """Unit tests for downstream structural cascade analysis."""

    def _make_graph_provider(self):
        import pandas as pd
        from backend.data_provider import LocalFeatherProvider
        from pathlib import Path

        # Node 1 -> 2 (w=10), 1 -> 3 (w=20)   [Hop 1]
        # Node 2 -> 4 (w=30), 3 -> 4 (w=40), 2 -> 5 (w=5) [Hop 2]
        # Node 4 -> 6 (w=50)                  [Hop 3]
        annotations = pd.DataFrame({
            "bodyId": [1, 2, 3, 4, 5, 6],
            "type": [f"Type{i}" for i in range(1, 7)],
            "instance": [f"inst{i}" for i in range(1, 7)],
            "superclass": ["super"] * 6,
            "status": ["Traced"] * 6,
            "statusLabel": ["Traced"] * 6,
            "somaSide": ["L"] * 6,
            "somaNeuromere": [None] * 6,
            "subclass": [None] * 6,
            "hemibrainType": [None] * 6,
        }).set_index("bodyId", drop=False)

        weights = pd.DataFrame({
            "body_pre": [1, 1, 2, 3, 2, 4],
            "body_post": [2, 3, 4, 4, 5, 6],
            "weight": [10, 20, 30, 40, 5, 50],
            "type_pre": ["Type1", "Type1", "Type2", "Type3", "Type2", "Type4"],
            "type_post": ["Type2", "Type3", "Type4", "Type4", "Type5", "Type6"],
        })

        p = LocalFeatherProvider(Path("./data"))
        p._annotations = annotations
        p._weights = weights
        p._loaded = True
        return p

    def test_cascade_hop_layer_metrics(self):
        p = self._make_graph_provider()
        res = p.compute_downstream_cascade(source_body_id=1, max_hops=3)
        assert res.is_truncated is False
        assert res.total_unique_nodes == 6
        assert len(res.layers) == 4  # Hop 0, 1, 2, 3

        # Hop 0: source node
        assert res.layers[0].hop == 0
        assert res.layers[0].newly_reached_nodes == 1
        assert res.layers[0].cumulative_nodes == 1

        # Hop 1: nodes 2 and 3
        assert res.layers[1].hop == 1
        assert res.layers[1].newly_reached_nodes == 2
        assert res.layers[1].cumulative_nodes == 3

        # Hop 2: nodes 4 and 5
        assert res.layers[2].hop == 2
        assert res.layers[2].newly_reached_nodes == 2
        assert res.layers[2].cumulative_nodes == 5

        # Hop 3: node 6
        assert res.layers[3].hop == 3
        assert res.layers[3].newly_reached_nodes == 1
        assert res.layers[3].cumulative_nodes == 6

    def test_reconvergent_routes_no_duplicate_nodes(self):
        p = self._make_graph_provider()
        # Node 4 is reached from both 2 and 3; must only be counted once at hop 2
        res = p.compute_downstream_cascade(source_body_id=1, max_hops=2)
        node_ids = [n.body_id for n in res.nodes]
        assert len(node_ids) == len(set(node_ids))
        node_4 = next(n for n in res.nodes if n.body_id == 4)
        assert node_4.hop == 2

    def test_cascade_max_nodes_truncation(self):
        p = self._make_graph_provider()
        # With max_nodes=3, source(1) + hop1(2,3) hits limit
        res = p.compute_downstream_cascade(source_body_id=1, max_hops=3, max_nodes=3)
        assert res.is_truncated is True
        assert res.truncation_reason == "max_nodes_reached"
        assert res.total_unique_nodes <= 3

    def test_cascade_min_weight_filter(self):
        p = self._make_graph_provider()
        # If min_weight=15, edge 1 -> 2 (w=10) and 2 -> 5 (w=5) are excluded
        res = p.compute_downstream_cascade(source_body_id=1, max_hops=3, min_weight=15)
        node_ids = {n.body_id for n in res.nodes}
        assert 2 not in node_ids
        assert 5 not in node_ids
        assert 3 in node_ids  # w=20




# ── Integration tests (opt-in, require local Feather files) ───────────────────

@pytest.mark.integration
class TestRealDataIntegration:
    """
    Integration tests that query the actual local MaleCNS v1.0 Feather files.

    These tests are skipped when the Feather files are not present.
    They MUST NOT be described as 'passed' when skipped.

    Run with:   pytest tests/ -v -m integration
    """

    _DATA_DIR = Path(__file__).resolve().parent.parent / "data"
    _REQUIRED_FILE = "body-annotations-male-cns-v1.0-minconf-0.5.feather"

    @pytest.fixture(autouse=True)
    def require_local_data(self):
        if not (self._DATA_DIR / self._REQUIRED_FILE).is_file():
            pytest.skip(
                "SKIPPED (integration): Local MaleCNS Feather files not found in "
                f"{self._DATA_DIR}. "
                "Place the dataset files there and re-run to execute live data tests."
            )

    _cached_provider = None

    @classmethod
    def _get_loaded_provider(cls):
        if cls._cached_provider is None:
            from backend.data_provider import LocalFeatherProvider
            p = LocalFeatherProvider(cls._DATA_DIR)
            p.load()
            cls._cached_provider = p
        return cls._cached_provider

    def test_data_loads_without_error(self):
        p = self._get_loaded_provider()
        ok, msg = p.verify_dataset()
        assert ok, f"Dataset verification failed: {msg}"
        assert "male-cns:v1.0" in msg

    def test_annotation_rows_present(self):
        p = self._get_loaded_provider()
        assert len(p._annotations) > 0, "No annotation rows loaded"

    def test_search_returns_real_results(self):
        p = self._get_loaded_provider()
        # Use a partial type string known to exist in MaleCNS
        result = p.search("DN", limit=10)
        assert result.total > 0, "Expected real neurons matching 'DN'"
        assert len(result.results) > 0

    def test_search_result_ids_exist_in_annotations(self):
        p = self._get_loaded_provider()
        result = p.search("DN", limit=5)
        for r in result.results:
            assert r.body_id in p._annotations.index, (
                f"Search returned body_id {r.body_id} not in annotations"
            )

    def test_get_neuron_by_id_from_search(self):
        """Dynamically find a neuron from search and retrieve it by ID."""
        p = self._get_loaded_provider()
        result = p.search("DN", limit=1)
        assert len(result.results) > 0, "Search returned no results"
        body_id = result.results[0].body_id
        neuron = p.get_neuron(body_id)
        assert neuron is not None
        assert neuron.body_id == body_id

    def test_connections_use_dataset_ids(self):
        """Connection body IDs must exist in the annotations."""
        p = self._get_loaded_provider()
        result = p.search("DN", limit=1)
        body_id = result.results[0].body_id
        resp = p.get_connections(body_id=body_id, direction="outgoing", limit=10)
        for c in resp.connections:
            assert c.body_pre == body_id

    def test_connection_direction_outgoing(self):
        p = self._get_loaded_provider()
        result = p.search("DN", limit=1)
        body_id = result.results[0].body_id
        resp = p.get_connections(body_id=body_id, direction="outgoing", limit=10)
        for c in resp.connections:
            assert c.body_pre == body_id, "Outgoing connection has wrong body_pre"
            assert c.body_post != body_id or c.body_pre != c.body_post

    def test_connection_direction_incoming(self):
        p = self._get_loaded_provider()
        result = p.search("DN", limit=1)
        body_id = result.results[0].body_id
        resp = p.get_connections(body_id=body_id, direction="incoming", limit=10)
        for c in resp.connections:
            assert c.body_post == body_id, "Incoming connection has wrong body_post"

    def test_neighborhood_returns_real_nodes_and_edges(self):
        p = self._get_loaded_provider()
        result = p.search("DN", limit=1)
        body_id = result.results[0].body_id
        g = p.get_neighborhood(body_id=body_id, max_nodes=20, max_edges_per_direction=10)
        assert g.node_count == len(g.nodes)
        assert g.edge_count == len(g.edges)
        assert g.center_body_id == body_id
        # Center node must be present
        assert any(n.body_id == body_id for n in g.nodes)

    def test_neighborhood_edge_direction_preserved(self):
        p = self._get_loaded_provider()
        result = p.search("DN", limit=1)
        body_id = result.results[0].body_id
        g = p.get_neighborhood(body_id=body_id, max_nodes=20, max_edges_per_direction=10)
        for edge in g.edges:
            assert edge.source == str(edge.body_pre), "Edge source != body_pre"
            assert edge.target == str(edge.body_post), "Edge target != body_post"

    def test_v2_real_data_connectivity_summary(self):
        p = self._get_loaded_provider()
        result = p.search("DNp01", limit=1)
        assert len(result.results) > 0
        body_id = result.results[0].body_id

        summary = p.get_connectivity_summary(body_id)
        assert summary is not None
        assert summary.body_id == body_id
        assert summary.incoming.record_count > 0
        assert summary.incoming.partner_count > 0
        assert summary.incoming.total_weight > 0
        assert summary.outgoing.record_count > 0
        assert summary.outgoing.partner_count > 0
        assert summary.outgoing.total_weight > 0
        assert summary.is_traced_only_subset is True
        assert len(summary.coverage_notice) > 0

    def test_v2_real_data_pagination_and_sorting(self):
        p = self._get_loaded_provider()
        result = p.search("DNp01", limit=1)
        body_id = result.results[0].body_id

        # Page 1
        p1 = p.get_connections(body_id=body_id, direction="outgoing", limit=5, offset=0, sort_by="weight", sort_order="desc")
        assert len(p1.connections) == 5
        assert p1.returned_count == 5
        assert p1.total_matched > 5
        assert p1.total_in_source == p1.total_matched
        assert p1.has_more is True

        # Check descending weights
        wts1 = [c.weight for c in p1.connections]
        assert wts1 == sorted(wts1, reverse=True)

        # Page 2
        p2 = p.get_connections(body_id=body_id, direction="outgoing", limit=5, offset=5, sort_by="weight", sort_order="desc")
        assert len(p2.connections) == 5

        # Check disjoint sets
        partners_p1 = {c.body_post for c in p1.connections}
        partners_p2 = {c.body_post for c in p2.connections}
        assert partners_p1.isdisjoint(partners_p2)

    def test_v2_real_data_connection_filtering(self):
        p = self._get_loaded_provider()
        result = p.search("DNp01", limit=1)
        body_id = result.results[0].body_id

        all_conn = p.get_connections(body_id=body_id, direction="outgoing", limit=100)
        assert len(all_conn.connections) > 0
        sample_partner = all_conn.connections[0].body_post

        filtered = p.get_connections(body_id=body_id, direction="outgoing", limit=10, partner_id=sample_partner)
        assert filtered.total_matched >= 1
        assert all(c.body_post == sample_partner for c in filtered.connections)

    def test_v3_real_data_path_search(self):
        p = self._get_loaded_provider()
        # Dynamically find a source neuron
        result = p.search("DNp01", limit=1)
        src = result.results[0].body_id

        # Find a 2-hop target dynamically
        conns_1 = p.get_connections(body_id=src, direction="outgoing", limit=5)
        assert len(conns_1.connections) > 0
        hop1_node = conns_1.connections[0].body_post

        conns_2 = p.get_connections(body_id=hop1_node, direction="outgoing", limit=5)
        assert len(conns_2.connections) > 0
        hop2_node = conns_2.connections[0].body_post

        # Search path from src to hop2_node
        res = p.find_paths(source_body_id=src, target_body_id=hop2_node, max_hops=4, max_paths=2)
        assert res.status == "found"
        assert res.returned_count >= 1
        path = res.paths[0]
        assert path.nodes[0].body_id == src
        assert path.nodes[-1].body_id == hop2_node
        # Every edge must exist and connect consecutive nodes
        for i, edge in enumerate(path.edges):
            assert edge.body_pre == path.nodes[i].body_id
            assert edge.body_post == path.nodes[i + 1].body_id
            assert edge.weight > 0

    def test_v3_real_data_downstream_cascade(self):
        p = self._get_loaded_provider()
        result = p.search("DNp01", limit=1)
        src = result.results[0].body_id

        cascade = p.compute_downstream_cascade(source_body_id=src, max_hops=2, max_nodes=500, max_edges=1000)
        assert cascade.source_body_id == src
        assert cascade.total_unique_nodes > 1
        assert len(cascade.layers) >= 2
        # Layer 0 has exactly the source neuron
        assert cascade.layers[0].hop == 0
        assert cascade.layers[0].newly_reached_nodes == 1
        assert cascade.layers[0].cumulative_nodes == 1
        # Every node has valid hop distance
        for node in cascade.nodes:
            assert 0 <= node.hop <= 2


# ── V5 Perturbation Lab Unit & Integration Tests ─────────────────────────────

class TestV5PerturbationLab:
    """Unit tests for non-destructive intervention overlay, comparison, and controlled experiments."""

    def _make_graph_provider(self):
        import pandas as pd
        from backend.data_provider import LocalFeatherProvider
        from pathlib import Path

        # Diamond graph with alternate bypass:
        # 1 -> 2 (w=10), 1 -> 3 (w=5)
        # 2 -> 4 (w=20)
        # 3 -> 4 (w=15)
        # 4 -> 5 (w=30)
        # 5 -> 1 (w=2 reverse cycle)
        annotations = pd.DataFrame({
            "bodyId": [1, 2, 3, 4, 5],
            "type": ["Type1", "Type2", "Type3", "Type4", "Type5"],
            "instance": ["inst1", "inst2", "inst3", "inst4", "inst5"],
            "superclass": ["super1", "super2", "super3", "super4", "super5"],
            "status": ["Traced"] * 5,
            "statusLabel": ["Traced"] * 5,
            "somaSide": ["L"] * 5,
            "somaNeuromere": [None] * 5,
            "subclass": [None] * 5,
            "hemibrainType": [None] * 5,
        }).set_index("bodyId", drop=False)

        weights = pd.DataFrame({
            "body_pre": [1, 1, 2, 3, 4, 5],
            "body_post": [2, 3, 4, 4, 5, 1],
            "weight": [10, 5, 20, 15, 30, 2],
            "type_pre": ["Type1", "Type1", "Type2", "Type3", "Type4", "Type5"],
            "type_post": ["Type2", "Type3", "Type4", "Type4", "Type5", "Type1"],
        })

        p = LocalFeatherProvider(Path("/dummy"))
        p._loaded = True
        p._annotations = annotations
        p._weights = weights
        p._neurotransmitters = pd.DataFrame()
        p._body_stats = pd.DataFrame()
        p._ensure_graph_indexed()
        return p

    def test_immutability_of_source_data(self):
        p = self._make_graph_provider()
        orig_weights_len = len(p._weights)
        orig_post_arr = p._post_arr.copy()
        orig_wt_arr = p._wt_arr.copy()

        # Perform path search with neuron 2 and edge (1, 3) disabled
        res = p.find_paths(
            source_body_id=1,
            target_body_id=4,
            disabled_neurons={2},
            disabled_edges={(1, 3)},
        )
        assert res.returned_count == 0  # Both routes blocked

        # Ensure underlying arrays are strictly unchanged
        assert len(p._weights) == orig_weights_len
        assert (p._post_arr == orig_post_arr).all()
        assert (p._wt_arr == orig_wt_arr).all()

    def test_disable_intermediate_neuron_finds_alternative_route(self):
        p = self._make_graph_provider()
        # Baseline shortest path 1 -> 4 can go through 2 or 3
        base = p.find_paths(source_body_id=1, target_body_id=4, max_paths=2)
        assert base.returned_count == 2

        # Disable neuron 2 -> only path through neuron 3 should remain
        pert = p.find_paths(source_body_id=1, target_body_id=4, max_paths=2, disabled_neurons={2})
        assert pert.returned_count == 1
        nodes = [n.body_id for n in pert.paths[0].nodes]
        assert nodes == [1, 3, 4]
        assert 2 not in nodes

    def test_disable_edge_preserves_reverse_edge(self):
        p = self._make_graph_provider()
        # 1 -> 2 is an edge, 5 -> 1 is an edge
        # Disabling 1 -> 2 should not affect 5 -> 1 or 3 -> 4
        pert = p.find_paths(source_body_id=1, target_body_id=4, disabled_edges={(1, 2)})
        assert pert.returned_count == 1
        nodes = [n.body_id for n in pert.paths[0].nodes]
        assert nodes == [1, 3, 4]

        # 5 -> 1 edge remains traversable
        cycle_res = p.find_paths(source_body_id=4, target_body_id=1, disabled_edges={(1, 2)})
        assert cycle_res.returned_count == 1
        assert [n.body_id for n in cycle_res.paths[0].nodes] == [4, 5, 1]

    def test_disable_endpoints_handled_gracefully(self):
        p = self._make_graph_provider()
        res_src = p.find_paths(source_body_id=1, target_body_id=4, disabled_neurons={1})
        assert res_src.status == "endpoint_disabled"
        assert res_src.returned_count == 0

        res_dst = p.find_paths(source_body_id=1, target_body_id=4, disabled_neurons={4})
        assert res_dst.status == "endpoint_disabled"
        assert res_dst.returned_count == 0

    def test_downstream_cascade_reachability_reduction(self):
        p = self._make_graph_provider()
        base_c = p.compute_downstream_cascade(source_body_id=1, max_hops=3)
        assert base_c.total_unique_nodes == 5  # 1, 2, 3, 4, 5 all reachable

        # Disabling neuron 4 disconnects 5 (and the cycle back to 1)
        pert_c = p.compute_downstream_cascade(source_body_id=1, max_hops=3, disabled_neurons={4})
        pert_nodes = {n.body_id for n in pert_c.nodes}
        assert pert_nodes == {1, 2, 3}
        assert 4 not in pert_nodes
        assert 5 not in pert_nodes

    def test_perturbation_service_comparison(self):
        from backend.perturbation_service import PerturbationService
        from backend.models import InterventionConfig, DisabledEdge, PerturbationComparisonRequest

        p = self._make_graph_provider()
        svc = PerturbationService(p)

        req = PerturbationComparisonRequest(
            interventions=InterventionConfig(
                disabled_neurons=[2],
                disabled_edges=[DisabledEdge(body_pre=1, body_post=3)],
            ),
            source_body_id=1,
            target_body_id=4,
            max_hops=3,
        )
        comp = svc.compare_perturbation(req)
        assert comp.path_comparison is not None
        assert comp.path_comparison.baseline_route_exists is True
        assert comp.path_comparison.perturbed_route_exists is False
        assert comp.reachability_comparison is not None
        assert comp.reachability_comparison.delta_reachability > 0

    def test_controlled_experiments_random_and_reproducible(self):
        from backend.perturbation_service import PerturbationService
        from backend.models import ControlledExperimentRequest

        p = self._make_graph_provider()
        svc = PerturbationService(p)

        req1 = ControlledExperimentRequest(
            experiment_type="random_nodes",
            scope_source_id=1,
            scope_target_id=4,
            removal_count=1,
            random_seed=123,
        )
        res1 = svc.run_controlled_experiment(req1)

        req2 = ControlledExperimentRequest(
            experiment_type="random_nodes",
            scope_source_id=1,
            scope_target_id=4,
            removal_count=1,
            random_seed=123,
        )
        res2 = svc.run_controlled_experiment(req2)
        assert res1.selected_interventions.disabled_neurons == res2.selected_interventions.disabled_neurons

    def test_controlled_experiments_high_degree(self):
        from backend.perturbation_service import PerturbationService
        from backend.models import ControlledExperimentRequest

        p = self._make_graph_provider()
        svc = PerturbationService(p)

        # In diamond graph: node 4 has in_degree 2, out_degree 1 (total=3)
        # Node 2 has in=1, out=1 (total=2). Node 3 has in=1, out=1 (total=2)
        # Highest degree node among eligible (excluding source 1 and target 5) should be 4
        req = ControlledExperimentRequest(
            experiment_type="high_degree_nodes",
            scope_source_id=1,
            scope_target_id=5,
            removal_count=1,
            degree_type="total",
        )
        res = svc.run_controlled_experiment(req)
        assert res.selected_interventions.disabled_neurons == [4]

    def test_validate_interventions_unverified_edge_weight_is_none(self):
        from backend.perturbation_service import PerturbationService
        from backend.models import InterventionConfig, DisabledEdge

        p = self._make_graph_provider()
        svc = PerturbationService(p)

        # Edge (1, 9999) does not exist in graph
        cfg = InterventionConfig(
            disabled_neurons=[1, 99999],
            disabled_edges=[DisabledEdge(body_pre=1, body_post=9999)],
        )
        val = svc.validate_interventions(cfg)
        assert val.valid is False
        assert 1 in val.verified_neurons
        assert 99999 in val.unverified_neurons
        assert len(val.unverified_edges) == 1
        # Crucial check: unverified edge weight must be None (not 0)
        assert val.unverified_edges[0].weight is None
        assert val.unverified_edges[0].body_pre == 1
        assert val.unverified_edges[0].body_post == 9999


# ── V6 NeuroQuery Knowledge Layer Unit Tests ─────────────────────────────────

class TestV6KnowledgeLayer:
    """Unit tests for NeuroQuery biological knowledge catalog and mapping engine."""

    def _make_mock_provider(self):
        import pandas as pd
        from backend.data_provider import LocalFeatherProvider
        from pathlib import Path

        p = LocalFeatherProvider(Path("data"))
        p._annotations = pd.DataFrame({
            "bodyId": [10001, 10002, 800146, 20001, 20002, 30001],
            "type": ["DNp01", "DNp01", "TTMn", "T4a", "T5a", "UnknownType"],
            "instance": ["DNp01_L", "DNp01_R", "TTMn_R", "T4a_L", "T5a_L", None],
            "superclass": ["descending_neuron", "descending_neuron", "vnc_motor", "ol_intrinsic", "ol_intrinsic", "vnc"],
            "status": ["Traced"] * 6,
        }).set_index("bodyId", drop=False)
        p._loaded = True
        return p

    def test_knowledge_catalog_loading_and_status(self):
        from backend.knowledge_service import KnowledgeService
        p = self._make_mock_provider()
        svc = KnowledgeService(p, knowledge_dir="data/knowledge")

        status = svc.get_status()
        assert status.catalog_loaded is True
        assert status.total_concepts >= 6
        assert status.total_evidence_sources >= 5
        assert status.total_mappings >= 6
        assert status.total_investigations >= 5
        assert status.supported_investigation_count >= 5

    def test_concept_listing_and_filtering(self):
        from backend.knowledge_service import KnowledgeService
        p = self._make_mock_provider()
        svc = KnowledgeService(p, knowledge_dir="data/knowledge")

        # List all
        all_concepts = svc.list_concepts()
        assert len(all_concepts) >= 6

        # Filter by domain
        vis_concepts = svc.list_concepts(domain="visual_processing")
        assert len(vis_concepts) >= 3
        for c in vis_concepts:
            assert c.domain == "visual_processing"

        # Filter by evidence status
        verified_concepts = svc.list_concepts(evidence_status="verified")
        assert len(verified_concepts) >= 3
        for c in verified_concepts:
            assert c.evidence_status == "verified"

        # Search query
        esc_concepts = svc.list_concepts(query="escape")
        assert any(c.concept_id == "giant_fiber_escape_circuit" for c in esc_concepts)

    def test_concept_detail_with_sources_and_mappings(self):
        from backend.knowledge_service import KnowledgeService
        p = self._make_mock_provider()
        svc = KnowledgeService(p, knowledge_dir="data/knowledge")

        detail = svc.get_concept("giant_fiber_escape_circuit")
        assert detail is not None
        assert detail.concept.concept_id == "giant_fiber_escape_circuit"
        assert len(detail.sources) >= 1
        assert any("Namiki" in s.authors for s in detail.sources)
        assert len(detail.mappings) >= 1
        assert detail.mappings[0].target_field == "type"
        assert "DNp01" in detail.mappings[0].target_values
        assert len(detail.supported_investigations) >= 1

    def test_candidate_neuron_dynamic_retrieval(self):
        from backend.knowledge_service import KnowledgeService
        p = self._make_mock_provider()
        svc = KnowledgeService(p, knowledge_dir="data/knowledge")

        # Giant fiber concept maps to DNp01 and TTMn
        candidates = svc.get_candidate_neurons("giant_fiber_escape_circuit")
        bids = {c.body_id for c in candidates}
        assert 10001 in bids
        assert 10002 in bids
        assert 800146 in bids

        # Check candidate metadata provenance
        c1 = next(c for c in candidates if c.body_id == 10001)
        assert c1.cell_type == "DNp01"
        assert c1.matched_field == "type"
        assert c1.matched_mapping_id == "map-escape-dnp01-ttmn"
        assert "src-namiki-2018" in c1.evidence_source_ids

        # Visual motion maps to T4a, T5a
        motion_cands = svc.get_candidate_neurons("visual_motion_detection_t4_t5")
        motion_bids = {c.body_id for c in motion_cands}
        assert 20001 in motion_bids
        assert 20002 in motion_bids

    def test_evidence_source_lookup(self):
        from backend.knowledge_service import KnowledgeService
        p = self._make_mock_provider()
        svc = KnowledgeService(p, knowledge_dir="data/knowledge")

        src = svc.get_evidence_source("src-schlegel-2024")
        assert src is not None
        assert "Schlegel" in src.authors
        assert src.year == 2024
        assert src.doi == "10.1038/s41586-024-07968-y"
        assert src.journal == "Nature"

    def test_knowledge_validation_report_catches_broken_references(self, tmp_path):
        import json
        from backend.knowledge_service import KnowledgeService
        p = self._make_mock_provider()

        # Create a broken catalog in temp dir
        broken_concept = [{
            "concept_id": "broken_concept",
            "display_name": "Broken Concept",
            "description": "Test",
            "domain": "test",
            "related_concepts": ["nonexistent_concept"],
            "evidence_status": "verified",
            "mapping_ids": ["nonexistent_mapping"],
            "source_references": ["nonexistent_source"],
            "dataset_compatibility": "compatible",
            "catalog_version": "1.0.0"
        }]
        (tmp_path / "concepts.json").write_text(json.dumps(broken_concept), encoding="utf-8")
        (tmp_path / "evidence-sources.json").write_text("[]", encoding="utf-8")
        (tmp_path / "concept-mappings.json").write_text("[]", encoding="utf-8")
        (tmp_path / "supported-investigations.json").write_text("[]", encoding="utf-8")
        (tmp_path / "catalog-manifest.json").write_text(json.dumps({
            "catalog_id": "test", "catalog_name": "Test", "version": "1.0.0", "description": "",
            "dataset_version": "male-cns:v1.0", "created_at": "", "last_updated": "", "schema_version": "1.0",
            "total_concepts": 1, "total_sources": 0, "total_mappings": 0, "total_investigations": 0
        }), encoding="utf-8")

        svc = KnowledgeService(p, knowledge_dir=tmp_path)
        report = svc.validate_catalog()
        assert report.valid is False
        assert any("nonexistent_source" in e for e in report.errors)
        assert any("nonexistent_mapping" in e for e in report.errors)
        assert any("nonexistent_concept" in w for w in report.warnings)

    def test_unsupported_concept_honest_representation(self):
        from backend.knowledge_service import KnowledgeService
        p = self._make_mock_provider()
        svc = KnowledgeService(p, knowledge_dir="data/knowledge")

        # Auditory concept is marked requires_review & incompatible
        aud_concept = svc._concepts.get("auditory_courtship_song_circuit")
        assert aud_concept is not None
        assert aud_concept.evidence_status == "requires_review"
        assert aud_concept.dataset_compatibility == "incompatible"
        assert "not systematically mapped" in aud_concept.coverage_notes




