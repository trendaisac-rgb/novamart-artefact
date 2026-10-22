import json

import pytest

from novamart.knowledge import KnowledgeBase
from novamart.tools import TOOLS, ToolHandlers


@pytest.fixture
def handlers(tmp_path):
    return ToolHandlers(KnowledgeBase(), tickets_file=tmp_path / "tickets.jsonl")


def test_tool_schemas_are_well_formed():
    names = {t["name"] for t in TOOLS}
    assert names == {"search_policies", "get_order_status", "escalate_to_ops", "respond"}
    for t in TOOLS:
        assert t["input_schema"]["type"] == "object"
        assert "required" in t["input_schema"]


def test_order_found(handlers):
    out = handlers.get_order_status("nm-1002")  # case and whitespace tolerant
    assert out["found"] is True
    assert out["status"] == "In transit"
    assert out["carrier"] == "UPS"


def test_order_not_found(handlers):
    out = handlers.get_order_status("NM-9999")
    assert out["found"] is False
    assert "error" in out


def test_search_tool_returns_sections(handlers):
    out = handlers.search_policies("gift card cash")
    assert out["results"][0]["doc_id"] == "gift_cards_and_store_credit"
    assert {"doc_id", "heading", "text"} <= set(out["results"][0])


def test_search_tool_empty(handlers):
    out = handlers.search_policies("zzzz qqqq")
    assert out["results"] == []
    assert "note" in out


def test_escalation_writes_a_ticket(handlers, tmp_path):
    out = handlers.escalate_to_ops(summary="Customer wants exception", priority="blocking", order_id="NM-1003")
    assert out["ticket_id"].startswith("OPS-")
    assert out["expected_response"] == "2 hours"
    lines = (tmp_path / "tickets.jsonl").read_text().splitlines()
    ticket = json.loads(lines[-1])
    assert ticket["order_id"] == "NM-1003"


def test_dispatch_handles_unknown_tool_and_bad_args(handlers):
    assert "error" in handlers.dispatch("nope", {})
    assert "error" in handlers.dispatch("get_order_status", {"wrong": 1})
