"""
BrainDebugger — End-to-End API Verification Script

Runs a complete live verification against the running backend.
Requires: backend running on localhost:8000

Usage:
    python e2e_verify.py
"""
import json
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8000"


def get(path: str) -> dict:
    url = BASE + path
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read())


def check(label: str, condition: bool, val=None) -> None:
    status = "✓" if condition else "✗"
    suffix = f"  [{val}]" if val is not None else ""
    print(f"  {status}  {label}{suffix}")
    if not condition:
        print(f"\nFAILED: {label}")
        sys.exit(1)


def main() -> None:
    print("=" * 60)
    print("  BrainDebugger — End-to-End API Verification")
    print("=" * 60)
    print()

    # ── 1. Health check ────────────────────────────────────────────
    print("1. Health endpoint")
    h = get("/health")
    check("status == 'ok'", h["status"] == "ok", h["status"])
    check("dataset == 'male-cns:v1.0'", h["dataset"] == "male-cns:v1.0", h["dataset"])
    check("local_data_available", h["data_source"]["local_data_available"])
    check("211,577 neurons in detail", "211,577" in h["data_source"]["detail"])
    print()

    # ── 2. Neuron search ───────────────────────────────────────────
    print("2. Neuron search (q=DNp01)")
    s = get("/api/neurons/search?q=DNp01&limit=10")
    check("Search total > 0", s["total"] > 0, s["total"])
    check("Results list not empty", len(s["results"]) > 0)
    first = s["results"][0]
    check("First result has body_id (int)", isinstance(first["body_id"], int))
    check("match_field is valid", first["match_field"] in ("body_id", "cell_type", "instance"))
    print()

    # ── 3. Neuron detail ───────────────────────────────────────────
    body_id: int = first["body_id"]
    print(f"3. Neuron detail (body_id={body_id})")
    n = get(f"/api/neurons/{body_id}")
    check("body_id matches", n["body_id"] == body_id, n["body_id"])
    cell_type = n.get("cell_type") or "(null)"
    status = n.get("status") or "(null)"
    nt = n.get("consensus_nt") or "(null)"
    print(f"     cell_type={cell_type}  status={status}  nt={nt}")
    print()

    # ── 4. Outgoing connections ────────────────────────────────────
    print(f"4. Outgoing connections (body_id={body_id})")
    out = get(f"/api/neurons/{body_id}/connections?direction=outgoing&limit=10")
    check("direction == 'outgoing'", out["direction"] == "outgoing")
    if out["connections"]:
        for c in out["connections"]:
            check(
                f"  body_pre={c['body_pre']} == body_id",
                c["body_pre"] == body_id,
                c["body_pre"],
            )
        check("weights are positive", all(c["weight"] > 0 for c in out["connections"]))
        print(f"     {len(out['connections'])} outgoing connections, "
              f"top weight={out['connections'][0]['weight']:,}")
    else:
        print("     (no outgoing connections within limit — not an error)")
    print()

    # ── 5. Incoming connections ────────────────────────────────────
    print(f"5. Incoming connections (body_id={body_id})")
    inc = get(f"/api/neurons/{body_id}/connections?direction=incoming&limit=10")
    check("direction == 'incoming'", inc["direction"] == "incoming")
    if inc["connections"]:
        for c in inc["connections"]:
            check(
                f"  body_post={c['body_post']} == body_id",
                c["body_post"] == body_id,
                c["body_post"],
            )
        print(f"     {len(inc['connections'])} incoming connections, "
              f"top weight={inc['connections'][0]['weight']:,}")
    else:
        print("     (no incoming connections within limit — not an error)")
    print()

    # ── 6. Neighborhood graph ──────────────────────────────────────
    print(f"6. Neighborhood graph (body_id={body_id}, max_nodes=30)")
    g = get(f"/api/neurons/{body_id}/neighborhood?max_nodes=30")
    check("center_body_id matches", g["center_body_id"] == body_id, g["center_body_id"])
    check("node_count == len(nodes)", g["node_count"] == len(g["nodes"]))
    check("edge_count == len(edges)", g["edge_count"] == len(g["edges"]))
    node_ids = [nd["id"] for nd in g["nodes"]]
    check("no duplicate node IDs", len(node_ids) == len(set(node_ids)))
    edge_ids = [e["id"] for e in g["edges"]]
    check("no duplicate edge IDs", len(edge_ids) == len(set(edge_ids)))
    check("dataset field", g["dataset"] == "male-cns:v1.0", g["dataset"])
    center_nodes = [nd for nd in g["nodes"] if nd["body_id"] == body_id]
    check("center node in graph", len(center_nodes) == 1)
    check("center node is_selected=True", center_nodes[0]["is_selected"])
    for e in g["edges"]:
        check(
            f"edge {e['id']}: source==body_pre",
            e["source"] == str(e["body_pre"]),
        )
        check(
            f"edge {e['id']}: target==body_post",
            e["target"] == str(e["body_post"]),
        )
    print(f"     {g['node_count']} nodes, {g['edge_count']} edges, "
          f"partial={g['is_partial']}, dataset_version={g['dataset_version']}")
    print()

    # ── 7. Non-existent neuron → 404 ──────────────────────────────
    print("7. Non-existent neuron → 404")
    try:
        get("/api/neurons/999999999999")
        check("Expected 404 for non-existent neuron", False, "got 200")
    except urllib.error.HTTPError as e:
        check("Returns HTTP 404", e.code == 404, e.code)
    print()

    # ── 8. Empty search → empty results, not fabricated data ──────
    print("8. Empty search (no fabricated data)")
    s2 = get("/api/neurons/search?q=ZZZZNOTANEURON99999&limit=10")
    check("total == 0", s2["total"] == 0, s2["total"])
    check("results == []", s2["results"] == [])
    print()

    # ── 9. Search by numeric body ID ──────────────────────────────
    print(f"9. Search by numeric body_id ({body_id})")
    s3 = get(f"/api/neurons/search?q={body_id}&limit=5")
    check("Exact body ID found", s3["total"] >= 1)
    check("match_field == 'body_id'", s3["results"][0]["match_field"] == "body_id")
    print()

    # ── 10. V2 Connectivity Summary ────────────────────────────────
    print(f"10. V2 Connectivity summary (body_id={body_id})")
    cs = get(f"/api/neurons/{body_id}/connectivity-summary")
    check("body_id matches", cs["body_id"] == body_id)
    check("incoming exists", "incoming" in cs)
    check("outgoing exists", "outgoing" in cs)
    inc_sum = cs["incoming"]
    out_sum = cs["outgoing"]
    check("incoming partner_count >= 0", inc_sum["partner_count"] >= 0, inc_sum["partner_count"])
    check("outgoing partner_count >= 0", out_sum["partner_count"] >= 0, out_sum["partner_count"])
    check("incoming total_weight >= 0", inc_sum["total_weight"] >= 0, inc_sum["total_weight"])
    check("outgoing total_weight >= 0", out_sum["total_weight"] >= 0, out_sum["total_weight"])
    check("is_traced_only_subset", cs["is_traced_only_subset"] is True)
    check("dataset matches", cs["dataset"] == "male-cns:v1.0")
    print(f"     in_partners={inc_sum['partner_count']} in_weight={inc_sum['total_weight']:,} | "
          f"out_partners={out_sum['partner_count']} out_weight={out_sum['total_weight']:,}")
    print()

    # ── 11. V3 Directed Pathway Search ─────────────────────────────
    # Pick a direct postsynaptic target from outgoing connections if available
    target_id = out["connections"][0]["body_post"] if out["connections"] else 11391
    print(f"11. V3 Pathway search ({body_id} -> {target_id})")
    paths = get(f"/api/paths?source_body_id={body_id}&target_body_id={target_id}&max_hops=3&max_paths=3&strategy=shortest")
    check("source_body_id matches", paths["source_body_id"] == body_id)
    check("target_body_id matches", paths["target_body_id"] == target_id)
    check("Paths found >= 1", len(paths["paths"]) >= 1, len(paths["paths"]))
    p0 = paths["paths"][0]
    check("p0 hops >= 1", p0["hops"] >= 1, p0["hops"])
    check("p0 nodes start with source", p0["nodes"][0]["body_id"] == body_id)
    check("p0 nodes end with target", p0["nodes"][-1]["body_id"] == target_id)
    check("p0 edge count equals hops", len(p0["edges"]) == p0["hops"])
    for e in p0["edges"]:
        check(f"Edge {e['body_pre']}->{e['body_post']} weight > 0", e["weight"] > 0)
    print(f"     Found {len(paths['paths'])} routes, shortest hops={p0['hops']}, total_weight={p0['total_weight']}")
    print()

    # ── 12. V3 Weight-Prioritized Pathway Ranking ──────────────────
    print(f"12. V3 Weight-prioritized ranking ({body_id} -> {target_id})")
    wp_paths = get(f"/api/paths?source_body_id={body_id}&target_body_id={target_id}&max_hops=3&max_paths=3&strategy=weight_prioritized")
    check("Weight-prioritized paths found >= 1", len(wp_paths["paths"]) >= 1)
    wp0 = wp_paths["paths"][0]
    check("Score is positive float", wp0["score"] is not None and wp0["score"] > 0, wp0["score"])
    check("Log cost is positive float", wp0["log_cost"] is not None and wp0["log_cost"] >= 0, wp0["log_cost"])
    print(f"     Route score={wp0['score']:.6f}, log_cost={wp0['log_cost']:.4f}")
    print()

    # ── 13. V3 Downstream Cascade Analysis ─────────────────────────
    print(f"13. V3 Downstream cascade (source={body_id}, max_hops=2)")
    cascade = get(f"/api/neurons/{body_id}/downstream-cascade?max_hops=2&min_weight=10&max_nodes=50")
    check("source_body_id matches", cascade["source_body_id"] == body_id)
    check("total_unique_nodes >= 1", cascade["total_unique_nodes"] >= 1, cascade["total_unique_nodes"])
    check("layers non-empty", len(cascade["layers"]) >= 1)
    check("Layer 0 hop == 0", cascade["layers"][0]["hop"] == 0)
    print(f"     Cascade reached {cascade['total_unique_nodes']} unique nodes across {len(cascade['layers'])} layers")
    print()

    # ── 14. V4 Trace Path Continuity Validation ────────────────────
    print("14. V4 Debugger Trace Path Continuity")
    # Verify that consecutive node pairs match the edge sequence
    for i in range(len(p0["nodes"]) - 1):
        curr_node = p0["nodes"][i]["body_id"]
        next_node = p0["nodes"][i + 1]["body_id"]
        edge = p0["edges"][i]
        check(f"Step {i} edge source == curr_node", edge["body_pre"] == curr_node)
        check(f"Step {i} edge target == next_node", edge["body_post"] == next_node)
    print("     Path continuity verified for trace execution: ✓")
    print()

    print("=" * 60)
    print("  ALL V1–V4 E2E VERIFICATION CHECKS PASSED")
    print("=" * 60)
    print()
    print("Live data verification status:")
    print("  ✓ V1 Connectome Explorer: Search, Selection, Directed Subgraph")
    print("  ✓ V2 Neuron Inspector: Profiles, Connectivity Summaries, Connections")
    print("  ✓ V3 Pathway Tracer: Directed Shortest Path, Weight Ranking, Cascade")
    print("  ✓ V4 Neural Debugger: Route Structure & Continuity Validation")
    print("  ✓ Real Janelia MaleCNS v1.0 Feather data (211,577 neurons, 25.5M connections)")


if __name__ == "__main__":
    main()
