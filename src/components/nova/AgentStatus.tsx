import { useHealth } from "@/hooks/use-agent";
import { cn } from "@/lib/utils";

/** Sidebar card: is the agent reachable, which model, how much documentation. */
export function AgentStatus() {
  const health = useHealth();

  const online = health.isSuccess;
  const ready = online && health.data.agent_ready;
  const tone = ready ? "bg-answered" : online ? "bg-flare" : "bg-nova";
  const title = ready ? "Agent online" : online ? "Agent not configured" : "Agent offline";
  const detail = ready
    ? `${health.data.model} · ${health.data.documents} docs · ${health.data.sections} sections`
    : online
      ? (health.data.reason ?? "Check the function secrets")
      : "Can't reach the Edge Function";

  return (
    <div className="rounded-xl border border-sidebar-border bg-ink-2/70 p-3">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-paper">
        <span className="relative flex size-2">
          {ready ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-answered opacity-60" />
          ) : null}
          <span className={cn("relative inline-flex size-2 rounded-full", tone)} />
        </span>
        {health.isPending ? "Connecting…" : title}
      </p>
      <p className="mt-1 truncate font-mono text-[11px] text-mist" title={detail}>
        {health.isPending ? "Supabase Edge Function" : detail}
      </p>
    </div>
  );
}
