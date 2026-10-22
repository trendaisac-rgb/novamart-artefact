# NovaMart Assist

An internal AI assistant for NovaMart store employees. It answers policy questions from the company documentation, looks up live order data through a tool, declines when the documentation does not cover the question, and turns every decline into a work item for the operations team.

Built on the Claude API (Anthropic) with plain Python, no agent framework. A web app on top shows each answer with its sources and the steps the agent took.

![NovaMart Assist](public/brand/og-image.png)

## What it does

- Answers questions about returns, exchanges, price match, damaged items, deliveries, gift cards and loyalty points, citing the exact policy section.
- Calls `get_order_status` (a mock of NovaMart's order API) for questions about a specific order.
- Declines with a clear reason when the documentation does not cover the question, instead of guessing. Escalates to Operations when a policy requires a human decision.
- Logs every decline to a knowledge gap file so Operations can see what to document next (see "The idea I would push").

## Quick start

Requires Python 3.11+ and Node 20+.

```bash
python -m venv .venv && source .venv/bin/activate
make setup                # Python agent + web app dependencies, creates agent/.env
# put your ANTHROPIC_API_KEY in agent/.env

make demo                 # agent API on :8000 and web app on http://localhost:8080
```

Everything also runs without the web app:

```bash
make chat                 # interactive CLI chat, store S-012
cd agent && python -m novamart.cli -q "Do we price match Amazon?" --verbose
make test                 # offline unit tests, no API key needed
make evals                # 24 eval cases + LLM judge, report in agent/evals/results/latest.md
make gaps                 # knowledge gap report for Operations
```

## How it works

```
employee question (web app or CLI)
      |
      v
+-------------------------------+     search_policies  ->  BM25 over policy sections
|  Claude (Sonnet) agent loop   | --> get_order_status ->  mock order API (agent/data/orders.json)
|  system prompt = rules +      | --> escalate_to_ops  ->  ticket file (mock helpdesk)
|  catalog of the documentation |
+-------------------------------+
      |
      v  respond(status, answer, next_step, sources)
   answered | declined | escalated | needs_info
      |
      v (declined / escalated)
   agent/data/knowledge_gaps.jsonl  ->  Ops console / gap_report.py  ->  what Operations should document
```

A question usually takes 2 to 4 steps: one or two searches, maybe an order lookup, then `respond`. The loop lives in `agent/src/novamart/agent.py`.

Repository layout:

```
agent/                      the product: Python agent, API, evals
  data/policies/            8 invented NovaMart policy documents (markdown, one section per "##")
  data/orders.json          mock order database for the order status tool
  src/novamart/
    knowledge.py            loads documents, splits sections, BM25 search, catalog
    tools.py                tool schemas + handlers (search, order status, escalation, respond)
    prompts.py              system prompt
    agent.py                the agent loop
    gaps.py                 knowledge gap log and report
    server.py               HTTP API for the web app (streams each agent step)
    cli.py                  chat interface
  evals/cases.yaml          24 test cases across policy, tool, decline and edge categories
  evals/run_evals.py        deterministic checks + LLM judge, writes markdown and JSON reports
  tests/                    offline unit tests (retrieval, tools, agent loop, API) with a fake client
src/                        web app (React, TanStack Start), a thin client over the API
public/brand/               NovaMart logo files
PRODUCTION_NOTE.md          how I would take this to production
```

## The web app

The web app holds no business logic. Every answer comes from the same `Agent` the CLI and the evals use, through `agent/src/novamart/server.py`.

- **Store floor.** The employee asks; the answer streams in as the agent works: "Searching policies for…", "Looking up order NM-1003…". Each answer is a card with the status, the answer, the next step, and the sources. Clicking a source opens the real policy document with the cited section highlighted. Order lookups render as an order tracker built from the tool output, so the employee sees the data, not only the summary.
- **Ops console.** The knowledge gap loop as a screen: every decline and escalation with the store and the searches tried, filters by reason, and a button that clusters the gaps into "documents to write".
- **Quality.** The latest eval run, read from `agent/evals/results/latest.json`. Empty until the suite has run against the real API.
- **Brand.** NovaMart is invented, so I gave it an identity: logo, palette, type, and the "spark" used as the loader. Assets in `public/brand/`.

If the API is not running, the app says so and shows the command to start it. It never shows invented answers.

## Key decisions

**1. Platform: Claude.** It is the ecosystem I ship with most, and the pieces this problem needs are native: tool use, prompt caching for the fixed prefix (rules, catalog, tool schemas), and a model tier for each job. Sonnet runs the agent, Haiku grades the evals and clusters the knowledge gaps. The provider boundary is one file (`agent.py`); moving to OpenAI or Gemini is a one-file change, and the production note explains when I would recommend that for NovaMart.

**2. No framework.** The loop is plain SDK calls. Every step is visible in the trace, testable with a fake client, and there is no abstraction layer to debug when something goes wrong in front of the client.

**3. Retrieval is a tool, not a pre-processing step.** The agent decides when to search and with which words, and can search twice if the first result misses. Questions that only need the order API do not drag policy text into the context. The trade-off is one more model turn per question; for an internal assistant that is cheap.

**4. BM25 over sections, no vector database.** Eight documents, around 40 sections. At this size embeddings add infrastructure and an API dependency without improving accuracy, and keyword scoring is explainable: I can show an employee why a section matched. Sections (not fixed-size chunks) keep each rule whole, so the model never sees half a policy. The swap point is documented in `knowledge.py`: keep the `search()` contract, back it with hybrid retrieval when the corpus grows.

**5. The catalog is in the system prompt.** The model sees the list of documents and sections on every call. Declining well is as much about knowing what exists as about what retrieval returns. "Employee discount" is not in the catalog, so the agent declines instead of stretching the loyalty policy.

**6. The final answer is a tool call.** `respond` has a `status` enum (answered, declined, escalated, needs_info) and structured `sources`. That makes "declined" a first-class state the evals can assert on, instead of a sentence we would detect with a regex. It also forces the model to finish every turn with an explicit outcome.

**7. Cite or decline.** An `answered` result must cite a section or come from the order tool (`AgentResult.grounded`). The eval judge then checks that every claim in the answer is supported by the sections the agent actually read.

**8. Degrade honestly.** A `respond` sent together with other tool calls (before seeing their results) is rejected and the model answers again. Free text without `respond` is treated as a decline, never passed on as an answer. If the loop hits the step limit, the employee gets a decline and a pointer to the helpdesk, never a half answer.

**9. The UI shows its work.** The store employee is about to repeat the answer to a customer, so the source and the steps are on screen, one click away. The same trace serves Operations when an answer is questioned. The argument against: a UI is more code than the brief asks for. That is why it is a thin client: it adds no logic the tests and evals do not already cover, and the CLI keeps working on its own.

## The idea I would push: the knowledge gap loop

The brief says the operations team is overwhelmed. An assistant that answers 80% of questions helps, but the other 20% keep landing on the same people, often the same question many times.

So every decline and escalation is logged with the question, the searches the agent tried and the store. The Ops console (or `agent/scripts/gap_report.py`) lists them; a small model clusters them into themes and proposes the document or section that would close each one. Operations writes the policy once, drops the markdown file in `agent/data/policies/`, and the assistant answers it from the next question on. No retraining, no code change.

The loop turns the assistant's weakest moment (not knowing) into the operations team's roadmap. It is the feature I would demo first to the ops lead, because it reduces their inbox, not just the employees' wait.

Two smaller choices for the store floor: the answer format is always "answer, next step, sources", because the employee is usually standing in front of a customer and needs the action, not the policy prose. And the agent answers in the language the employee used.

## Evaluation

`agent/evals/cases.yaml` holds 24 cases in four categories:

- **policy** (12): answers grounded in a section, including edge cases the documents were written to create: the holiday extension overriding the 15-day electronics window, a no-receipt return, Amazon vs. Amazon Marketplace, a refund that needs a manager, one question in Portuguese.
- **tool** (6): order lookups, what to tell a customer about a delayed order, a missing package, an order number that does not exist, and a question with no order number (the agent must ask, not guess).
- **decline** (4): plausible questions that are not in the documentation (employee discount, marketplace returns) and out-of-scope questions (vacation days, weather).
- **edge** (2): a request for an exception outside the window, and a warranty question the documents only partly cover.

Two layers of checking. Deterministic: final status, cited document, tools called or not called, required and forbidden strings, and the grounding rule. Then an LLM judge (Haiku, temperature 0) grades every `answered` case for faithfulness against the exact sections and tool outputs the agent saw. The run writes `agent/evals/results/latest.md` (and `latest.json` for the Quality page) with per-category numbers and every answer, and exits non-zero below a pass-rate threshold, which is how I would wire it into CI as a release gate.

Run `make evals` to produce the report. Results are in `agent/evals/results/`.

The cases are a regression set, not a benchmark: when a failure is found and fixed, it gets a case so it cannot come back silently.

## Assumptions

- NovaMart's documentation can be kept as markdown with one heading per rule. The invented documents are short and deliberately overlap (returns vs. exchanges, final sale vs. defective) to exercise the agent.
- The order API returns a status vocabulary that matches the delivery policy, so the agent can map a status to what to tell the customer.
- Store employees identify themselves by store id (the store picker in the app, `--store` in the CLI); authentication is out of scope for the prototype.
- "Decline gracefully" means: say what is not covered, point to the helpdesk, log the gap. It does not mean refusing to help; a `needs_info` state covers the case where one detail is missing.

## What I would do with more time

1. Run the eval suite against a baseline before every prompt or retrieval change, and keep the diff in the report. Prompt changes that "feel" better often score flat.
2. Multi-turn evals. The app and the CLI keep a short history, but the cases are single-turn.
3. Hybrid retrieval behind the same `search()` contract, with a metadata filter by region or store format, which is where policy variants usually differ.
4. A real ticket integration (Jira or the helpdesk tool NovaMart already uses) and a weekly gap digest sent to the ops lead automatically.
5. A thumbs up/down on each answer card, feeding the eval set.
