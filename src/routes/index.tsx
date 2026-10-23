import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUp, RotateCcw, Store } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AnswerCard, type AssistantTurn } from "@/components/nova/AnswerCard";
import { PolicySheet, type SourceRef } from "@/components/nova/PolicySheet";
import { Spark } from "@/components/nova/brand";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHealth } from "@/hooks/use-agent";
import { ApiError, ask, type Turn } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" ? { q: search["q"] } : {},
  head: () => ({
    meta: [
      { title: "Ask Nova · NovaMart Assist" },
      {
        name: "description",
        content: "Grounded answers on NovaMart policies, returns and orders for store teams.",
      },
    ],
  }),
  component: StoreFloor,
});

const STORES = [
  { id: "S-012", name: "Chicago Loop" },
  { id: "S-031", name: "Austin Domain" },
  { id: "S-104", name: "Miami Brickell" },
];

const SUGGESTIONS = [
  { tag: "Price match", q: "Do we price match Amazon?" },
  {
    tag: "Holiday window",
    q: "A customer bought a TV on December 20 and wants to return it on January 10. Is that allowed?",
  },
  { tag: "Live order", q: "Order NM-1003 shows as delayed. What do I tell the customer?" },
  {
    tag: "Needs a manager",
    q: "Customer wants a 650 dollar refund in cash for a return, with receipt. Can I process it?",
  },
  { tag: "Not in the docs", q: "What is the employee discount percentage?" },
  { tag: "Em português", q: "Posso trocar uma cueca por outro tamanho?" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function StoreFloor() {
  const { q } = Route.useSearch();
  const health = useHealth();
  const queryClient = useQueryClient();
  const [store, setStore] = useState("S-012");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [source, setSource] = useState<SourceRef | null>(null);
  const [hello, setHello] = useState("Hello");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const busy = turns.some((t) => t.phase === "working");

  useEffect(() => setHello(greeting()), []);
  useEffect(() => {
    if (q) {
      setInput(q);
      inputRef.current?.focus();
    }
  }, [q]);
  useEffect(() => {
    if (turns.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = (id: string, fn: (t: AssistantTurn) => AssistantTurn) =>
    setTurns((all) => all.map((t) => (t.id === id ? fn(t) : t)));

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setInput("");

    // Short text history so follow-ups work, same as the CLI.
    const history: Turn[] = turns
      .filter((t) => t.result)
      .slice(-3)
      .flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.result!.answer },
      ]);

    const id = `${Date.now()}`;
    setTurns((all) => [
      ...all,
      { id, question: text, phase: "working", trace: [], startedAt: Date.now() },
    ]);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const e of ask({ question: text, store_id: store, history }, controller.signal)) {
        if (e.type === "tool_call") {
          patch(id, (t) => ({ ...t, trace: [...t.trace, { tool: e.tool, input: e.input }] }));
        } else if (e.type === "tool_result") {
          patch(id, (t) => {
            const trace = [...t.trace];
            const idx = trace.findIndex((x) => x.tool === e.tool && !x.output);
            if (idx >= 0) trace[idx] = { ...trace[idx]!, output: e.output };
            return { ...t, trace };
          });
        } else if (e.type === "result") {
          patch(id, (t) => ({ ...t, phase: "done", result: e.result, endedAt: Date.now() }));
        } else if (e.type === "error") {
          patch(id, (t) => ({ ...t, phase: "error", error: e.message, endedAt: Date.now() }));
        }
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "The connection to the agent was interrupted.";
      patch(id, (t) =>
        t.phase === "working" ? { ...t, phase: "error", error: message, endedAt: Date.now() } : t,
      );
    } finally {
      queryClient.invalidateQueries({ queryKey: ["gaps"] });
    }
  }

  const storeName = STORES.find((s) => s.id === store)?.name ?? store;
  const offline = health.isError;

  return (
    <div className="flex min-h-[calc(100vh-53px)] flex-col lg:min-h-screen">
      <div className="sticky top-[53px] z-20 border-b border-line/80 bg-paper/85 backdrop-blur lg:top-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[17px] font-bold tracking-tight text-ink">Ask Nova</h1>
            <span className="hidden text-sm text-stone sm:inline">
              · policies, returns and orders
            </span>
          </div>
          <div className="flex items-center gap-2">
            {turns.length > 0 ? (
              <button
                onClick={() => {
                  abortRef.current?.abort();
                  setTurns([]);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-stone transition-colors hover:bg-sand hover:text-ink"
              >
                <RotateCcw className="size-3.5" /> New
              </button>
            ) : null}
            <Select value={store} onValueChange={setStore}>
              <SelectTrigger className="h-9 w-auto gap-2 rounded-lg border-line bg-white text-[13px]">
                <Store className="size-3.5 text-stone" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {STORES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="font-mono text-xs text-stone">{s.id}</span> {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-6 sm:px-6">
        {turns.length === 0 ? (
          <section className="bg-grain -mx-4 rounded-[2rem] px-4 pt-6 pb-2 sm:-mx-6 sm:px-6 md:pt-12">
            <div className="mb-8 flex items-center gap-3">
              <span className="relative flex size-12 items-center justify-center rounded-2xl bg-ink shadow-[0_10px_30px_-10px_rgba(255,91,53,0.6)]">
                <Spark className="animate-spark-glow size-6 text-nova" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-medium text-stone">
                  {hello}, {storeName}
                </p>
                <p className="font-mono text-xs text-stone/80">{store}</p>
              </div>
            </div>
            <h2 className="font-display text-[2.4rem] leading-[1.02] font-extrabold tracking-[-0.03em] text-ink md:text-[3.4rem]">
              What does the
              <br />
              customer <span className="text-nova">need?</span>
            </h2>
            <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-stone">
              Nova answers from NovaMart policy, checks live orders, and tells you plainly when
              something isn't covered. Every answer shows its source.
            </p>

            <div className="mt-9 grid gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={s.q}
                  onClick={() => send(s.q)}
                  disabled={offline}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className="animate-rise-in group flex flex-col items-start gap-2 rounded-2xl border border-line bg-white/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:bg-white hover:shadow-[0_14px_30px_-20px_rgba(18,20,43,0.35)] disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-nova uppercase">
                    <Spark className="size-2.5" />
                    {s.tag}
                  </span>
                  <span className="text-[14.5px] leading-snug font-medium text-ink">{s.q}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="space-y-8">
            {turns.map((t) => (
              <div key={t.id} className="space-y-4">
                <div className="animate-rise-in flex justify-end">
                  <p className="max-w-[85%] rounded-3xl rounded-br-md bg-ink px-5 py-3 text-[15px] leading-relaxed text-paper">
                    {t.question}
                  </p>
                </div>
                <AnswerCard
                  turn={t}
                  onOpenSource={(docId, heading) =>
                    setSource({ docId, ...(heading ? { heading } : {}) })
                  }
                />
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 z-20 bg-gradient-to-t from-paper via-paper to-paper/0 pt-6">
        <div className="mx-auto max-w-3xl px-4 pb-5 sm:px-6">
          {offline ? (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-nova/30 bg-nova-soft/70 px-3 py-2 text-[13px] text-ink">
              <span className="size-2 rounded-full bg-nova" />
              The agent isn't reachable right now. This page reconnects on its own.
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className={cn(
              "flex items-end gap-2 rounded-[1.4rem] border bg-white p-2 pl-4 shadow-[0_18px_40px_-24px_rgba(18,20,43,0.35)] transition-colors",
              "border-line focus-within:border-ink/30",
            )}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about returns, price match, orders…"
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[15px] text-ink outline-none placeholder:text-stone/70"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              aria-label="Ask Nova"
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-nova text-white transition-all hover:bg-nova-deep active:scale-95 disabled:bg-sand disabled:text-stone"
            >
              <ArrowUp className="size-5" />
            </button>
          </form>
          <p className="mt-2 text-center text-[11.5px] text-stone">
            Answers come only from NovaMart documentation. Anything not covered goes to the Ops
            console.
          </p>
        </div>
      </div>

      <PolicySheet source={source} onClose={() => setSource(null)} />
    </div>
  );
}
