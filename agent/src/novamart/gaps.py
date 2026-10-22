"""Knowledge gap log.

Every time the assistant declines or escalates, the question is recorded here.
This is the feature that closes the loop for the operations team: instead of
answering the same unanswered question 50 times, they see the list once, write the
missing policy, and the assistant answers it from then on.

`report()` prints the raw list. `summarize()` asks a small model to cluster the gaps
into themes and propose the documents to write.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .config import GAPS_FILE, SMALL_MODEL

if TYPE_CHECKING:
    from .agent import AgentResult


def log_gap(question: str, store_id: str | None, result: "AgentResult", path: Path = GAPS_FILE) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "store_id": store_id,
        "question": question,
        "status": result.status,
        "decline_reason": result.decline_reason,
        "searches": result.searches,
        "answer": result.answer,
        "ticket_id": result.ticket_id,
    }
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load_gaps(path: Path = GAPS_FILE) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def report(entries: list[dict]) -> str:
    if not entries:
        return "No knowledge gaps logged yet."
    by_reason = Counter(e.get("decline_reason") or "unspecified" for e in entries)
    lines = [f"Knowledge gaps: {len(entries)} entries", ""]
    for reason, n in by_reason.most_common():
        lines.append(f"- {reason}: {n}")
    lines.append("")
    for e in entries:
        lines.append(f"[{e['ts'][:10]}] ({e.get('decline_reason') or '-'}) {e['question']}")
    return "\n".join(lines)


def summarize(entries: list[dict], client: Any, model: str = SMALL_MODEL) -> str:
    """Cluster the gaps into themes and propose what to document. Cheap model, one call."""
    if not entries:
        return "No knowledge gaps logged yet."
    questions = "\n".join(f"- {e['question']}" for e in entries)
    prompt = (
        "These are questions NovaMart's internal assistant could not answer from the current "
        "policy documentation. Group them into themes. For each theme give: a name, how many "
        "questions, and the title of the policy document (or the section to add) that would "
        "answer them. Keep it short, markdown, most frequent theme first.\n\n" + questions
    )
    response = client.messages.create(
        model=model,
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(getattr(b, "text", "") for b in response.content).strip()
