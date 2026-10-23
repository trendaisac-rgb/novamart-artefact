/**
 * The agent loop.
 *
 * One question in, one structured result out. The model decides which tools
 * to call (search, order lookup, escalation) and must end by calling
 * `respond`. Plain code on top of the model API, no framework, so every step
 * is visible in the trace and testable with a fake model.
 */

import { buildInstructions } from "./prompt.ts";
import { runTool, TOOLS, type Store } from "./tools.ts";
import type { KnowledgeBase } from "./knowledge.ts";

export type Status = "answered" | "declined" | "escalated" | "needs_info";
const VALID_STATUS = new Set<Status>(["answered", "declined", "escalated", "needs_info"]);

/** What the model returns, in the shape of the OpenAI Responses API output. */
export interface OutputItem {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  [key: string]: unknown;
}

export interface ModelClient {
  respond(req: { instructions: string; input: unknown[]; tools: unknown[] }): Promise<{
    output: OutputItem[];
    usage: { input_tokens: number; output_tokens: number; cached_tokens: number };
  }>;
}

export interface TraceStep {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface AgentResult {
  status: Status;
  answer: string;
  next_step: string;
  sources: { doc_id: string; heading: string }[];
  decline_reason: string | null;
  ticket_id: string | null;
  trace: TraceStep[];
  steps: number;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
  note: string | null;
  grounded: boolean;
}

export type AgentEvent =
  | { type: "step"; step: number }
  | { type: "tool_call"; tool: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      tool: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }
  | { type: "result"; result: AgentResult };

export interface RunOptions {
  question: string;
  storeId?: string | null;
  history?: { role: "user" | "assistant"; content: string }[];
  model: ModelClient;
  kb: KnowledgeBase;
  store: Store;
  logGaps?: boolean;
  maxSteps?: number;
  emit?: (e: AgentEvent) => void;
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(raw ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** An answer counts as grounded if it cites a section or used live order data. */
function isGrounded(status: Status, sources: unknown[], trace: TraceStep[]) {
  return (
    status !== "answered" || sources.length > 0 || trace.some((t) => t.tool === "get_order_status")
  );
}

export async function runAgent(opts: RunOptions): Promise<AgentResult> {
  const emit = opts.emit ?? (() => {});
  const maxSteps = opts.maxSteps ?? 8;
  const storeId = opts.storeId ?? null;
  const instructions = buildInstructions(opts.kb.catalog());
  const userText = storeId ? `[Store ${storeId}] ${opts.question}` : opts.question;
  const input: unknown[] = [...(opts.history ?? []), { role: "user", content: userText }];
  const trace: TraceStep[] = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  let ticketId: string | null = null;

  const finish = async (
    partial: Omit<AgentResult, "trace" | "usage" | "grounded" | "ticket_id">,
  ) => {
    const result: AgentResult = {
      ...partial,
      ticket_id: ticketId,
      trace,
      usage,
      grounded: isGrounded(partial.status, partial.sources, trace),
    };
    // Declines and escalations become work items for Operations.
    if ((opts.logGaps ?? true) && (result.status === "declined" || result.status === "escalated")) {
      await opts.store.logGap({
        store_id: storeId,
        question: opts.question,
        status: result.status,
        decline_reason: result.decline_reason,
        searches: trace
          .filter((t) => t.tool === "search_policies")
          .map((t) => String(t.input["query"] ?? "")),
        answer: result.answer,
        ticket_id: ticketId,
      });
    }
    emit({ type: "result", result });
    return result;
  };

  const safeDecline = (steps: number, note: string) =>
    finish({
      status: "declined",
      answer: "I could not produce a grounded answer. Please contact the Operations helpdesk.",
      next_step: "Open a ticket with the Operations helpdesk with the customer's request.",
      sources: [],
      decline_reason: "not_in_docs",
      steps,
      note,
    });

  for (let step = 1; step <= maxSteps; step++) {
    emit({ type: "step", step });
    const res = await opts.model.respond({ instructions, input, tools: TOOLS });
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    usage.cache_read_input_tokens += res.usage.cached_tokens;

    const calls = res.output.filter((i) => i.type === "function_call");
    if (calls.length === 0) {
      // Free text has no status and no sources: never pass it on as an answer.
      return safeDecline(step, "model returned text without calling respond");
    }

    // Reasoning items and calls go back to the model with the tool outputs.
    input.push(...res.output);
    const respondCall = calls.find((c) => c.name === "respond");
    const others = calls.filter((c) => c.name !== "respond");

    if (respondCall && others.length === 0) {
      const data = parseArgs(respondCall.arguments);
      let status = String(data["status"] ?? "") as Status;
      let note: string | null = null;
      if (!VALID_STATUS.has(status)) {
        note = `invalid status '${status}', treated as declined`;
        status = "declined";
      }
      const sources = Array.isArray(data["sources"])
        ? (data["sources"] as { doc_id: string; heading: string }[]).filter(
            (s) => s && typeof s === "object",
          )
        : [];
      return finish({
        status,
        answer: String(data["answer"] ?? "").trim(),
        next_step: String(data["next_step"] ?? "").trim(),
        sources,
        decline_reason: (data["decline_reason"] as string | null) ?? null,
        steps: step,
        note,
      });
    }

    // Run the real tools and feed their results back.
    for (const call of others) {
      const args = parseArgs(call.arguments);
      emit({ type: "tool_call", tool: call.name!, input: args });
      const output = await runTool(call.name!, args, { kb: opts.kb, store: opts.store, storeId });
      if (call.name === "escalate_to_ops" && typeof output["ticket_id"] === "string")
        ticketId = output["ticket_id"];
      emit({ type: "tool_result", tool: call.name!, input: args, output });
      trace.push({ tool: call.name!, input: args, output });
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(output),
      });
    }
    if (respondCall) {
      // respond came together with other tools, so it was written before seeing
      // their results. Reject it and let the model answer again.
      input.push({
        type: "function_call_output",
        call_id: respondCall.call_id,
        output: "Ignored: call respond alone, after reading the tool results.",
      });
    }
  }

  return safeDecline(maxSteps, "max steps reached");
}
