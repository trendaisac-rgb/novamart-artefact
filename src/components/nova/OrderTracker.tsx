import { Check, Package, Truck } from "lucide-react";

import type { Order } from "@/lib/api";
import { cn } from "@/lib/utils";

const STEPS = ["Ordered", "Processing", "In transit", "Delivered"];

function stepIndex(status: string) {
  const s = status.toLowerCase();
  if (s.includes("deliver") || s.includes("return")) return 3;
  if (s.includes("transit") || s.includes("ship") || s.includes("delay")) return 2;
  if (s.includes("process")) return 1;
  return 0;
}

function fmtDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Renders the live order lookup the agent made, so the employee sees the data, not just the summary. */
export function OrderTracker({ order }: { order: Order }) {
  if (!order.found) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-sand/50 px-4 py-3 text-sm text-stone">
        <Package className="size-4" />
        Order <span className="font-mono font-medium text-ink">{order.order_id}</span> was not found
        in the order system.
      </div>
    );
  }
  const status = order.status ?? "Unknown";
  const cancelled = status.toLowerCase().includes("cancel");
  const delayed = status.toLowerCase().includes("delay");
  const current = stepIndex(status);
  const item = order.items?.[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sand/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-paper">
            <Package className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="font-mono text-[13px] font-semibold text-ink">{order.order_id}</p>
            <p className="text-xs text-stone">
              {order.customer_name} · {item?.description}
              {order.items && order.items.length > 1 ? ` +${order.items.length - 1}` : ""}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            cancelled
              ? "bg-declined-soft text-declined"
              : delayed
                ? "bg-escalated-soft text-escalated"
                : current === 3
                  ? "bg-answered-soft text-answered"
                  : "bg-needs-soft text-needs",
          )}
        >
          {status}
        </span>
      </div>

      <div className="px-4 pt-4 pb-3">
        <ol className={cn("grid grid-cols-4 gap-2", cancelled && "opacity-40 grayscale")}>
          {STEPS.map((label, i) => {
            const done = i < current || (i === current && current === 3);
            const active = i === current && current !== 3;
            return (
              <li key={label} className="flex flex-col gap-2">
                <div
                  className={cn(
                    "h-1.5 rounded-full",
                    done ? "bg-ink" : active ? (delayed ? "bg-escalated" : "bg-nova") : "bg-line",
                  )}
                />
                <span className="flex items-center gap-1 text-[11.5px] font-medium text-stone">
                  {done ? <Check className="size-3 text-ink" /> : null}
                  {active && !cancelled ? <Truck className="size-3 text-ink" /> : null}
                  <span className={cn(done || active ? "text-ink" : "")}>{label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-stone">Carrier</dt>
          <dd className="font-medium text-ink">{order.carrier ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-stone">Tracking</dt>
          <dd className="truncate font-mono text-ink">{order.tracking_number ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-stone">{delayed ? "New estimate" : "Estimate"}</dt>
          <dd className="font-medium text-ink">{fmtDate(order.estimated_delivery) ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-stone">Total</dt>
          <dd className="font-medium text-ink">
            {order.total != null ? `$${order.total.toFixed(2)}` : "—"}
          </dd>
        </div>
        {order.last_event ? (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-stone">Last event</dt>
            <dd className="text-ink">{order.last_event}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
