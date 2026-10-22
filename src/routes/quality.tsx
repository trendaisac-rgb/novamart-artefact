import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronDown, Scale, ShieldCheck, Terminal, X } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader, Spark, StatusBadge } from "@/components/nova/brand";
import { Skeleton } from "@/components/ui/skeleton";
import { useHealth } from "@/hooks/use-agent";
import { ApiError, api, type EvalCase } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/quality")({
  head: () => ({ meta: [{ title: "Quality · NovaMart Assist" }] }),
  component: Quality,
});

const CATEGORY_LABEL: Record<string, string> = {
  policy: "Policy answers",
  tool: "Live order lookups",
  decline: "Declines",
  edge: "Edge cases",
};

function Ring({ rate, threshold }: { rate: number; threshold: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const t = threshold * 360 - 90;
  const tx = 64 + r * Math.cos((t * Math.PI) / 180);
  const ty = 64 + r * Math.sin((t * Math.PI) / 180);
  return (
    <svg viewBox="0 0 128 128" className="size-40">
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--ink-2)" strokeWidth="12" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke={rate >= threshold ? "var(--answered)" : "var(--nova)"}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${c * rate} ${c}`}
        transform="rotate(-90 64 64)"
        style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1)" }}
      />
      <circle cx={tx} cy={ty} r="4" fill="var(--flare)" stroke="var(--ink)" strokeWidth="2" />
      <text
        x="64"
        y="62"
        textAnchor="middle"
        className="fill-paper font-display"
        fontSize="28"
        fontWeight="800"
      >
        {Math.round(rate * 100)}%
      </text>
      <text x="64" y="80" textAnchor="middle" className="fill-mist" fontSize="9" letterSpacing="1">
        PASS RATE
      </text>
    </svg>
  );
}

function CaseRow({ c }: { c: EvalCase }) {
  const [open, setOpen] = useState(false);
  const pass = c.failures.length === 0;
  return (
    <li className="border-b border-line last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-paper"
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full",
            pass ? "bg-answered-soft text-answered" : "bg-nova-soft text-nova-deep",
          )}
        >
          {pass ? <Check className="size-3.5" /> : <X className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12.5px] text-ink">{c.id}</span>
          <span className="block truncate text-[12px] text-stone">{c.question}</span>
        </span>
        <span className="hidden sm:block">
          <StatusBadge status={c.status} />
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-stone transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="space-y-3 bg-paper/70 px-5 pt-1 pb-4 pl-14 text-[13px]">
          {!pass ? (
            <ul className="space-y-1">
              {c.failures.map((f, i) => (
                <li key={i} className="font-mono text-[12px] text-nova-deep">
                  ✕ {f}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="leading-relaxed text-ink">{c.answer}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] text-stone">
            <span>tools: {c.tools.join(", ") || "none"}</span>
            <span>
              {c.steps} steps · {c.seconds}s
            </span>
            {c.sources.length ? (
              <span>cited: {c.sources.map((s) => `${s.doc_id} › ${s.heading}`).join("; ")}</span>
            ) : null}
          </div>
          {c.judge ? (
            <p className="flex items-start gap-2 text-[12.5px] text-stone">
              <Scale className="mt-0.5 size-3.5 shrink-0" />
              Judge: faithful={String(c.judge.faithful)} · addresses={String(c.judge.addresses)} ·{" "}
              {c.judge.note}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Quality() {
  const health = useHealth();
  const evals = useQuery({
    queryKey: ["evals"],
    queryFn: api.evals,
    enabled: health.isSuccess,
    retry: false,
  });
  const [onlyFailures, setOnlyFailures] = useState(false);

  const byCategory = useMemo(() => {
    const m = new Map<string, { passed: number; total: number }>();
    for (const c of evals.data?.cases ?? []) {
      const v = m.get(c.category) ?? { passed: 0, total: 0 };
      v.total++;
      if (c.failures.length === 0) v.passed++;
      m.set(c.category, v);
    }
    return [...m.entries()];
  }, [evals.data]);

  const noRun = evals.error instanceof ApiError && evals.error.status === 404;
  const run = evals.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <PageHeader
        eyebrow="Quality"
        title="Measured, not assumed"
        description="24 test questions run against the live agent. Deterministic checks on status, citations and tools, then a small model judges every answered case against the exact sections the agent read. Below the threshold, the release is blocked."
      />

      {health.isError ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center text-stone">
          The agent API isn't reachable. Run{" "}
          <code className="rounded bg-sand px-1.5 font-mono text-sm">make api</code>.
        </div>
      ) : evals.isPending && health.isSuccess ? (
        <Skeleton className="mt-8 h-56 w-full rounded-3xl" />
      ) : noRun ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="rounded-3xl bg-ink p-7 text-paper">
            <Terminal className="size-6 text-flare" />
            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">No eval run yet</h2>
            <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-mist">
              Results appear here after the suite runs against the real API. Nothing on this page is
              made up: no run, no numbers.
            </p>
            <pre className="mt-6 rounded-2xl bg-ink-2 p-4 font-mono text-[13px] text-paper">
              <span className="text-mist">$</span> make evals
            </pre>
          </section>
          <section className="rounded-3xl border border-line bg-white p-7">
            <h3 className="font-display text-lg font-semibold">What the suite checks</h3>
            <ul className="mt-4 space-y-3 text-[14px] text-ink/85">
              {[
                [
                  "Policy answers (12)",
                  "Holiday window over the 15 day electronics rule, Amazon vs. Marketplace, final sale, refunds that need a manager, one question in Portuguese.",
                ],
                [
                  "Live order lookups (6)",
                  "Delayed, missing, cancellable, not found, and a question with no order number: it must ask, not guess.",
                ],
                [
                  "Declines (4)",
                  "Employee discount, marketplace returns, vacation days, the weather. Nothing may be invented.",
                ],
                [
                  "Edge cases (2)",
                  "An exception outside the window, a warranty question the docs only partly cover.",
                ],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <Spark className="mt-1 size-3 shrink-0 text-nova" />
                  <span>
                    <span className="font-semibold">{t}.</span>{" "}
                    <span className="text-stone">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : run ? (
        <>
          <section className="mt-8 grid gap-6 rounded-3xl bg-ink p-6 text-paper md:grid-cols-[auto_1fr] md:p-8">
            <Ring rate={run.rate} threshold={run.threshold} />
            <div className="flex flex-col justify-center">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-display text-3xl font-bold tracking-tight">
                  {run.passed}/{run.total} passed
                </p>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                    run.rate >= run.threshold ? "bg-answered text-white" : "bg-nova text-white",
                  )}
                >
                  <ShieldCheck className="size-3.5" />
                  {run.rate >= run.threshold ? "Release gate passed" : "Release gate blocked"}
                </span>
              </div>
              <p className="mt-2 text-[14px] text-mist">
                Gate at {Math.round(run.threshold * 100)}% · LLM judge {run.judge ? "on" : "off"} ·{" "}
                {new Date(run.generated_at).toLocaleString()} · {Math.round(run.seconds)}s
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {byCategory.map(([cat, v]) => (
                  <div key={cat}>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-paper">{CATEGORY_LABEL[cat] ?? cat}</span>
                      <span className="font-mono text-mist">
                        {v.passed}/{v.total}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-2">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          v.passed === v.total ? "bg-answered" : "bg-flare",
                        )}
                        style={{ width: `${(v.passed / v.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-3xl border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-display text-lg font-semibold tracking-tight">Cases</h2>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-stone">
                <input
                  type="checkbox"
                  checked={onlyFailures}
                  onChange={(e) => setOnlyFailures(e.target.checked)}
                  className="accent-[var(--nova)]"
                />
                Failures only
              </label>
            </div>
            <ul>
              {run.cases
                .filter((c) => !onlyFailures || c.failures.length > 0)
                .map((c) => (
                  <CaseRow key={c.id} c={c} />
                ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
