"""Tests the agent loop without calling the API.

A scripted fake client returns pre-defined tool calls in order, so we can check that
the loop executes tools, feeds results back, handles a premature `respond`, and
stops safely when the model never finishes.
"""

from types import SimpleNamespace

import pytest

from novamart import agent as agent_module
from novamart.agent import Agent
from novamart.knowledge import KnowledgeBase


def tool_use(name, input, id="tu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=input, id=id)


class FakeClient:
    """Each item in `script` is the content list for one API call."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        content = self.script.pop(0) if self.script else [tool_use("search_policies", {"query": "loop"})]
        return SimpleNamespace(content=content, usage=SimpleNamespace(input_tokens=10, output_tokens=5,
                                                                      cache_read_input_tokens=0))


@pytest.fixture
def kb():
    return KnowledgeBase()


def test_search_then_respond(kb):
    client = FakeClient([
        [tool_use("search_policies", {"query": "laptop return window"})],
        [tool_use("respond", {"status": "answered", "answer": "15 days.", "next_step": "Check the receipt date.",
                              "sources": [{"doc_id": "returns_and_refunds", "heading": "Standard return window"}]})],
    ])
    result = Agent(kb=kb, client=client, log_gaps=False).run("return window for a laptop?")

    assert result.status == "answered"
    assert result.grounded
    assert result.steps == 2
    assert [t["tool"] for t in result.trace] == ["search_policies"]
    assert result.trace[0]["output"]["results"][0]["doc_id"] == "returns_and_refunds"

    # The second API call must carry the tool result back to the model.
    second_call_messages = client.calls[1]["messages"]
    assert second_call_messages[-1]["role"] == "user"
    assert second_call_messages[-1]["content"][0]["type"] == "tool_result"
    assert client.calls[0]["tool_choice"] == {"type": "any"}


def test_order_lookup_counts_as_grounding(kb):
    client = FakeClient([
        [tool_use("get_order_status", {"order_id": "NM-1002"})],
        [tool_use("respond", {"status": "answered", "answer": "In transit with UPS.", "next_step": "", "sources": []})],
    ])
    result = Agent(kb=kb, client=client, log_gaps=False).run("where is NM-1002?")
    assert result.status == "answered"
    assert result.grounded


def test_premature_respond_is_rejected_and_loop_continues(kb):
    client = FakeClient([
        [tool_use("search_policies", {"query": "x"}, id="a"),
         tool_use("respond", {"status": "answered", "answer": "early", "next_step": "", "sources": []}, id="b")],
        [tool_use("respond", {"status": "declined", "answer": "Not covered.", "next_step": "Open a ticket.",
                              "sources": [], "decline_reason": "not_in_docs"})],
    ])
    result = Agent(kb=kb, client=client, log_gaps=False).run("something")
    assert result.status == "declined"
    assert result.decline_reason == "not_in_docs"
    # Both tool_use ids got a tool_result, otherwise the API would reject the next call.
    results = client.calls[1]["messages"][-1]["content"]
    assert {r["tool_use_id"] for r in results} == {"a", "b"}
    assert any("Ignored" in r["content"] for r in results)


def test_declines_are_logged_as_knowledge_gaps(kb, tmp_path):
    gaps_file = tmp_path / "gaps.jsonl"
    client = FakeClient([
        [tool_use("search_policies", {"query": "employee discount"})],
        [tool_use("respond", {"status": "declined", "answer": "Not in the docs.", "next_step": "Ask Ops.",
                              "sources": [], "decline_reason": "not_in_docs"})],
    ])
    from novamart import gaps

    a = Agent(kb=kb, client=client, log_gaps=True, gaps_file=gaps_file)
    result = a.run("what is the employee discount?", store_id="S-001")
    assert result.status == "declined"
    entries = gaps.load_gaps(gaps_file)
    assert len(entries) == 1
    assert entries[0]["store_id"] == "S-001"
    assert entries[0]["searches"] == ["employee discount"]


def test_max_steps_fallback(kb, monkeypatch):
    monkeypatch.setattr(agent_module, "MAX_AGENT_STEPS", 3)
    client = FakeClient([])  # never responds, keeps searching
    result = Agent(kb=kb, client=client, log_gaps=False).run("loop forever")
    assert result.status == "declined"
    assert result.note == "max steps reached"
    assert len(client.calls) == 3


def test_free_text_without_respond_is_declined(kb):
    text_block = SimpleNamespace(type="text", text="Probably 30 days, I think.")
    client = FakeClient([[text_block]])
    result = Agent(kb=kb, client=client, log_gaps=False).run("q")
    assert result.status == "declined"
    assert "Probably" not in result.answer  # ungrounded text never reaches the employee
    assert result.note == "model returned text without calling respond"


def test_events_follow_the_loop(kb):
    client = FakeClient([
        [tool_use("get_order_status", {"order_id": "NM-1002"})],
        [tool_use("respond", {"status": "answered", "answer": "In transit.", "next_step": "", "sources": []})],
    ])
    events = []
    Agent(kb=kb, client=client, log_gaps=False).run("where is NM-1002?", on_event=events.append)
    assert [e["type"] for e in events] == ["step", "tool_call", "tool_result", "step", "result"]
    assert events[2]["output"]["status"] == "In transit"
    assert events[-1]["result"]["status"] == "answered"


def test_invalid_status_is_downgraded(kb):
    client = FakeClient([
        [tool_use("respond", {"status": "maybe", "answer": "?", "next_step": "", "sources": []})],
    ])
    result = Agent(kb=kb, client=client, log_gaps=False).run("q")
    assert result.status == "declined"
    assert "invalid status" in result.note
