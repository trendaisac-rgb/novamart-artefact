"""Command line chat for the assistant.

    python -m novamart.cli                       interactive
    python -m novamart.cli -q "..." --store S-012  one question
    python -m novamart.cli -q "..." --verbose      show tool calls
"""

from __future__ import annotations

import argparse
import json

from .agent import Agent, AgentResult

STATUS_LABEL = {
    "answered": "ANSWER",
    "declined": "NOT COVERED",
    "escalated": "ESCALATED",
    "needs_info": "NEED ONE DETAIL",
}


def render(result: AgentResult, verbose: bool = False) -> str:
    lines = [f"[{STATUS_LABEL.get(result.status, result.status.upper())}]", result.answer]
    if result.next_step:
        lines += ["", f"Next step: {result.next_step}"]
    if result.sources:
        refs = "; ".join(f"{s.get('doc_id')} > {s.get('heading')}" for s in result.sources)
        lines += ["", f"Sources: {refs}"]
    if result.ticket_id:
        lines += [f"Ticket: {result.ticket_id}"]
    if verbose:
        lines += ["", "-- trace --"]
        for t in result.trace:
            lines.append(f"{t['tool']}({json.dumps(t['input'], ensure_ascii=False)})")
            out = json.dumps(t["output"], ensure_ascii=False)
            lines.append("  -> " + (out[:300] + "..." if len(out) > 300 else out))
        lines.append(f"steps={result.steps} tokens_in={result.usage.get('input_tokens')} "
                     f"cached={result.usage.get('cache_read_input_tokens')} tokens_out={result.usage.get('output_tokens')}")
        if result.note:
            lines.append(f"note: {result.note}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="NovaMart internal support assistant")
    parser.add_argument("-q", "--question", help="Ask one question and exit")
    parser.add_argument("--store", help="Store id for context and gap logging, e.g. S-012")
    parser.add_argument("--verbose", action="store_true", help="Show tool calls and token usage")
    parser.add_argument("--no-log", action="store_true", help="Do not write to the knowledge gap log")
    args = parser.parse_args()

    agent = Agent(log_gaps=not args.no_log)

    if args.question:
        print(render(agent.run(args.question, store_id=args.store), verbose=args.verbose))
        return

    print("NovaMart assistant. Ask about policies, returns, orders. Type 'exit' to quit.\n")
    history: list[dict] = []
    while True:
        try:
            question = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not question:
            continue
        if question.lower() in {"exit", "quit"}:
            break
        result = agent.run(question, store_id=args.store, history=history)
        print("\n" + render(result, verbose=args.verbose) + "\n")
        # Keep a short text history so follow-up questions have context.
        history += [{"role": "user", "content": question}, {"role": "assistant", "content": result.answer}]
        history = history[-6:]


if __name__ == "__main__":
    main()
