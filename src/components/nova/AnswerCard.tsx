import {
  ArrowRight,
  ChevronDown,
  FileText,
  LifeBuoy,
  Package,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import { OrderTracker } from "./OrderTracker";
import { Spark, SparkLoader, StatusBadge } from "./brand";
import { useDocTitle } from "@/hooks/use-agent";
import type { AgentResult, Order, SearchHit } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface TraceItem {
  tool: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface AssistantTurn {
  id: string;
  question: string;
  phase: "working" | "done" | "error";
  trace: TraceItem[];
  result?: AgentResult;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

function activityLabel(turn: AssistantTurn) {
  const last = turn.trace[turn.trace.length - 1];
  if (!last) return "Reading the question…";
  if (!last.output) {
    if (last.tool === "search_policies")
      return `Searching policies for “${String(last.input["query"] ?? "")}”`;
    if (last.tool === "get_order_status")
      return `Looking up order ${String(last.input["order_id"] ?? "")}`;
    if (last.tool === "escalate_to_ops") return "Opening a ticket for Operations";
    return `Running ${last.tool}`;
  }
  return "Checking the sections and writing the answer";
}

function TraceRow({
  item,
  onOpenSource,
}: {
  item: TraceItem;
  onOpenSource: (doc: string, heading?: string) => void;
}) {
  const docTitle = useDocTitle();
  const pending = !item.output;
  const icon =
    item.tool === "search_policies" ? (
      <Search className="size-3.5" />
    ) : item.tool === "get_order_status" ? (
      <Package className="size-3.5" />
    ) : (
      <LifeBuoy className="size-3.5" />
    );

  let title: React.ReactNode = item.tool;
  let detail: React.ReactNode = null;

  if (item.tool === "search_policies") {
    const hits = (item.output?.["results"] as SearchHit[] | undefined) ?? [];
    title = (
      <>
        Searched policies{" "}
        <span className="font-mono text-ink">“{String(item.input["query"] ?? "")}”</span>
      </>
    );
    if (item.output) {
      detail =
        hits.length === 0 ? (
          <span className="text-stone">No section matched.</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {hits.slice(0, 3).map((h, i) => (
              <button
                key={`${h.doc_id}-${h.heading}`}
                onClick={() => onOpenSource(h.doc_id, h.heading)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11.5px] transition-colors hover:border-ink/30 hover:bg-white",
                  i === 0 ? "border-ink/15 bg-white text-ink" : "border-line text-stone",
                )}
              >
                {docTitle(h.doc_id).replace(/ Policy$/, "")} › {h.heading}
              </button>
            ))}
            {hits.length > 3 ? (
              <span className="px-1 text-[11.5px] text-stone">+{hits.length - 3} more</span>
            ) : null}
          </div>
        );
    }
  } else if (item.tool === "get_order_status") {
    const out = item.output as Order | undefined;
    title = (
      <>
        Looked up order{" "}
        <span className="font-mono text-ink">{String(item.input["order_id"] ?? "")}</span>
      </>
    );
    if (out)
      detail = (
        <span className="text-stone">{out.found ? `Status: ${out.status}` : "Not found"}</span>
      );
  } else if (item.tool === "escalate_to_ops") {
    title = <>Opened a ticket for Operations</>;
    if (item.output)
      detail = (
        <span className="text-stone">
          <span className="font-mono text-ink">{String(item.output["ticket_id"] ?? "")}</span> ·
          reply within {String(item.output["expected_response"] ?? "")}
        </span>
      );
  }

  return (
    <li className="animate-rise-in relative flex gap-3 pb-4 last:pb-0">
      <span
        className={cn(
          "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
          pending ? "border-nova/40 bg-nova-soft text-nova" : "border-line bg-white text-ink",
        )}
      >
        {pending ? <SparkLoader className="size-3.5" /> : icon}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5 pt-0.5 text-[13px] text-ink/80">
        <p>{title}</p>
        {detail}
      </div>
    </li>
  );
}

export function AnswerCard({
  turn,
  onOpenSource,
}: {
  turn: AssistantTurn;
  onOpenSource: (docId: string, heading?: string) => void;
}) {
  const docTitle = useDocTitle();
  const [showTrace, setShowTrace] = useState(true);
  const r = turn.result;

  // Keep the trace open while the agent works, fold it once the answer lands.
  useEffect(() => {
    if (turn.phase === "done") setShowTrace(false);
  }, [turn.phase]);

  const orders = turn.trace
    .filter((t) => t.tool === "get_order_status" && t.output)
    .map((t) => t.output as unknown as Order);
  const seconds = turn.endedAt ? ((turn.endedAt - turn.startedAt) / 1000).toFixed(1) : null;

  return (
    <article className="animate-rise-in overflow-hidden rounded-3xl border border-line bg-white shadow-[0_1px_0_rgba(18,20,43,0.04),0_12px_32px_-18px_rgba(18,20,43,0.18)]">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-full bg-ink">
            <Spark
              className={cn("size-3.5 text-nova", turn.phase === "working" && "animate-spark-turn")}
            />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            Nova
          </span>
          {r ? <StatusBadge status={r.status} /> : null}
        </div>
        {r && seconds ? (
          <span className="font-mono text-[11px] text-stone">
            {r.steps} step{r.steps === 1 ? "" : "s"} · {seconds}s
          </span>
        ) : null}
      </div>

      <div className="space-y-4 px-5 pt-4 pb-5 sm:px-6">
        {turn.phase === "working" ? (
          <p className="text-shimmer text-[15px] font-medium">{activityLabel(turn)}…</p>
        ) : null}

        {turn.phase === "error" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-nova/30 bg-nova-soft/60 p-4 text-sm text-ink">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-nova-deep" />
            <div>
              <p className="font-semibold">The agent couldn't answer this one.</p>
              <p className="mt-1 text-ink/70">{turn.error}</p>
            </div>
          </div>
        ) : null}

        {r ? (
          <>
            <p className="text-[17px] leading-[1.6] text-ink">{r.answer}</p>

            {r.next_step ? (
              <div className="flex gap-3 rounded-2xl bg-sand/70 p-4">
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-nova" />
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-stone uppercase">
                    Next step
                  </p>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-ink">{r.next_step}</p>
                </div>
              </div>
            ) : null}

            {orders.map((o) => (
              <OrderTracker key={o.order_id} order={o} />
            ))}

            {r.ticket_id ? (
              <div className="flex items-center gap-3 rounded-2xl border border-escalated/25 bg-escalated-soft px-4 py-3 text-sm text-ink">
                <LifeBuoy className="size-4 text-escalated" />
                Ticket <span className="font-mono font-semibold">{r.ticket_id}</span> is with
                Operations.
              </div>
            ) : null}

            {r.sources.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold tracking-[0.14em] text-stone uppercase">
                  Sources
                </span>
                {r.sources.map((s) => (
                  <button
                    key={`${s.doc_id}-${s.heading}`}
                    onClick={() => onOpenSource(s.doc_id, s.heading)}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-[12.5px] text-ink transition-all hover:-translate-y-px hover:border-nova/40 hover:bg-nova-soft/50"
                  >
                    <FileText className="size-3.5 text-stone group-hover:text-nova" />
                    <span className="font-medium">
                      {docTitle(s.doc_id).replace(/ Policy$/, "")}
                    </span>
                    <span className="text-stone">› {s.heading}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {turn.trace.length > 0 || turn.phase === "working" ? (
        <div className="border-t border-line bg-paper/60">
          <button
            onClick={() => setShowTrace((s) => !s)}
            className="flex w-full items-center justify-between px-5 py-3 text-left text-[12.5px] font-medium text-stone transition-colors hover:text-ink sm:px-6"
          >
            <span>
              How Nova got here
              {turn.trace.length > 0 ? (
                <span className="ml-2 font-mono text-[11px]">
                  {turn.trace.length} tool call{turn.trace.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </span>
            <ChevronDown className={cn("size-4 transition-transform", showTrace && "rotate-180")} />
          </button>
          {showTrace ? (
            <div className="px-5 pb-5 sm:px-6">
              <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-line">
                {turn.trace.map((t, i) => (
                  <TraceRow key={i} item={t} onOpenSource={onOpenSource} />
                ))}
                {turn.phase === "working" && turn.trace.every((t) => t.output) ? (
                  <li className="relative flex gap-3">
                    <span className="relative z-10 mt-0.5 flex size-6 items-center justify-center rounded-full border border-nova/40 bg-nova-soft">
                      <SparkLoader className="size-3.5" />
                    </span>
                    <p className="pt-1 text-[13px] text-stone">Thinking…</p>
                  </li>
                ) : null}
              </ol>
              {r ? (
                <p className="mt-4 font-mono text-[11px] text-stone">
                  tokens in {r.usage.input_tokens ?? 0} · cached{" "}
                  {r.usage.cache_read_input_tokens ?? 0} · out {r.usage.output_tokens ?? 0}
                  {r.note ? ` · note: ${r.note}` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
