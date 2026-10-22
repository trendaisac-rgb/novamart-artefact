import { Link, useRouterState } from "@tanstack/react-router";
import { Gauge, Inbox, Menu, MessageSquareText, Palette, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AgentStatus } from "./AgentStatus";
import { Logo } from "./brand";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Store floor", sub: "Ask Nova", icon: MessageSquareText },
  { to: "/ops", label: "Ops console", sub: "Knowledge gaps", icon: Inbox },
  { to: "/quality", label: "Quality", sub: "Eval results", icon: Gauge },
  { to: "/brand", label: "Brand", sub: "Identity system", icon: Palette },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, sub, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
              active ? "bg-ink-2 text-paper" : "text-mist hover:bg-ink-2/60 hover:text-paper",
            )}
          >
            {active ? (
              <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-nova" />
            ) : null}
            <Icon
              className={cn(
                "size-[18px] shrink-0",
                active ? "text-nova" : "text-mist group-hover:text-paper",
              )}
            />
            <span className="flex flex-col leading-tight">
              <span className="text-[14px] font-semibold">{label}</span>
              <span className="text-[11.5px] text-mist/80">{sub}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-8 px-4 py-6">
      <div className="px-2">
        <Logo reversed className="h-[30px]" />
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ink-3 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.12em] text-mist uppercase">
          <span className="size-1.5 rounded-full bg-nova" /> Assist · Internal
        </p>
      </div>
      <NavLinks {...(onNavigate ? { onNavigate } : {})} />
      <div className="mt-auto space-y-3">
        <AgentStatus />
        <p className="px-2 text-[11px] leading-relaxed text-mist/70">
          Prototype for NovaMart store teams. Answers come only from NovaMart documentation and live
          order data.
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setOpen(false), [path]);

  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] bg-ink lg:block">
        <SidebarBody />
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-3 bg-ink px-4 py-3 lg:hidden">
        <Logo reversed className="h-6" />
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md p-1.5 text-paper hover:bg-ink-2"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open ? (
        <div className="fixed inset-x-0 top-[53px] bottom-0 z-30 bg-ink lg:hidden">
          <SidebarBody onNavigate={() => setOpen(false)} />
        </div>
      ) : null}

      <main className="lg:pl-[272px]">{children}</main>
    </div>
  );
}
