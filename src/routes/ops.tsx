import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, FileText, Search, Store } from "lucide-react";
import { useMemo, useState } from "react";

import { Markdown } from "@/components/nova/Markdown";
import { PolicySheet, type SourceRef } from "@/components/nova/PolicySheet";
import { PageHeader, Spark, SparkLoader, StatusBadge } from "@/components/nova/brand";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalog, useHealth } from "@/hooks/use-agent";
import { api, type GapEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ops")({
  head: () => ({ meta: [{ title: "Ops console · NovaMart Assist" }] }),
  component: OpsConsole,
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "not_in_docs", label: "Not in the docs" },
  { key: "out_of_scope", label: "Out of scope" },
  { key: "escalated", label: "Escalated" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function bucket(e: GapEntry): Exclude<FilterKey, "all"> {
  if (e.status === "escalated" || e.decline_reason === "needs_human") return "escalated";
  if (e.decline_reason === "out_of_scope") return "out_of_scope";
  return "not_in_docs";
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        accent ? "border-ink bg-ink text-paper" : "border-line bg-white",
      )}
    >
      <p className={cn("text-[12px] font-medium", accent ? "text-mist" : "text-stone")}>{label}</p>
      <p className="mt-1 font-display text-[2rem] leading-none font-bold tracking-tight">{value}</p>
      <p className={cn("mt-2 text-[12px]", accent ? "text-mist" : "text-stone")}>{hint}</p>
    </div>
  );
}

function OpsConsole() {
  const health = useHealth();
  const catalog = useCatalog();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [source, setSource] = useState<SourceRef | null>(null);
  const gaps = useQuery({
    queryKey: ["gaps"],
    queryFn: api.gaps,
    enabled: health.isSuccess,
    refetchInterval: 10000,
  });
  const summary = useMutation({ mutationFn: api.summarizeGaps });

  const entries = useMemo(() => gaps.data?.entries ?? [], [gaps.data]);
  const counts = useMemo(() => {
    const c = { not_in_docs: 0, out_of_scope: 0, escalated: 0 };
    for (const e of entries) c[bucket(e)]++;
    return c;
  }, [entries]);
  const stores = new Set(entries.map((e) => e.store_id).filter(Boolean)).size;
  const visible = filter === "all" ? entries : entries.filter((e) => bucket(e) === filter);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <PageHeader
        eyebrow="Ops console"
        title="Every unanswered question becomes a to-do"
        description="When Nova declines or escalates, the question lands here with the store and the searches it tried. Ops writes the missing policy once, drops the markdown in the policy folder, and Nova answers it from the next question on."
      />

      {health.isError ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center text-stone">
          The agent API isn't reachable. Run{" "}
          <code className="rounded bg-sand px-1.5 font-mono text-sm">make api</code>.
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              accent
              label="Open gaps"
              value={gaps.data?.total ?? "–"}
              hint={`from ${stores} store${stores === 1 ? "" : "s"}`}
            />
            <Kpi
              label="Not in the docs"
              value={counts.not_in_docs}
              hint="Missing policy to write"
            />
            <Kpi
              label="Out of scope"
              value={counts.out_of_scope}
              hint="Routed to HR, IT and others"
            />
            <Kpi label="Escalated" value={counts.escalated} hint="Needed a human decision" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
            <section className="self-start rounded-3xl border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <h2 className="font-display text-lg font-semibold tracking-tight">Gap inbox</h2>
                <div className="flex flex-wrap gap-1 rounded-xl bg-sand p-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                        filter === f.key
                          ? "bg-white text-ink shadow-sm"
                          : "text-stone hover:text-ink",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {gaps.isPending ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-sand">
                    <Spark className="size-5 text-nova" />
                  </span>
                  <p className="mt-4 font-display text-lg font-semibold">
                    {entries.length === 0 ? "No gaps yet" : "Nothing in this filter"}
                  </p>
                  <p className="mt-1 max-w-sm text-sm text-stone">
                    {entries.length === 0
                      ? "Ask Nova something the documentation doesn't cover and watch it arrive here."
                      : "Try another filter."}
                  </p>
                  {entries.length === 0 ? (
                    <Link
                      to="/"
                      search={{ q: "What is the employee discount percentage?" }}
                      className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink-2"
                    >
                      Try “employee discount” <ArrowUpRight className="size-4" />
                    </Link>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {visible.map((e, i) => (
                    <li
                      key={`${e.ts}-${i}`}
                      className="animate-rise-in px-5 py-4"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-[15px] leading-snug font-semibold text-ink">
                          {e.question}
                        </p>
                        <StatusBadge status={e.status} className="shrink-0" />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-stone">
                        {e.store_id ? (
                          <span className="inline-flex items-center gap-1">
                            <Store className="size-3" /> {e.store_id}
                          </span>
                        ) : null}
                        <span>{timeAgo(e.ts)}</span>
                        <span className="font-mono">{e.decline_reason ?? e.status}</span>
                        {e.ticket_id ? (
                          <span className="font-mono text-escalated">{e.ticket_id}</span>
                        ) : null}
                      </div>
                      {e.searches.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <Search className="size-3 text-stone" />
                          {e.searches.map((s, k) => (
                            <span
                              key={k}
                              className="rounded-md bg-sand px-2 py-0.5 font-mono text-[11.5px] text-ink/70"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="space-y-6">
              <section className="relative overflow-hidden rounded-3xl bg-ink p-5 text-paper">
                <Spark className="pointer-events-none absolute -top-8 -right-8 size-32 text-ink-2" />
                <div className="relative">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-flare uppercase">
                    What to document next
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-mist">
                    A small model groups the open questions into themes and names the policy that
                    would answer each.
                  </p>
                  <Button
                    onClick={() => summary.mutate()}
                    disabled={summary.isPending || entries.length === 0}
                    className="mt-4 w-full rounded-xl bg-nova font-semibold text-white hover:bg-nova-deep"
                  >
                    {summary.isPending ? (
                      <SparkLoader className="size-4 [&_svg]:text-white" />
                    ) : (
                      <Spark className="size-4" />
                    )}
                    {summary.isPending ? "Clustering…" : "Cluster the gaps"}
                  </Button>
                </div>
                {summary.data?.markdown ? (
                  <div className="relative mt-5 rounded-2xl bg-paper p-4 text-ink">
                    <Markdown source={summary.data.markdown} />
                  </div>
                ) : null}
                {summary.isError ? (
                  <p className="relative mt-3 text-[13px] text-flare">
                    {(summary.error as Error).message}
                  </p>
                ) : null}
              </section>

              <section className="rounded-3xl border border-line bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Policy library
                  </h2>
                  <BookOpen className="size-4 text-stone" />
                </div>
                <p className="mt-1 text-[13px] text-stone">
                  Everything Nova is allowed to answer from.
                </p>
                <ul className="mt-4 space-y-1">
                  {(catalog.data ?? []).map((d) => (
                    <li key={d.doc_id}>
                      <button
                        onClick={() => setSource({ docId: d.doc_id })}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-sand"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <FileText className="size-4 shrink-0 text-stone" />
                          <span className="truncate text-[13.5px] font-medium text-ink">
                            {d.title}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-stone">
                          {d.sections.length} §
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 rounded-xl bg-sand/70 p-3 font-mono text-[11.5px] leading-relaxed text-ink/70">
                  agent/data/policies/*.md
                  <br />
                  one “##” heading per rule
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
      <PolicySheet source={source} onClose={() => setSource(null)} />
    </div>
  );
}
