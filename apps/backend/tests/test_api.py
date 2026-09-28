from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.routes import store
from app.main import app


client = TestClient(app)


def setup_module() -> None:
    if not store.neurons:
        store.load()


def first_neuron_id() -> str:
    return next(iter(store.neurons))


def test_health() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["datasetLoaded"] is True


def test_search_endpoint() -> None:
    neuron_id = first_neuron_id()
    response = client.get(f"/api/neurons/search?q={neuron_id}")
    assert response.status_code == 200
    assert response.json()["data"]
    assert store.search_documents
    assert store.search_tokens
    assert store.search_ngrams

    partial = neuron_id[1:]
    partial_response = client.get(f"/api/neurons/search?q={partial}")
    assert partial_response.status_code == 200
    assert any(item["id"] == neuron_id for item in partial_response.json()["data"])


def test_neuron_detail_and_statistics() -> None:
    neuron_id = first_neuron_id()
    detail = client.get(f"/api/neurons/{neuron_id}")
    stats = client.get(f"/api/neurons/{neuron_id}/statistics")
    assert detail.status_code == 200
    assert stats.status_code == 200
    assert "inDegree" in stats.json()["data"]


def test_connections_and_neighborhood() -> None:
    neuron_id = first_neuron_id()
    incoming = client.get(f"/api/neurons/{neuron_id}/incoming?page_size=5")
    outgoing = client.get(f"/api/neurons/{neuron_id}/outgoing?page_size=5")
    neighborhood = client.get(f"/api/neurons/{neuron_id}/neighborhood?max_nodes=25")
    assert incoming.status_code == 200
    assert outgoing.status_code == 200
    assert neighborhood.status_code == 200
    assert "nodes" in neighborhood.json()["data"]


def test_neighborhood_respects_hard_node_limits() -> None:
    neuron_id = first_neuron_id()
    for max_nodes in (1, 2, 25, 50, 250):
        response = client.get(f"/api/neurons/{neuron_id}/neighborhood?max_nodes={max_nodes}")
        assert response.status_code == 200
        data = response.json()["data"]
        node_ids = {node["id"] for node in data["nodes"]}
        assert neuron_id in node_ids
        assert len(node_ids) <= max_nodes
        assert all(str(edge["source"]) in node_ids and str(edge["target"]) in node_ids for edge in data["edges"])
        assert data["available"] >= len(node_ids)
        assert data["truncated"] is (data["available"] > len(node_ids))


def test_connection_sort_validation_and_csv_export() -> None:
    neuron_id = first_neuron_id()
    invalid = client.get(f"/api/neurons/{neuron_id}/incoming?sort=unsupported")
    exported = client.get(f"/api/neurons/{neuron_id}/connections/incoming/export")
    assert invalid.status_code == 422
    assert exported.status_code == 200
    assert "source,target,weight" in exported.text
    assert "Content-Disposition" in exported.headers


def test_connection_csv_export_includes_all_matching_rows() -> None:
    neuron_id = next(nid for nid in store.neurons if len(store.outgoing[nid]) > 100)
    expected_total = len(store.outgoing[neuron_id])
    response = client.get(f"/api/neurons/{neuron_id}/connections/outgoing/export")
    assert response.status_code == 200
    lines = [line for line in response.text.splitlines() if line]
    assert lines[0].startswith("source,target,weight")
    assert len(lines) == expected_total + 1


def test_export_markdown() -> None:
    neuron_id = first_neuron_id()
    response = client.get(f"/api/neurons/{neuron_id}/export?format=markdown")
    assert response.status_code == 200
    assert "Scientific Limitations" in response.text
    assert "Content-Disposition" in response.headers


def test_invalid_neuron() -> None:
    response = client.get("/api/neurons/not-a-real-neuron")
    assert response.status_code == 404
