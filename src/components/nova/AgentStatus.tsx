import { useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHealth } from "@/hooks/use-agent";
import { DEFAULT_API_URL, getApiUrl, setApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Sidebar card: is the Python agent reachable, which model, how much documentation. */
export function AgentStatus() {
  const health = useHealth();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(DEFAULT_API_URL);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setUrl(getApiUrl());
  }, [open]);

  const online = health.isSuccess;
  const ready = online && health.data.agent_ready;
  const tone = ready ? "bg-answered" : online ? "bg-flare" : "bg-nova";
  const title = ready ? "Agent online" : online ? "API up, agent not ready" : "Agent offline";
  const detail = ready
    ? `${health.data.model} · ${health.data.documents} docs · ${health.data.sections} sections`
    : online
      ? (health.data.reason ?? "Check agent/.env")
      : "Start it with  make api";

  return (
    <div className="rounded-xl border border-sidebar-border bg-ink-2/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
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
            {health.isPending ? getApiUrl() : detail}
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              className="rounded-md p-1 text-mist transition-colors hover:bg-ink-3 hover:text-paper"
              aria-label="Agent API settings"
            >
              <Settings2 className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-80">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setApiUrl(url);
                queryClient.invalidateQueries();
                setOpen(false);
              }}
            >
              <div>
                <p className="text-sm font-semibold">Agent API</p>
                <p className="text-xs text-muted-foreground">
                  Where the Python agent runs. Default {DEFAULT_API_URL}.
                </p>
              </div>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setUrl(DEFAULT_API_URL)}
                >
                  Reset
                </Button>
                <Button type="submit" size="sm">
                  Save
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
