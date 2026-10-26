/**
 * Tests the agent loop and retrieval without calling any API or database.
 * A scripted fake model returns pre-defined tool calls in order; a fake store
 * keeps tickets and gaps in memory. Run: deno test supabase/functions/nova
 */

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

import { runAgent, type AgentEvent, type ModelClient, type OutputItem } from "./agent.ts";
import { KnowledgeBase, type Doc } from "./knowledge.ts";
import type { Gap, Store, Ticket } from "./tools.ts";

// --- fixtures -------------------------------------------------------------

async function loadPolicies(): Promise<Doc[]> {
  const dir = new URL("../../policies/", import.meta.url);
  const docs: Doc[] = [];
  for await (const f of Deno.readDir(dir)) {
    if (!f.name.endsWith(".md")) continue;
    const docId = f.name.replace(/\.md$/, "");
    let title = docId;
    const summary: string[] = [];
    const sections: Doc["sections"] = [];
    let heading: string | null = null;
    let buf: string[] = [];
    const flush = () => {
      if (heading && buf.join("\n").trim())
        sections.push({ doc_id: docId, title, heading, body: buf.join("\n").trim() });
    };
    for (const line of (await Deno.readTextFile(new URL(f.name, dir))).split("\n")) {
      if (line.startsWith("# ")) title = line.slice(2).trim();
      else if (line.startsWith("## ")) {
        flush();
        heading = line.slice(3).trim();
        buf = [];
      } else if (heading === null) {
        if (line.trim()) summary.push(line.trim());
      } else buf.push(line);
    }
    flush();
    docs.push({ doc_id: docId, title, summary: summary.join(" "), sections });
  }
  return docs.sort((a, b) => a.doc_id.localeCompare(b.doc_id));
}

const kb = new KnowledgeBase(await loadPolicies());

class FakeStore implements Store {
  tickets: Ticket[] = [];
  gaps: Gap[] = [];
  getOrder(id: string) {
    return Promise.resolve(
      id === "NM-1002" ? { order_id: "NM-1002", status: "In transit", carrier: "UPS" } : null,
    );
  }
  createTicket(t: Ticket) {
    this.tickets.push(t);
    return Promise.resolve();
  }
  logGap(g: Gap) {
    this.gaps.push(g);
    return Promise.resolve();
  }
}

const call = (name: string, args: Record<string, unknown>, id = `c_${name}`): OutputItem => ({
  type: "function_call",
  name,
  call_id: id,
  arguments: JSON.stringify(args),
});

const respond = (status: string, answer: string, extra: Record<string, unknown> = {}) =>
  call("respond", { status, answer, next_step: "", sources: [], decline_reason: null, ...extra });

/** Each item in `script` is the output list for one model call. */
class FakeModel implements ModelClient {
  calls: { input: unknown[] }[] = [];
  constructor(private script: OutputItem[][]) {}
  respond(req: { instructions: string; input: unknown[]; tools: unknown[] }) {
    this.calls.push({ input: structuredClone(req.input) });
    const output = this.script.shift() ?? [call("search_policies", { query: "loop" })];
    return Promise.resolve({
      output,
      usage: { input_tokens: 10, output_tokens: 5, cached_tokens: 0 },
    });
  }
}

const run = (script: OutputItem[][], extra: Partial<Parameters<typeof runAgent>[0]> = {}) => {
  const model = new FakeModel(script);
  const store = new FakeStore();
  return { model, store, result: runAgent({ question: "q", model, kb, store, ...extra }) };
};

// --- retrieval ------------------------------------------------------------

Deno.test("catalog lists every document", () => {
  assertEquals(kb.docs.length, 8);
  assert(kb.catalog().includes("price_match: Price Match Policy."));
});

Deno.test("search finds the right section", () => {
  assertEquals(kb.search("Do we price match Amazon?")[0]?.heading, "Who we match");
  assertEquals(kb.search("laptop return window")[0]?.heading, "Standard return window");
  const holiday = kb.search(
    "A customer bought a TV on December 20 and wants to return it on January 10",
  );
  assert(
    holiday.slice(0, 2).some((h) => h.heading === "Holiday extension"),
    JSON.stringify(holiday.map((h) => h.heading)),
  );
});

Deno.test("an exchange question reaches the final sale list", () => {
  // The exchanges policy used to point at another document instead of listing the items,
  // so "can I exchange underwear" never reached the rule that says no.
  const hits = kb.search("Can a customer exchange underwear for a different size?");
  assert(
    hits.some(
      (h) => h.heading === "Items that cannot be exchanged" && h.text.includes("Underwear"),
    ),
    JSON.stringify(hits.map((h) => h.heading)),
  );
});

Deno.test("search matches plurals and returns nothing for noise", () => {
  assertEquals(kb.search("gift cards")[0]?.doc_id, "gift_cards_and_store_credit");
  assertEquals(kb.search("zzzz qqqq").length, 0);
});

// --- agent loop -----------------------------------------------------------

Deno.test("search, then respond with a cited section", async () => {
  const { model, result } = run([
    [call("search_policies", { query: "laptop return window" })],
    [
      respond("answered", "15 days.", {
        sources: [{ doc_id: "returns_and_refunds", heading: "Standard return window" }],
      }),
    ],
  ]);
  const r = await result;
  assertEquals(r.status, "answered");
  assert(r.grounded);
  assertEquals(r.steps, 2);
  assertEquals(
    r.trace.map((t) => t.tool),
    ["search_policies"],
  );
  // The second model call carries the tool output back.
  const last = model.calls[1]!.input.at(-1) as { type: string; call_id: string };
  assertEquals(last.type, "function_call_output");
  assertEquals(last.call_id, "c_search_policies");
});

Deno.test("order lookup counts as grounding", async () => {
  const r = await run([
    [call("get_order_status", { order_id: "nm-1002" })],
    [respond("answered", "In transit with UPS.")],
  ]).result;
  assertEquals(r.status, "answered");
  assert(r.grounded);
  assertEquals(r.trace[0]!.output["status"], "In transit"); // order id normalized to upper case
});

Deno.test("an answer with nothing behind it is rejected once, then declined", async () => {
  const { model, result } = run([
    [respond("answered", "Probably 30 days.")],
    [respond("answered", "Still 30 days.")],
  ]);
  const r = await result;
  assertEquals(r.status, "declined");
  assertEquals(r.note, "answer cited no section it had read");
  const feedback = model.calls[1]!.input.at(-1) as { output: string };
  assert(feedback.output.startsWith("Rejected"));
});

Deno.test("citing a section it never retrieved is rejected; fixing it passes", async () => {
  const { model, result } = run([
    [call("search_policies", { query: "laptop return window" })],
    [
      respond("answered", "15 days.", {
        sources: [{ doc_id: "price_match", heading: "Exclusions" }], // in the catalog, not retrieved
      }),
    ],
    [
      respond("answered", "15 days.", {
        sources: [{ doc_id: "returns_and_refunds", heading: "standard return window " }],
      }),
    ],
  ]);
  const r = await result;
  assertEquals(r.status, "answered");
  assertEquals(model.calls.length, 3);
  assertEquals(r.sources.length, 1); // matched despite case and spacing
});

Deno.test("unread sources are dropped from a decline", async () => {
  const r = await run([
    [call("search_policies", { query: "employee discount" })],
    [
      respond("declined", "Not covered.", {
        decline_reason: "not_in_docs",
        sources: [{ doc_id: "loyalty_program", heading: "Using points" }],
      }),
    ],
    [
      respond("declined", "Not covered.", {
        decline_reason: "not_in_docs",
        sources: [{ doc_id: "loyalty_program", heading: "Using points" }],
      }),
    ],
  ]).result;
  assertEquals(r.status, "declined");
  assertEquals(r.sources.length, 0);
  assert(r.note?.includes("dropped 1 source"));
});

Deno.test("respond sent with other tools is rejected and the loop continues", async () => {
  const { model, result } = run([
    [
      call("search_policies", { query: "x" }, "a"),
      call(
        "respond",
        { status: "answered", answer: "early", next_step: "", sources: [], decline_reason: null },
        "b",
      ),
    ],
    [respond("declined", "Not covered.", { decline_reason: "not_in_docs" })],
  ]);
  const r = await result;
  assertEquals(r.status, "declined");
  // Both calls got an output, otherwise the API rejects the next request.
  const outputs = (
    model.calls[1]!.input as { type?: string; call_id?: string; output?: string }[]
  ).filter((i) => i.type === "function_call_output");
  assertEquals(outputs.map((o) => o.call_id).sort(), ["a", "b"]);
  assert(outputs.some((o) => o.output?.startsWith("Ignored")));
});

Deno.test("declines are logged as knowledge gaps", async () => {
  const { store, result } = run(
    [
      [call("search_policies", { query: "employee discount" })],
      [respond("declined", "Not in the docs.", { decline_reason: "not_in_docs" })],
    ],
    { question: "what is the employee discount?", storeId: "S-001" },
  );
  await result;
  assertEquals(store.gaps.length, 1);
  assertEquals(store.gaps[0]!.store_id, "S-001");
  assertEquals(store.gaps[0]!.searches, ["employee discount"]);
});

Deno.test("evals can switch gap logging off", async () => {
  const { store, result } = run(
    [[respond("declined", "No.", { decline_reason: "out_of_scope" })]],
    { logGaps: false },
  );
  await result;
  assertEquals(store.gaps.length, 0);
});

Deno.test("escalation opens a ticket and returns its id", async () => {
  const { store, result } = run(
    [
      [
        call("escalate_to_ops", {
          summary: "650 dollar cash refund",
          priority: "blocking",
          order_id: null,
        }),
      ],
      [respond("escalated", "Needs a manager.", { decline_reason: "needs_human" })],
    ],
    { storeId: "S-012" },
  );
  const r = await result;
  assertEquals(r.status, "escalated");
  assertEquals(store.tickets.length, 1);
  assertEquals(r.ticket_id, store.tickets[0]!.ticket_id);
  assertEquals(store.gaps[0]!.ticket_id, r.ticket_id);
});

Deno.test("eval runs escalate without writing a ticket", async () => {
  const { store, result } = run(
    [
      [call("escalate_to_ops", { summary: "exception", priority: "normal", order_id: null })],
      [respond("escalated", "Sent to Operations.", { decline_reason: "needs_human" })],
    ],
    { logGaps: false },
  );
  const r = await result;
  assertEquals(r.status, "escalated");
  assertEquals(store.tickets.length, 0);
  assert(r.ticket_id?.startsWith("OPS-"));
});

Deno.test("free text without respond is declined, never passed on", async () => {
  const r = await run([
    [{ type: "message", content: [{ type: "output_text", text: "Probably 30 days." }] }],
  ]).result;
  assertEquals(r.status, "declined");
  assert(!r.answer.includes("Probably"));
  assertEquals(r.note, "model returned text without calling respond");
});

Deno.test("step limit gives a safe decline", async () => {
  const { model, result } = run([], { maxSteps: 3 });
  const r = await result;
  assertEquals(r.status, "declined");
  assertEquals(r.note, "max steps reached");
  assertEquals(model.calls.length, 3);
});

Deno.test("invalid status is downgraded to declined", async () => {
  const r = await run([[respond("maybe", "?")]]).result;
  assertEquals(r.status, "declined");
  assert(r.note?.includes("invalid status"));
});

Deno.test("events follow the loop", async () => {
  const events: AgentEvent[] = [];
  await run(
    [[call("get_order_status", { order_id: "NM-1002" })], [respond("answered", "In transit.")]],
    {
      emit: (e) => events.push(e),
    },
  ).result;
  assertEquals(
    events.map((e) => e.type),
    ["step", "tool_call", "tool_result", "step", "result"],
  );
});
