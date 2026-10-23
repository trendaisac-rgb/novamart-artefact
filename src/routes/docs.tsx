import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, FileText, GitPullRequestArrow } from "lucide-react";
import { useState } from "react";

import { PageHeader, Spark } from "@/components/nova/brand";
import { PolicySheet, type SourceRef } from "@/components/nova/PolicySheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "Documentation · NovaMart Assist" }] }),
  component: Docs,
});

function Docs() {
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: api.catalog, staleTime: 60_000 });
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

      <PolicySheet source={source} onClose={() => setSource(null)} />
    </div>
  );
}
