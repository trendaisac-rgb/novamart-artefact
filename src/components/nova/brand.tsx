import type { SVGProps } from "react";

import type { Status } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Four point star with concave sides, same geometry as the logo files in /public/brand. */
function sparkPath(cx: number, cy: number, r: number, a = 0.13, b = 0.2) {
  const A = a * r;
  const B = b * r;
  return [
    `M${cx} ${cy - r}`,
    `C${cx + A} ${cy - B} ${cx + B} ${cy - A} ${cx + r} ${cy}`,
    `C${cx + B} ${cy + A} ${cx + A} ${cy + B} ${cx} ${cy + r}`,
    `C${cx - A} ${cy + B} ${cx - B} ${cy + A} ${cx - r} ${cy}`,
    `C${cx - B} ${cy - A} ${cx - A} ${cy - B} ${cx} ${cy - r}Z`,
  ].join("");
}

const SPARK_24 = sparkPath(12, 12, 11.5);

export function Spark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-4", className)} {...props}>
      <path d={SPARK_24} fill="currentColor" />
    </svg>
  );
}

/** Loader: the spark turning. Used wherever the agent is working. */
export function SparkLoader({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-5 items-center justify-center", className)}>
      <Spark className="animate-spark-turn absolute size-full text-nova" />
    </span>
  );
}

export function Logo({ reversed = false, className }: { reversed?: boolean; className?: string }) {
  return (
    <img
      src={reversed ? "/brand/novamart-logo-reversed.svg" : "/brand/novamart-logo.svg"}
      alt="NovaMart"
      className={cn("h-7 w-auto", className)}
      draggable={false}
    />
  );
}

export const STATUS_META: Record<
  Status,
  {
    label: string;
    short: string;
    text: string;
    bg: string;
    ring: string;
    dot: string;
    hint: string;
  }
> = {
  answered: {
    label: "Answered",
    short: "Answered",
    text: "text-answered",
    bg: "bg-answered-soft",
    ring: "ring-answered/25",
    dot: "bg-answered",
    hint: "Grounded in a cited policy section or live order data.",
  },
  declined: {
    label: "Not covered",
    short: "Not covered",
    text: "text-declined",
    bg: "bg-declined-soft",
    ring: "ring-declined/25",
    dot: "bg-declined",
    hint: "The documentation doesn't cover this. Logged for Ops, nothing invented.",
  },
  escalated: {
    label: "Escalated to Ops",
    short: "Escalated",
    text: "text-escalated",
    bg: "bg-escalated-soft",
    ring: "ring-escalated/30",
    dot: "bg-escalated",
    hint: "The policy needs a human decision. A ticket was opened.",
  },
  needs_info: {
    label: "Needs one detail",
    short: "Needs info",
    text: "text-needs",
    bg: "bg-needs-soft",
    ring: "ring-needs/25",
    dot: "bg-needs",
    hint: "One missing detail, such as the order number.",
  },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span
      title={m.hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-tight ring-1 ring-inset",
        m.text,
        m.bg,
        m.ring,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function humanizeDocId(docId: string) {
  return docId
    .split("_")
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-nova uppercase">
          <Spark className="size-3" />
          {eyebrow}
        </p>
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-[-0.02em] text-ink md:text-[2.6rem]">
          {title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-stone">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
