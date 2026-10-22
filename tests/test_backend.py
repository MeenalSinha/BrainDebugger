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

