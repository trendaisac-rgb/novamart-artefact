import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";

import { PageHeader, Spark, STATUS_META, StatusBadge } from "@/components/nova/brand";
import type { Status } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/brand")({
  head: () => ({ meta: [{ title: "Brand · NovaMart" }] }),
  component: Brand,
});

const COLORS = [
  { name: "Ink", hex: "#12142B", role: "Type, dark surfaces, the N", cls: "bg-ink text-paper" },
  { name: "Nova", hex: "#FF5B35", role: "The spark, primary actions", cls: "bg-nova text-white" },
  {
    name: "Flare",
    hex: "#FFC23D",
    role: "Highlights on dark, small doses",
    cls: "bg-flare text-ink",
  },
  {
    name: "Paper",
    hex: "#FBF8F3",
    role: "Background, warm not white",
    cls: "bg-paper text-ink border border-line",
  },
  { name: "Sand", hex: "#F3EEE6", role: "Quiet surfaces, callouts", cls: "bg-sand text-ink" },
  { name: "Stone", hex: "#77736A", role: "Secondary text", cls: "bg-stone text-white" },
];

const LOGOS = [
  { file: "novamart-logo.svg", label: "Primary lockup", bg: "bg-paper", img: "h-12" },
  { file: "novamart-logo-reversed.svg", label: "Reversed", bg: "bg-ink", img: "h-12" },
  { file: "novamart-app-icon.svg", label: "App icon", bg: "bg-sand", img: "h-20" },
  { file: "novamart-mark.svg", label: "Mark", bg: "bg-white", img: "h-20" },
];

const VOICE = [
  [
    "Answer first.",
    "The employee is in front of a customer. Lead with the yes, the no, or the number.",
  ],
  ["Then the next step.", "One action they can take right now, not a paragraph of policy."],
  ["Then the source.", "Every claim can be traced to a section. Trust is shown, not asked for."],
];

function Section({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 border-t border-line py-12 lg:grid-cols-[220px_1fr]">
      <div>
        <p className="font-mono text-[11px] tracking-[0.14em] text-stone uppercase">{kicker}</p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Construction() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full">
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" fill="none" stroke="var(--line)" strokeWidth="0.4" />
        </pattern>
      </defs>
      <rect width="120" height="120" fill="url(#grid)" />
      <circle
        cx="80"
        cy="29"
        r="23"
        fill="none"
        stroke="var(--nova)"
        strokeWidth="0.5"
        strokeDasharray="2 2"
      />
      <line
        x1="28"
        y1="0"
        x2="28"
        y2="120"
        stroke="var(--stone)"
        strokeWidth="0.4"
        strokeDasharray="2 2"
      />
      <line
        x1="80"
        y1="0"
        x2="80"
        y2="120"
        stroke="var(--stone)"
        strokeWidth="0.4"
        strokeDasharray="2 2"
      />
      <line
        x1="0"
        y1="94"
        x2="120"
        y2="94"
        stroke="var(--stone)"
        strokeWidth="0.4"
        strokeDasharray="2 2"
      />
      <path
        d="M28 94V30L80 94V70"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="19"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.92"
      />
      <path
        d="M80 6C82.99 24.4 84.6 26.01 103 29C84.6 31.99 82.99 33.6 80 52C77.01 33.6 75.4 31.99 57 29C75.4 26.01 77.01 24.4 80 6Z"
        fill="var(--nova)"
      />
    </svg>
  );
}

function Brand() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <PageHeader
        eyebrow="Identity system 1.0"
        title="One spark, everywhere"
        description="A retail brand built around one idea: the spark of finding the right thing. It shows up in the logo, in the loader, and in the way the assistant answers."
      />

      <div className="relative mt-10 overflow-hidden rounded-[2rem] bg-ink px-8 py-16 md:px-14 md:py-24">
        <Spark className="animate-spark-glow pointer-events-none absolute -top-16 -right-10 size-[22rem] text-ink-2" />
        <Spark className="pointer-events-none absolute right-40 bottom-10 size-10 text-nova/70" />
        <img
          src="/brand/novamart-logo-reversed.svg"
          alt="NovaMart"
          className="relative h-16 w-auto md:h-24"
        />
        <p className="relative mt-10 font-display text-[2rem] leading-tight font-bold tracking-tight text-paper md:text-[3rem]">
          Everyday, <span className="text-flare">brighter.</span>
        </p>
      </div>

      <Section kicker="01 · Concept" title="The spark">
        <div className="grid gap-6 md:grid-cols-[280px_1fr] md:items-center">
          <div className="aspect-square rounded-3xl border border-line bg-white p-6">
            <Construction />
          </div>
          <div className="space-y-4 text-[15px] leading-relaxed text-ink/80">
            <p>
              The mark is an N drawn in one continuous stroke. Where the last stem should rise, it
              stops, and the corner bursts into a four point spark. That is the brand promise in one
              shape: the moment something good shows up.
            </p>
            <p>
              Round caps and a single stroke weight keep it friendly at 16 pixels and confident on a
              storefront. The spark is the only element that changes color. It is also the product's
              loader, so the brand is literally what you see while Nova thinks.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-ink">
                <Spark className="animate-spark-turn size-6 text-nova" />
              </span>
              <span className="text-sm text-stone">The spark as loader</span>
            </div>
          </div>
        </div>
      </Section>

      <Section kicker="02 · Logo" title="Logo suite">
        <div className="grid gap-4 sm:grid-cols-2">
          {LOGOS.map((l) => (
            <figure
              key={l.file}
              className="overflow-hidden rounded-3xl border border-line bg-white"
            >
              <div className={cn("flex h-44 items-center justify-center", l.bg)}>
                <img src={`/brand/${l.file}`} alt={l.label} className={cn("w-auto", l.img)} />
              </div>
              <figcaption className="flex items-center justify-between px-4 py-3 text-[13px]">
                <span className="font-medium text-ink">{l.label}</span>
                <a
                  href={`/brand/${l.file}`}
                  download
                  className="inline-flex items-center gap-1.5 text-stone transition-colors hover:text-nova"
                >
                  <Download className="size-3.5" /> SVG
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-6 grid gap-4 text-[13.5px] text-ink/80 sm:grid-cols-3">
          <p>
            <span className="font-semibold text-ink">Clear space.</span> Keep the height of the
            spark free on every side.
          </p>
          <p>
            <span className="font-semibold text-ink">Minimum size.</span> Lockup 96 px wide. App
            icon down to 16 px.
          </p>
          <p>
            <span className="font-semibold text-ink">Never.</span> Recolor the N, stretch it, or put
            the spark on Nova.
          </p>
        </div>
      </Section>

      <Section kicker="03 · Color" title="Palette">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {COLORS.map((c) => (
            <div
              key={c.name}
              className={cn("flex h-40 flex-col justify-between rounded-3xl p-5", c.cls)}
            >
              <span className="font-display text-xl font-bold">{c.name}</span>
              <span>
                <span className="block font-mono text-[13px]">{c.hex}</span>
                <span className="block text-[12px] opacity-75">{c.role}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13.5px] text-stone">
          Ratio on a typical screen: about 70% Paper, 20% Ink, 10% Nova. Flare only on dark
          backgrounds.
        </p>
      </Section>

      <Section kicker="04 · Type" title="Typography">
        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-white p-6">
            <p className="font-mono text-[11px] text-stone uppercase">
              Display · Bricolage Grotesque 700–800
            </p>
            <p className="mt-2 font-display text-5xl font-extrabold tracking-[-0.03em] text-ink">
              Find it. Love it.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-line bg-white p-6">
              <p className="font-mono text-[11px] text-stone uppercase">Text · Geist 400–600</p>
              <p className="mt-2 text-[17px] leading-relaxed text-ink">
                Electronics can be returned within 15 days. Purchases made between November 1 and
                December 24 can be returned until January 15.
              </p>
            </div>
            <div className="rounded-3xl border border-line bg-white p-6">
              <p className="font-mono text-[11px] text-stone uppercase">
                Data · Geist Mono 400–500
              </p>
              <p className="mt-2 font-mono text-[15px] leading-relaxed text-ink">
                NM-1003 · Delayed
                <br />
                OPS-4F2A91 · 2 hours
                <br />
                price_match › Who we match
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section kicker="05 · System" title="Status colors">
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(STATUS_META) as Status[]).map((s) => (
            <div key={s} className="rounded-2xl border border-line bg-white p-4">
              <StatusBadge status={s} />
              <p className="mt-2 text-[13.5px] text-stone">{STATUS_META[s].hint}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink/80">
          “Not covered” is slate, not red. A decline is the assistant doing its job, refusing to
          guess. Red is reserved for real errors.
        </p>
      </Section>

      <Section kicker="06 · Voice" title="How Nova talks">
        <div className="grid gap-3 md:grid-cols-3">
          {VOICE.map(([t, d], i) => (
            <div key={t} className="rounded-3xl bg-sand/70 p-6">
              <p className="font-mono text-xs text-nova">0{i + 1}</p>
              <p className="mt-3 font-display text-xl font-bold tracking-tight text-ink">{t}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-stone">{d}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
