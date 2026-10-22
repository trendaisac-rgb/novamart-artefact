"""The HTTP API, with the same scripted fake client as the agent tests. No API key needed."""

import json

from fastapi.testclient import TestClient

from novamart.agent import Agent
from novamart.knowledge import KnowledgeBase
from novamart.server import create_app

from test_agent_offline import FakeClient, tool_use


def make_client(script, tmp_path):
    agent = Agent(kb=KnowledgeBase(), client=FakeClient(script), gaps_file=tmp_path / "gaps.jsonl")
    return TestClient(create_app(agent=agent, gaps_file=tmp_path / "gaps.jsonl", eval_dir=tmp_path))


def test_health_and_catalog(tmp_path):
    api = make_client([], tmp_path)
    health = api.get("/api/health").json()
    assert health["agent_ready"] is True
    assert health["documents"] == 8
    catalog = api.get("/api/catalog").json()
    assert {d["doc_id"] for d in catalog} >= {"price_match", "returns_and_refunds"}
    assert api.get("/api/policies/price_match").json()["sections"][0]["heading"] == "Who we match"
    assert api.get("/api/policies/nope").status_code == 404


def test_ask_streams_steps_then_result(tmp_path):
    api = make_client([
        [tool_use("search_policies", {"query": "employee discount"})],
        [tool_use("respond", {"status": "declined", "answer": "Not covered.", "next_step": "Ask Ops.",
                              "sources": [], "decline_reason": "not_in_docs"})],
    ], tmp_path)
    with api.stream("POST", "/api/ask", json={"question": "employee discount?", "store_id": "S-012"}) as r:
        events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]
    types = [e["type"] for e in events]
    assert types == ["step", "tool_call", "tool_result", "step", "result", "done"]
    assert events[4]["result"]["status"] == "declined"

    # The decline is now an Ops work item.
    gaps = api.get("/api/gaps").json()
    assert gaps["total"] == 1
    assert gaps["entries"][0]["store_id"] == "S-012"


def test_evals_endpoint_is_honest_when_no_run(tmp_path):
    api = make_client([], tmp_path)
    assert api.get("/api/evals/latest").status_code == 404
    (tmp_path / "latest.json").write_text(json.dumps({"passed": 1, "total": 1}))
    assert api.get("/api/evals/latest").json()["passed"] == 1
