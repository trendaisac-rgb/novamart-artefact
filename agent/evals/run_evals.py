"""Run the evaluation suite against the live agent and write a markdown report.

    python evals/run_evals.py                 all cases, with LLM judge
    python evals/run_evals.py --no-judge      deterministic checks only
    python evals/run_evals.py --filter tool   only cases whose id contains "tool"
    python evals/run_evals.py --threshold 0.9 exit code 1 below this pass rate (release gate)

Two layers of checking:
1. Deterministic: final status, cited sources, tools called or not called, required and
   forbidden strings. These catch the failures that matter most (invented facts,
   answering without grounding, skipping the order lookup).
2. LLM judge (small model): for answered cases, is every claim supported by the sections
   and tool results the agent actually saw? Catches subtle hallucinations the keyword
   checks miss.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from novamart.agent import Agent, AgentResult  # noqa: E402
from novamart.config import SMALL_MODEL  # noqa: E402

CASES_FILE = Path(__file__).parent / "cases.yaml"
RESULTS_DIR = Path(__file__).parent / "results"


def _contains(answer: str, item) -> bool:
    text = answer.lower()
    if isinstance(item, list):
        return any(alt.lower() in text for alt in item)
    return str(item).lower() in text


def check_case(expect: dict, result: AgentResult) -> list[str]:
    """Return a list of failed check descriptions. Empty list = pass."""
    failures = []

    allowed = expect.get("status")
    if allowed is not None:
        allowed = allowed if isinstance(allowed, list) else [allowed]
        if result.status not in allowed:
            failures.append(f"status={result.status}, expected {allowed}")

    if expect.get("sources_any"):
        cited = {s.get("doc_id") for s in result.sources}
        if not cited & set(expect["sources_any"]):
            failures.append(f"sources={sorted(cited) or 'none'}, expected one of {expect['sources_any']}")

    if expect.get("no_sources") and result.sources:
        failures.append("cited sources but should not")

    tools_used = [t["tool"] for t in result.trace]
    if expect.get("tool_called") and expect["tool_called"] not in tools_used:
        failures.append(f"tool {expect['tool_called']} not called (used {tools_used})")
    if expect.get("tool_not_called") and expect["tool_not_called"] in tools_used:
        failures.append(f"tool {expect['tool_not_called']} was called but should not")

    full_text = f"{result.answer} {result.next_step}"
    for item in expect.get("must_include", []):
        if not _contains(full_text, item):
            failures.append(f"missing {item!r}")
    for item in expect.get("must_not_include", []):
        if _contains(full_text, item):
            failures.append(f"contains forbidden {item!r}")

    if result.status == "answered" and not result.grounded:
        failures.append("answered without sources or data tool")

    return failures


JUDGE_PROMPT = """You are grading an internal support assistant for strict faithfulness.

Question from a store employee:
{question}

Context the assistant had (retrieved policy sections and tool results):
{context}

Assistant's answer:
{answer}
Next step: {next_step}

Grade:
1. faithful: true only if every factual claim (numbers, deadlines, conditions, statuses) is supported by the context above. Reasonable phrasing is fine; new facts are not.
2. addresses: true if the answer actually resolves what was asked.

Reply with JSON only: {{"faithful": true/false, "addresses": true/false, "note": "one short sentence"}}"""


def judge(client, question: str, result: AgentResult, model: str = SMALL_MODEL) -> dict:
    context_parts = []
    for t in result.trace:
        if t["tool"] == "search_policies":
            for r in t["output"].get("results", []):
                context_parts.append(f"[{r['doc_id']} > {r['heading']}]\n{r['text']}")
        elif t["tool"] == "get_order_status":
            context_parts.append("[order lookup]\n" + json.dumps(t["output"], ensure_ascii=False))
    context = "\n\n".join(context_parts) or "(no context retrieved)"
    prompt = JUDGE_PROMPT.format(question=question, context=context, answer=result.answer, next_step=result.next_step)
    response = client.messages.create(model=model, max_tokens=300, temperature=0,
                                      messages=[{"role": "user", "content": prompt}])
    text = "".join(getattr(b, "text", "") for b in response.content).strip()
    try:
        start, end = text.index("{"), text.rindex("}") + 1
        return json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError):
        return {"faithful": None, "addresses": None, "note": f"unparseable judge output: {text[:80]}"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-judge", action="store_true")
    parser.add_argument("--filter", default="", help="Only run cases whose id contains this text")
    parser.add_argument("--threshold", type=float, default=0.85, help="Minimum pass rate for exit code 0")
    args = parser.parse_args()

    cases = yaml.safe_load(CASES_FILE.read_text(encoding="utf-8"))
    if args.filter:
        cases = [c for c in cases if args.filter in c["id"]]

    agent = Agent(log_gaps=False)
    rows = []
    started = time.time()
    for case in cases:
        t0 = time.time()
        result = agent.run(case["question"])
        failures = check_case(case.get("expect", {}), result)
        verdict = None
        if not args.no_judge and result.status == "answered":
            verdict = judge(agent.client, case["question"], result)
            if verdict.get("faithful") is False:
                failures.append(f"judge: unfaithful ({verdict.get('note')})")
        rows.append({
            "id": case["id"], "category": case.get("category", "-"), "question": case["question"],
            "status": result.status, "failures": failures, "judge": verdict,
            "answer": result.answer, "sources": result.sources, "tools": [t["tool"] for t in result.trace],
            "steps": result.steps, "seconds": round(time.time() - t0, 1), "usage": result.usage,
        })
        mark = "PASS" if not failures else "FAIL"
        print(f"{mark}  {case['id']:<36} {result.status:<10} {'; '.join(failures)}")

    total = len(rows)
    passed = sum(1 for r in rows if not r["failures"])
    rate = passed / total if total else 0.0
    report = render_report(rows, passed, total, rate, time.time() - started)

    RESULTS_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    (RESULTS_DIR / f"{stamp}.md").write_text(report, encoding="utf-8")
    (RESULTS_DIR / "latest.md").write_text(report, encoding="utf-8")
    # Same run as JSON, for the Quality page in the UI.
    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "passed": passed, "total": total, "rate": round(rate, 4),
        "seconds": round(time.time() - started, 1), "threshold": args.threshold,
        "judge": not args.no_judge, "cases": rows,
    }
    (RESULTS_DIR / "latest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{passed}/{total} passed ({rate:.0%}). Report: evals/results/{stamp}.md")

    if rate < args.threshold:
        print(f"Below threshold {args.threshold:.0%}: failing the run.")
        sys.exit(1)


def render_report(rows: list[dict], passed: int, total: int, rate: float, seconds: float) -> str:
    by_cat: dict[str, list[dict]] = {}
    for r in rows:
        by_cat.setdefault(r["category"], []).append(r)

    lines = [f"# Eval report, {datetime.now().strftime('%Y-%m-%d %H:%M')}", "",
             f"**{passed}/{total} passed ({rate:.0%})** in {seconds:.0f}s", "", "## By category", "",
             "| category | passed | total |", "|---|---|---|"]
    for cat, items in by_cat.items():
        ok = sum(1 for r in items if not r["failures"])
        lines.append(f"| {cat} | {ok} | {len(items)} |")

    lines += ["", "## Cases", "", "| id | status | tools | result | judge |", "|---|---|---|---|---|"]
    for r in rows:
        res = "pass" if not r["failures"] else "FAIL: " + "; ".join(r["failures"])
        j = r["judge"]
        jtxt = "-" if not j else f"faithful={j.get('faithful')} addresses={j.get('addresses')}"
        lines.append(f"| {r['id']} | {r['status']} | {', '.join(r['tools']) or '-'} | {res} | {jtxt} |")

    lines += ["", "## Answers", ""]
    for r in rows:
        lines += [f"### {r['id']}", f"**Q:** {r['question']}", "", f"**A ({r['status']}):** {r['answer']}", ""]
        if r["sources"]:
            lines.append("Sources: " + "; ".join(f"{s.get('doc_id')} > {s.get('heading')}" for s in r["sources"]))
        if r["judge"]:
            lines.append(f"Judge: {r['judge'].get('note')}")
        lines.append(f"Steps: {r['steps']}, {r['seconds']}s, tokens in/out: {r['usage'].get('input_tokens')}/{r['usage'].get('output_tokens')}")
        lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
