/**
 * OpenAI Responses API over plain fetch. The provider boundary is this file:
 * swapping to another model provider means another ModelClient, nothing else.
 */

import type { ModelClient, OutputItem } from "./agent.ts";

const RESPONSES_URL = "https://api.openai.com/v1/responses";

async function post(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // One retry with backoff on rate limits and server errors; 60s timeout per call.
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) return await res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 2) {
      throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function usageOf(data: Record<string, unknown>) {
  const u = (data["usage"] ?? {}) as Record<string, unknown>;
  const details = (u["input_tokens_details"] ?? {}) as Record<string, unknown>;
  return {
    input_tokens: Number(u["input_tokens"] ?? 0),
    output_tokens: Number(u["output_tokens"] ?? 0),
    cached_tokens: Number(details["cached_tokens"] ?? 0),
  };
}

export class OpenAIResponses implements ModelClient {
  constructor(
    private apiKey: string,
    private model: string,
    private reasoningEffort: string,
  ) {}

  async respond(req: { instructions: string; input: unknown[]; tools: unknown[] }) {
    const body: Record<string, unknown> = {
      model: this.model,
      instructions: req.instructions,
      input: req.input,
      tools: req.tools,
      tool_choice: "required", // the model must act; `respond` is the exit
    };
    if (this.reasoningEffort) body["reasoning"] = { effort: this.reasoningEffort };
    const data = await post(this.apiKey, body);
    return { output: (data["output"] ?? []) as OutputItem[], usage: usageOf(data) };
  }
}

/** Plain text completion, for small side jobs like clustering the knowledge gaps. */
export async function complete(apiKey: string, model: string, prompt: string): Promise<string> {
  const data = await post(apiKey, { model, input: prompt });
  const out = (data["output"] ?? []) as {
    type: string;
    content?: { type: string; text?: string }[];
  }[];
  return out
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
}
