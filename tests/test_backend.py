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

    def _get_loaded_provider(self):
        from backend.data_provider import LocalFeatherProvider
        p = LocalFeatherProvider(self._DATA_DIR)
        p.load()
        return p

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
