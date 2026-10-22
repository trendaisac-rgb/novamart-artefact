"""The agent loop.

One question in, one structured result out. The model decides which tools to call
(search, order lookup, escalation) and must end by calling `respond`. The loop is
plain Python on top of the Anthropic SDK: no framework, so every step is visible
and testable.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Callable

import anthropic

from . import gaps
from .config import AGENT_MODEL, GAPS_FILE, MAX_AGENT_STEPS, MAX_TOKENS
from .knowledge import KnowledgeBase
from .prompts import build_system_prompt
from .tools import TOOLS, ToolHandlers

VALID_STATUS = {"answered", "declined", "escalated", "needs_info"}

# Optional callback that receives each step as it happens. The CLI ignores it;
# the HTTP API streams it to the UI so the employee sees what the agent is doing.
EventHandler = Callable[[dict], None]


def _no_events(_: dict) -> None:
    pass


@dataclass
class AgentResult:
    status: str
    answer: str
    next_step: str = ""
    sources: list[dict] = field(default_factory=list)
    decline_reason: str | None = None
    ticket_id: str | None = None
    trace: list[dict] = field(default_factory=list)  # tool calls, in order
    steps: int = 0
    usage: dict = field(default_factory=dict)
    note: str | None = None  # anything unusual the loop had to handle

    @property
    def grounded(self) -> bool:
        """An answer counts as grounded if it cites a section or used a data tool."""
        if self.status != "answered":
            return True
        used_data_tool = any(t["tool"] == "get_order_status" for t in self.trace)
        return bool(self.sources) or used_data_tool

    @property
    def searches(self) -> list[str]:
        return [t["input"].get("query", "") for t in self.trace if t["tool"] == "search_policies"]

    def to_dict(self) -> dict:
        d = asdict(self)
        d["grounded"] = self.grounded
        return d


class Agent:
    def __init__(
        self,
        kb: KnowledgeBase | None = None,
        client: Any | None = None,
        model: str = AGENT_MODEL,
        log_gaps: bool = True,
        gaps_file: Path = GAPS_FILE,
    ):
        self.kb = kb or KnowledgeBase()
        self.client = client or anthropic.Anthropic()
        self.model = model
        self.handlers = ToolHandlers(self.kb)
        self.system_prompt = build_system_prompt(self.kb.catalog())
        self.log_gaps = log_gaps
        self.gaps_file = gaps_file

        # Prompt caching: tools + system prompt are identical for every call, so the
        # cache breakpoint on the system block makes each question pay for the prefix once.
        self._system = [{"type": "text", "text": self.system_prompt, "cache_control": {"type": "ephemeral"}}]

    def run(
        self,
        question: str,
        store_id: str | None = None,
        history: list[dict] | None = None,
        on_event: EventHandler | None = None,
    ) -> AgentResult:
        emit = on_event or _no_events
        user_text = f"[Store {store_id}] {question}" if store_id else question
        messages: list[dict] = list(history or []) + [{"role": "user", "content": user_text}]
        trace: list[dict] = []
        usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}
        ticket_id: str | None = None

        for step in range(1, MAX_AGENT_STEPS + 1):
            emit({"type": "step", "step": step})
            response = self.client.messages.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                temperature=0,
                system=self._system,
                tools=TOOLS,
                tool_choice={"type": "any"},  # the model must act; `respond` is the exit
                messages=list(messages),
            )
            self._add_usage(usage, response)

            tool_uses = [b for b in response.content if b.type == "tool_use"]
            if not tool_uses:
                # Should not happen with tool_choice=any. Free text has no status and no
                # sources, so it is not a grounded answer: decline instead of passing it on.
                result = AgentResult(
                    status="declined",
                    answer="I could not produce a grounded answer. Please contact the Operations helpdesk.",
                    next_step="Open a ticket with the Operations helpdesk with the customer's request.",
                    decline_reason="not_in_docs",
                    trace=trace, steps=step, usage=usage, ticket_id=ticket_id,
                    note="model returned text without calling respond",
                )
                return self._finalize(result, question, store_id, emit)

            messages.append({"role": "assistant", "content": response.content})

            respond_call = next((t for t in tool_uses if t.name == "respond"), None)
            others = [t for t in tool_uses if t.name != "respond"]

            if respond_call is not None and not others:
                result = self._build_result(dict(respond_call.input), trace, step, usage, ticket_id)
                return self._finalize(result, question, store_id, emit)

            # Execute the real tools, return their results, and keep looping.
            tool_results = []
            for call in others:
                args = dict(call.input)
                emit({"type": "tool_call", "tool": call.name, "input": args})
                output = self.handlers.dispatch(call.name, args)
                emit({"type": "tool_result", "tool": call.name, "input": args, "output": output})
                if call.name == "escalate_to_ops" and "ticket_id" in output:
                    ticket_id = output["ticket_id"]
                trace.append({"tool": call.name, "input": args, "output": output})
                tool_results.append({"type": "tool_result", "tool_use_id": call.id,
                                     "content": json.dumps(output, ensure_ascii=False)})
            if respond_call is not None:
                # respond arrived together with other tools, so it was written before
                # seeing their results. Reject it and let the model respond again.
                tool_results.append({"type": "tool_result", "tool_use_id": respond_call.id,
                                     "content": "Ignored: call respond alone, after reading the tool results."})
            messages.append({"role": "user", "content": tool_results})

        result = AgentResult(
            status="declined",
            answer="I could not complete this request. Please contact the Operations helpdesk.",
            next_step="Open a ticket with the Operations helpdesk with the customer's request.",
            decline_reason="not_in_docs",
            trace=trace, steps=MAX_AGENT_STEPS, usage=usage, ticket_id=ticket_id,
            note="max steps reached",
        )
        return self._finalize(result, question, store_id, emit)

    @staticmethod
    def _add_usage(usage: dict, response: Any) -> None:
        u = getattr(response, "usage", None)
        if u is None:
            return
        usage["input_tokens"] += getattr(u, "input_tokens", 0) or 0
        usage["output_tokens"] += getattr(u, "output_tokens", 0) or 0
        usage["cache_read_input_tokens"] += getattr(u, "cache_read_input_tokens", 0) or 0

    @staticmethod
    def _build_result(data: dict, trace: list[dict], steps: int, usage: dict, ticket_id: str | None) -> AgentResult:
        status = data.get("status", "answered")
        note = None
        if status not in VALID_STATUS:
            note = f"invalid status '{status}', treated as declined"
            status = "declined"
        return AgentResult(
            status=status,
            answer=str(data.get("answer", "")).strip(),
            next_step=str(data.get("next_step", "")).strip(),
            sources=[s for s in data.get("sources", []) if isinstance(s, dict)],
            decline_reason=data.get("decline_reason"),
            ticket_id=ticket_id,
            trace=trace,
            steps=steps,
            usage=usage,
            note=note,
        )

    def _finalize(self, result: AgentResult, question: str, store_id: str | None,
                  emit: EventHandler = _no_events) -> AgentResult:
        if self.log_gaps and result.status in ("declined", "escalated"):
            gaps.log_gap(question, store_id, result, path=self.gaps_file)
        emit({"type": "result", "result": result.to_dict()})
        return result
