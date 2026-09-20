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


def test_connection_sort_validation_and_csv_export() -> None:
    neuron_id = first_neuron_id()
    invalid = client.get(f"/api/neurons/{neuron_id}/incoming?sort=unsupported")
    exported = client.get(f"/api/neurons/{neuron_id}/connections/incoming/export")
    assert invalid.status_code == 422
    assert exported.status_code == 200
    assert "source,target,weight" in exported.text
    assert "Content-Disposition" in exported.headers


def test_export_markdown() -> None:
    neuron_id = first_neuron_id()
    response = client.get(f"/api/neurons/{neuron_id}/export?format=markdown")
    assert response.status_code == 200
    assert "Scientific Limitations" in response.text
    assert "Content-Disposition" in response.headers


def test_invalid_neuron() -> None:
    response = client.get("/api/neurons/not-a-real-neuron")
    assert response.status_code == 404
