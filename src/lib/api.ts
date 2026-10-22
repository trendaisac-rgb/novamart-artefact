/**
 * Client for the NovaMart agent API (agent/src/novamart/server.py).
 * The UI holds no business logic: every answer comes from the Python agent.
 */

export type Status = "answered" | "declined" | "escalated" | "needs_info";

export interface Source {
  doc_id: string;
  heading: string;
}

export interface SearchHit {
  doc_id: string;
  heading: string;
  text: string;
}

export interface Order {
  found: boolean;
  order_id: string;
  customer_name?: string;
  status?: string;
  items?: { sku: string; description: string; price: number }[];
  total?: number;
  order_date?: string;
  shipping_method?: string;
  carrier?: string;
  tracking_number?: string;
  estimated_delivery?: string;
  last_event?: string;
  error?: string;
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
  sources: Source[];
  decline_reason: string | null;
  ticket_id: string | null;
  trace: TraceStep[];
  steps: number;
  usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
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
  | { type: "result"; result: AgentResult }
  | { type: "error"; message: string }
  | { type: "done" };

export interface Health {
  status: string;
  agent_ready: boolean;
  reason: string | null;
  model: string;
  documents: number;
  sections: number;
}

export interface CatalogDoc {
  doc_id: string;
  title: string;
  summary: string;
  sections: string[];
}

export interface PolicyDoc {
  doc_id: string;
  title: string;
  summary: string;
  sections: { heading: string; text: string }[];
}

export interface GapEntry {
  ts: string;
  store_id: string | null;
  question: string;
  status: Status;
  decline_reason: string | null;
  searches: string[];
  answer: string;
  ticket_id: string | null;
}

export interface GapList {
  total: number;
  by_reason: Record<string, number>;
  entries: GapEntry[];
}

export interface EvalCase {
  id: string;
  category: string;
  question: string;
  status: Status;
  failures: string[];
  judge: { faithful: boolean | null; addresses: boolean | null; note: string } | null;
  answer: string;
  sources: Source[];
  tools: string[];
  steps: number;
  seconds: number;
}

export interface EvalRun {
  generated_at: string;
  passed: number;
  total: number;
  rate: number;
  seconds: number;
  threshold: number;
  judge: boolean;
  cases: EvalCase[];
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "novamart.apiUrl";
export const DEFAULT_API_URL =
  (import.meta.env["VITE_NOVAMART_API_URL"] as string | undefined) ?? "http://localhost:8000";

export function getApiUrl(): string {
  if (typeof window === "undefined") return DEFAULT_API_URL;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_API_URL;
  } catch {
    return DEFAULT_API_URL;
  }
}

export function setApiUrl(url: string): void {
  try {
    const clean = url.trim().replace(/\/+$/, "");
    if (!clean || clean === DEFAULT_API_URL) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, clean);
  } catch {
    /* storage unavailable: keep the default */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}${path}`, init);
  } catch {
    throw new ApiError(`Can't reach the agent at ${getApiUrl()}`, 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<Health>("/api/health"),
  catalog: () => request<CatalogDoc[]>("/api/catalog"),
  policy: (docId: string) => request<PolicyDoc>(`/api/policies/${encodeURIComponent(docId)}`),
  gaps: () => request<GapList>("/api/gaps"),
  summarizeGaps: () =>
    request<{ markdown: string; count: number }>("/api/gaps/summarize", { method: "POST" }),
  evals: () => request<EvalRun>("/api/evals/latest"),
};

/** POST /api/ask and yield each server-sent event as the agent works. */
export async function* ask(
  body: { question: string; store_id?: string; history?: Turn[] },
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new ApiError(`Can't reach the agent at ${getApiUrl()}`, 0);
  }
  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(detail, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) yield JSON.parse(line.slice(6)) as AgentEvent;
    }
  }
}
