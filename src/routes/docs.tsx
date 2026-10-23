import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  FileText,
  GitPullRequestArrow,
  MessageSquareText,
  PackageSearch,
} from "lucide-react";
import { useState } from "react";

import { PageHeader, Spark } from "@/components/nova/brand";
import { PolicySheet, type SourceRef } from "@/components/nova/PolicySheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type MockOrder } from "@/lib/api";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "Documentation · NovaMart Assist" }] }),
  component: Docs,
});

function Docs() {
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: api.catalog, staleTime: 60_000 });
  const orders = useQuery({ queryKey: ["orders"], queryFn: api.orders, staleTime: 60_000 });
  const [source, setSource] = useState<SourceRef | null>(null);
  const sections = catalog.data?.reduce((n, d) => n + d.sections.length, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <PageHeader
        eyebrow="Documentation"
        title="Everything Nova knows"
        description="The policy documents Nova answers from, loaded live from the same database the agent reads. If a rule is not here, Nova declines instead of guessing."
      />

      {catalog.isPending ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-3xl" />
          ))}
        </div>
      ) : catalog.error ? (
        <p className="mt-8 text-sm text-stone">
          Couldn't load the documentation from the agent API.
        </p>
      ) : (
        <>
          <p className="mt-8 text-[13px] font-semibold tracking-[0.12em] text-stone uppercase">
            {catalog.data.length} documents · {sections} sections
          </p>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {catalog.data.map((d) => (
              <li key={d.doc_id}>
                <button
                  onClick={() => setSource({ docId: d.doc_id })}
                  className="group flex h-full w-full flex-col rounded-3xl border border-line bg-white p-6 text-left transition-shadow hover:shadow-[0_0_0_4px_var(--nova-soft)]"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-2 font-mono text-[11.5px] text-stone">
                      <FileText className="size-3.5" /> {d.doc_id}.md
                    </span>
                    <ArrowUpRight className="size-4 text-stone transition-colors group-hover:text-nova" />
                  </span>
                  <span className="mt-3 font-display text-xl font-bold tracking-tight text-ink">
                    {d.title}
                  </span>
                  <span className="mt-1 text-[14px] leading-relaxed text-stone">{d.summary}</span>
                  <span className="mt-4 flex flex-wrap gap-1.5">
                    {d.sections.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[12px] text-ink/80"
                      >
                        {s}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="mt-8 flex flex-col gap-4 rounded-3xl bg-ink p-6 text-paper md:flex-row md:items-center md:p-8">
        <GitPullRequestArrow className="size-7 shrink-0 text-flare" />
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Adding a policy</h2>
          <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-mist">
            Operations owns these files. A new markdown file in{" "}
            <span className="font-mono text-paper">supabase/policies/</span>, one heading per rule,
            loads into the database and Nova answers from it within a minute. No retraining, no
            deploy. The <span className="text-paper">Ops console</span> shows which document to
            write next.
          </p>
        </div>
        <Spark className="ml-auto hidden size-5 text-nova md:block" />
      </section>

      <section className="mt-12">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-nova uppercase">
          <PackageSearch className="size-3.5" /> Mock order API
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
          Orders Nova can look up
        </h2>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-stone">
          The <span className="font-mono text-ink">get_order_status</span> tool is a stub of
          NovaMart's order API: six invented orders, one per status. Nova never guesses a status; it
          calls the tool and answers from what comes back. Pick one to ask about it.
        </p>
        {orders.isPending ? (
          <Skeleton className="mt-5 h-64 w-full rounded-3xl" />
        ) : orders.error ? (
          <p className="mt-5 text-sm text-stone">Couldn't load the orders from the agent API.</p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-3xl border border-line bg-white">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <thead className="border-b border-line text-[11px] font-semibold tracking-[0.12em] text-stone uppercase">
                <tr>
                  <th className="px-5 py-3">Order</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Items</th>
                  <th className="px-3 py-3">Carrier</th>
                  <th className="px-3 py-3">ETA</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {orders.data.map((o: MockOrder) => (
                  <tr key={o.order_id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-mono whitespace-nowrap text-ink">{o.order_id}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap text-ink">
                        {o.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink/85">{o.description}</td>
                    <td className="px-3 py-3 text-stone">{o.carrier ?? "–"}</td>
                    <td className="px-3 py-3 text-stone">{o.estimated_delivery ?? "–"}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to="/"
                        search={{ q: `What is the status of order ${o.order_id}?` }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-paper hover:bg-ink-2"
                      >
                        <MessageSquareText className="size-3" /> Ask Nova
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PolicySheet source={source} onClose={() => setSource(null)} />
    </div>
  );
}
