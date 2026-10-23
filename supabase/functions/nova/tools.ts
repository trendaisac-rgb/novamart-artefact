/**
 * The four tools the model can call, as JSON schemas (OpenAI Responses API
 * format, strict mode), and the code that runs them.
 *
 * `respond` is the final answer as structured data. Making the answer a tool
 * call is what makes "declined" a status the evals can check, instead of a
 * sentence we would have to detect with a regex.
 */

import type { KnowledgeBase } from "./knowledge.ts";

export interface Store {
  getOrder(orderId: string): Promise<Record<string, unknown> | null>;
  createTicket(t: Ticket): Promise<void>;
  logGap(g: Gap): Promise<void>;
}

export interface Ticket {
  ticket_id: string;
  store_id: string | null;
  priority: "blocking" | "normal";
  order_id: string | null;
  summary: string;
}

export interface Gap {
  store_id: string | null;
  question: string;
  status: "declined" | "escalated";
  decline_reason: string | null;
  searches: string[];
  answer: string;
  ticket_id: string | null;
}

export const TOOLS = [
  {
    type: "function",
    name: "search_policies",
    description:
      "Search NovaMart's internal policy documentation. Returns the most relevant sections with their document id and heading. Use it for any question about returns, exchanges, refunds, price match, damaged items, deliveries, gift cards, loyalty points or escalation rules. Search again with different wording if the first results do not cover the question.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { query: { type: "string", description: "Keywords or a short question." } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_order_status",
    description:
      "Look up a customer order by order number (format NM-####). Returns status, items, carrier, tracking and the last tracking event. Use it whenever the question is about a specific order. Never guess an order's status.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { order_id: { type: "string", description: "Order number, e.g. NM-1002" } },
      required: ["order_id"],
    },
  },
  {
    type: "function",
    name: "escalate_to_ops",
    description:
      "Open a ticket with the Operations helpdesk. Use it only when the documentation sends the case to the Operations team (requests for an exception to a policy, claims or approvals above the store's limits, POS errors) or when the question is not covered and the employee needs an answer. Never for approvals the store manager gives in the store.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
          description: "One paragraph: customer request, what was checked, what was told so far.",
        },
        priority: {
          type: "string",
          enum: ["blocking", "normal"],
          description: "blocking = a sale or refund is stuck right now.",
        },
        order_id: {
          type: ["string", "null"],
          description: "Order number if the case involves one, else null.",
        },
      },
      required: ["summary", "priority", "order_id"],
    },
  },
  {
    type: "function",
    name: "respond",
    description:
      "Deliver the final answer to the employee. Always finish with this tool. status=answered when the answer is grounded in the documentation or in tool results. status=declined when the documentation does not cover the question. status=escalated when a ticket was opened or a human decision is needed. status=needs_info when you need one detail from the employee (for example the order number) before you can answer.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["answered", "declined", "escalated", "needs_info"] },
        answer: {
          type: "string",
          description:
            "The direct answer, 1 to 4 short sentences. For declined: say plainly what is not covered.",
        },
        next_step: {
          type: "string",
          description: "What the employee should do now, in one or two sentences.",
        },
        sources: {
          type: "array",
          description:
            "Sections the answer is based on, copied exactly from search_policies results in this conversation. For declined: empty, or only the section that names where to send the employee.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { doc_id: { type: "string" }, heading: { type: "string" } },
            required: ["doc_id", "heading"],
          },
        },
        decline_reason: {
          type: ["string", "null"],
          enum: ["not_in_docs", "out_of_scope", "needs_human", null],
          description: "Only for declined or escalated, otherwise null.",
        },
      },
      required: ["status", "answer", "next_step", "sources", "decline_reason"],
    },
  },
];

export interface ToolContext {
  kb: KnowledgeBase;
  store: Store;
  storeId: string | null;
  /** Eval runs: tools behave the same but write nothing to NovaMart's systems. */
  dryRun?: boolean;
}

/** Runs one tool call. Returns an error object instead of throwing, so the model can recover. */
export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext) {
  try {
    if (name === "search_policies") {
      const results = ctx.kb.search(String(args["query"] ?? ""));
      if (results.length === 0) {
        return {
          results: [],
          note: "No section matched. Try other words, or decline if the topic is not in the catalog.",
        };
      }
      return { results: results.map(({ doc_id, heading, text }) => ({ doc_id, heading, text })) };
    }

    if (name === "get_order_status") {
      const orderId = String(args["order_id"] ?? "")
        .trim()
        .toUpperCase();
      const order = await ctx.store.getOrder(orderId);
      if (!order)
        return {
          found: false,
          order_id: orderId,
          error: "Order not found. Check the number with the customer.",
        };
      return { found: true, ...order };
    }

    if (name === "escalate_to_ops") {
      const priority = args["priority"] === "blocking" ? "blocking" : "normal";
      const ticket: Ticket = {
        ticket_id: `OPS-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        store_id: ctx.storeId,
        priority,
        order_id: (args["order_id"] as string | null) ?? null,
        summary: String(args["summary"] ?? ""),
      };
      if (!ctx.dryRun) await ctx.store.createTicket(ticket);
      return {
        ticket_id: ticket.ticket_id,
        expected_response: priority === "blocking" ? "2 hours" : "1 business day",
      };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    return { error: `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
