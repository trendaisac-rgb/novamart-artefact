import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useEffect, useRef } from "react";

import { Markdown } from "./Markdown";
import { Spark } from "./brand";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface SourceRef {
  docId: string;
  heading?: string;
}

/** Opens the real policy document, with the cited section highlighted. */
export function PolicySheet({
  source,
  onClose,
}: {
  source: SourceRef | null;
  onClose: () => void;
}) {
  const { data, isPending, error } = useQuery({
    queryKey: ["policy", source?.docId],
    queryFn: () => api.policy(source!.docId),
    enabled: !!source,
    staleTime: Infinity,
  });
  const citedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (data && citedRef.current) {
      citedRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [data, source?.heading]);

  return (
    <Sheet open={!!source} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-line bg-paper p-0 sm:max-w-xl"
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-line bg-paper/95 px-6 py-5 text-left backdrop-blur">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-stone uppercase">
            <FileText className="size-3.5" /> Policy document · {source?.docId}.md
          </p>
          <SheetTitle className="font-display text-2xl font-bold tracking-tight text-ink">
            {data?.title ?? " "}
          </SheetTitle>
          <SheetDescription className="text-sm text-stone">{data?.summary}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6 py-6">
          {isPending ? (
            <>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-36 w-full" />
            </>
          ) : error ? (
            <p className="text-sm text-stone">Couldn't load this document from the agent API.</p>
          ) : (
            data.sections.map((s) => {
              const cited =
                !!source?.heading && s.heading.toLowerCase() === source.heading.toLowerCase();
              return (
                <section
                  key={s.heading}
                  ref={cited ? citedRef : undefined}
                  className={cn(
                    "rounded-2xl border p-5 transition-shadow",
                    cited
                      ? "border-nova/50 bg-white shadow-[0_0_0_4px_var(--nova-soft)]"
                      : "border-line bg-white/60",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="font-display text-[17px] font-semibold tracking-tight text-ink">
                      {s.heading}
                    </h3>
                    {cited ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-nova px-2 py-0.5 text-[11px] font-semibold text-white">
                        <Spark className="size-2.5" /> Cited
                      </span>
                    ) : null}
                  </div>
                  <Markdown source={s.text} />
                </section>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
