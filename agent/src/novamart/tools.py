"""Tool definitions (JSON schemas sent to the model) and their handlers.

Four tools:
- search_policies: retrieval over the policy documents (see knowledge.py).
- get_order_status: mock of NovaMart's order API, backed by data/orders.json.
- escalate_to_ops: creates a ticket for the Operations team (mock, appends to a file).
- respond: the agent's final answer, as structured data. Making the final answer a
  tool call is what makes "declined" a first-class, testable state instead of a
  sentence we would have to detect with regex.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .config import ORDERS_FILE, TICKETS_FILE
from .knowledge import KnowledgeBase

TOOLS: list[dict] = [
    {
        "name": "search_policies",
        "description": (
            "Search NovaMart's internal policy documentation. Returns the most relevant "
            "sections with their document id and heading. Use it for any question about "
            "returns, exchanges, refunds, price match, damaged items, deliveries, gift cards, "
            "loyalty points or escalation rules. Search again with different wording if the "
            "first results do not cover the question."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keywords or a short question."}
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_order_status",
        "description": (
            "Look up a customer order by order number (format NM-####). Returns status, "
            "items, carrier, tracking and the last tracking event. Use it whenever the "
            "question is about a specific order. Never guess an order's status."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"order_id": {"type": "string", "description": "Order number, e.g. NM-1002"}},
            "required": ["order_id"],
        },
    },
    {
        "name": "escalate_to_ops",
        "description": (
            "Open a ticket with the Operations helpdesk. Use it when the policies say the "
            "case needs Operations, when the question is not covered by the documentation "
            "and the employee needs an answer, or when a human decision is required."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "One paragraph: customer request, what was checked, what was told so far.",
                },
                "order_id": {"type": "string", "description": "Order number if the case involves one."},
                "priority": {
                    "type": "string",
                    "enum": ["blocking", "normal"],
                    "description": "blocking = a sale or refund is stuck right now.",
                },
            },
            "required": ["summary", "priority"],
        },
    },
    {
        "name": "respond",
        "description": (
            "Deliver the final answer to the employee. Always finish with this tool. "
            "status=answered when the answer is grounded in the documentation or in tool "
            "results. status=declined when the documentation does not cover the question. "
            "status=escalated when a ticket was opened or a human decision is needed. "
            "status=needs_info when you need one detail from the employee (for example the order number) before you can answer."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["answered", "declined", "escalated", "needs_info"]},
                "answer": {
                    "type": "string",
                    "description": "The direct answer, 1 to 4 short sentences. For declined: say plainly what is not covered.",
                },
                "next_step": {
                    "type": "string",
                    "description": "What the employee should do now, in one or two sentences.",
                },
                "sources": {
                    "type": "array",
                    "description": "Sections the answer is based on. Empty for declined.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "doc_id": {"type": "string"},
                            "heading": {"type": "string"},
                        },
                        "required": ["doc_id", "heading"],
                    },
                },
                "decline_reason": {
                    "type": "string",
                    "enum": ["not_in_docs", "out_of_scope", "needs_human"],
                    "description": "Only for declined or escalated.",
                },
            },
            "required": ["status", "answer", "next_step", "sources"],
        },
    },
]


class ToolHandlers:
    """Executes tool calls. Kept separate from the schemas so tests can call them directly."""

    def __init__(self, kb: KnowledgeBase, orders_file=ORDERS_FILE, tickets_file=TICKETS_FILE):
        self.kb = kb
        self.orders = json.loads(orders_file.read_text(encoding="utf-8"))
        self.tickets_file = tickets_file

    def search_policies(self, query: str) -> dict:
        results = self.kb.search(query)
        if not results:
            return {"results": [], "note": "No section matched. Try other words, or decline if the topic is not in the catalog."}
        return {"results": [{"doc_id": r["doc_id"], "heading": r["heading"], "text": r["text"]} for r in results]}

    def get_order_status(self, order_id: str) -> dict:
        order = self.orders.get(order_id.strip().upper())
        if order is None:
            return {"found": False, "order_id": order_id, "error": "Order not found. Check the number with the customer."}
        return {"found": True, **order}

    def escalate_to_ops(self, summary: str, priority: str = "normal", order_id: str | None = None) -> dict:
        ticket = {
            "ticket_id": f"OPS-{uuid.uuid4().hex[:6].upper()}",
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "priority": priority,
            "order_id": order_id,
            "summary": summary,
        }
        with self.tickets_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps(ticket, ensure_ascii=False) + "\n")
        sla = "2 hours" if priority == "blocking" else "1 business day"
        return {"ticket_id": ticket["ticket_id"], "expected_response": sla}

    def dispatch(self, name: str, args: dict) -> dict:
        handler = getattr(self, name, None)
        if handler is None:
            return {"error": f"Unknown tool: {name}"}
        try:
            return handler(**args)
        except TypeError as exc:
            return {"error": f"Bad arguments for {name}: {exc}"}
