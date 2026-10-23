"""Runs the evaluation suite against the deployed agent and writes a report.

    python evals/run_evals.py                 all cases, with LLM judge
    python evals/run_evals.py --no-judge      deterministic checks only
    python evals/run_evals.py --filter tool   only cases whose id contains "tool"
    python evals/run_evals.py --threshold 0.9 exit code 1 below this pass rate (release gate)

It calls the live Edge Function, the same endpoint the web app uses, so the
suite tests what is actually deployed. Settings come from evals/.env:

    NOVA_API_URL=https://<project>.supabase.co/functions/v1/nova
    NOVA_API_KEY=<the project's publishable key>
    OPENAI_API_KEY=<for the judge>

Two layers of checking:
1. Deterministic: final status, cited sources, tools called or not called, required and
   forbidden strings, and the grounding rule.
2. LLM judge (small model): for answered cases, is every claim supported by the sections
   and tool results the agent actually saw?
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
import yaml

HERE = Path(__file__).parent
ROOT = HERE.parent
CASES_FILE = HERE / "cases.yaml"
RESULTS_DIR = HERE / "results"
UI_RESULTS = ROOT / "public" / "evals" / "latest.json"  # read by the Quality page


def load_env() -> None:
    env_file = HERE / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def ask(client: httpx.Client, question: str, history: list | None = None) -> dict:
    """POST /ask and read the event stream until the final result.

    log_gaps=False marks an eval run: nothing is logged as a gap and no ticket is written.
    """
    body = {"question": question, "log_gaps": False, "history": history or []}
    for attempt in range(4):
        with client.stream("POST", "/ask", json=body) as r:
            if r.status_code == 429:  # the demo link is rate limited; wait and retry
                time.sleep(20)
                continue
            r.raise_for_status()
            for line in r.iter_lines():
                if not line.startswith("data: "):
                    continue
                event = json.loads(line[6:])
                if event["type"] == "result":
                    return event["result"]
                if event["type"] == "error":
                    raise RuntimeError(event["message"])
        raise RuntimeError("stream ended without a result")
    raise RuntimeError("rate limited")


def _contains(text: str, item) -> bool:
    text = text.lower()
    if isinstance(item, list):
        return any(alt.lower() in text for alt in item)
    return str(item).lower() in text


def check_case(expect: dict, result: dict) -> list[str]:
    """Return a list of failed check descriptions. Empty list = pass."""
    failures = []
    status = result["status"]

    allowed = expect.get("status")
    if allowed is not None:
        allowed = allowed if isinstance(allowed, list) else [allowed]
        if status not in allowed:
            failures.append(f"status={status}, expected {allowed}")

    cited = {s.get("doc_id") for s in result["sources"]}
    if expect.get("sources_any") and not cited & set(expect["sources_any"]):
        failures.append(f"sources={sorted(cited) or 'none'}, expected one of {expect['sources_any']}")
    if expect.get("no_sources") and result["sources"]:
        failures.append("cited sources but should not")
    if expect.get("sources_only") and not cited <= set(expect["sources_only"]):
        failures.append(f"sources={sorted(cited)}, only allowed {expect['sources_only']}")

    tools_used = [t["tool"] for t in result["trace"]]
    if expect.get("tool_called") and expect["tool_called"] not in tools_used:
        failures.append(f"tool {expect['tool_called']} not called (used {tools_used})")
    if expect.get("tool_not_called") and expect["tool_not_called"] in tools_used:
        failures.append(f"tool {expect['tool_not_called']} was called but should not")

    full_text = f"{result['answer']} {result['next_step']}"
    for item in expect.get("must_include", []):
        if not _contains(full_text, item):
            failures.append(f"missing {item!r}")
    for item in expect.get("must_not_include", []):
        if _contains(full_text, item):
            failures.append(f"contains forbidden {item!r}")

    if status == "answered" and not result["grounded"]:
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


def judge(question: str, result: dict) -> dict:
    parts = []
    for t in result["trace"]:
        if t["tool"] == "search_policies":
            for r in t["output"].get("results", []):
                parts.append(f"[{r['doc_id']} > {r['heading']}]\n{r['text']}")
        elif t["tool"] == "get_order_status":
            parts.append("[order lookup]\n" + json.dumps(t["output"], ensure_ascii=False))
    prompt = JUDGE_PROMPT.format(question=question, context="\n\n".join(parts) or "(no context retrieved)",
                                 answer=result["answer"], next_step=result["next_step"])
    r = httpx.post("https://api.openai.com/v1/responses", timeout=60,
                   headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
                   json={"model": os.environ.get("NOVA_JUDGE_MODEL", "gpt-6-luna"), "input": prompt})
    r.raise_for_status()
    text = "".join(c.get("text", "") for o in r.json().get("output", []) if o.get("type") == "message"
                   for c in o.get("content", []) if c.get("type") == "output_text")
    try:
        return json.loads(text[text.index("{"): text.rindex("}") + 1])
    except ValueError:
        return {"faithful": None, "addresses": None, "note": f"unparseable judge output: {text[:80]}"}


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-judge", action="store_true")
    parser.add_argument("--filter", default="", help="Only run cases whose id contains this text")
    parser.add_argument("--threshold", type=float, default=0.85, help="Minimum pass rate for exit code 0")
    args = parser.parse_args()

    cases = yaml.safe_load(CASES_FILE.read_text(encoding="utf-8"))
    if args.filter:
        cases = [c for c in cases if args.filter in c["id"]]

    key = os.environ["NOVA_API_KEY"]
    client = httpx.Client(base_url=os.environ["NOVA_API_URL"].rstrip("/"), timeout=120,
                          headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows, started = [], time.time()
    for case in cases:
        t0 = time.time()
        try:
            result = ask(client, case["question"], case.get("history"))
            failures = check_case(case.get("expect", {}), result)
        except Exception as exc:  # a crash is a failed case, not a crashed suite
            result = {"status": "declined", "answer": "", "next_step": "", "sources": [], "trace": [],
                      "steps": 0, "usage": {}}
            failures = [f"error: {exc}"]
        verdict = None
        if not args.no_judge and result["status"] == "answered" and not any(f.startswith("error") for f in failures):
            verdict = judge(case["question"], result)
            if verdict.get("faithful") is False:
                failures.append(f"judge: unfaithful ({verdict.get('note')})")
        rows.append({
            "id": case["id"], "category": case.get("category", "-"), "question": case["question"],
            "status": result["status"], "failures": failures, "judge": verdict,
            "answer": result["answer"], "sources": result["sources"], "tools": [t["tool"] for t in result["trace"]],
            "steps": result["steps"], "seconds": round(time.time() - t0, 1), "usage": result["usage"],
        })
        print(f"{'PASS' if not failures else 'FAIL'}  {case['id']:<36} {result['status']:<10} {'; '.join(failures)}")

    total = len(rows)
    passed = sum(1 for r in rows if not r["failures"])
    rate = passed / total if total else 0.0
    seconds = time.time() - started

    RESULTS_DIR.mkdir(exist_ok=True)
    report = render_report(rows, passed, total, rate, seconds)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    (RESULTS_DIR / f"{stamp}.md").write_text(report, encoding="utf-8")
    (RESULTS_DIR / "latest.md").write_text(report, encoding="utf-8")
    UI_RESULTS.parent.mkdir(parents=True, exist_ok=True)
    UI_RESULTS.write_text(json.dumps({
        "generated_at": datetime.now().isoformat(timespec="seconds"), "passed": passed, "total": total,
        "rate": round(rate, 4), "seconds": round(seconds, 1), "threshold": args.threshold,
        "judge": not args.no_judge, "cases": rows,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{passed}/{total} passed ({rate:.0%}). Report: evals/results/{stamp}.md")

    if rate < args.threshold:
        print(f"Below threshold {args.threshold:.0%}: failing the run.")
        sys.exit(1)


def render_report(rows: list[dict], passed: int, total: int, rate: float, seconds: float) -> str:
    by_cat: dict[str, list[dict]] = {}
    for r in rows:
        by_cat.setdefault(r["category"], []).append(r)
    lines = [f"# Eval report, {datetime.now().strftime('%Y-%m-%d %H:%M')}", "",
             f"**{passed}/{total} passed ({rate:.0%})** in {seconds:.0f}s"
             + ("" if any(r["judge"] for r in rows) else " (deterministic checks only, LLM judge off)"),
             "", "## By category", "",
             "| category | passed | total |", "|---|---|---|"]
    for cat, items in by_cat.items():
        lines.append(f"| {cat} | {sum(1 for r in items if not r['failures'])} | {len(items)} |")
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
        lines.append(f"Steps: {r['steps']}" + (f", {r['seconds']}s" if r.get("seconds") is not None else ""))
        lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
