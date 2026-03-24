/**
 * IntegratorView -- Dave's HQ view.
 *
 * Client health grid (RED first), sprint status from dream_team_tasks,
 * phone-optimized (480px primary). One action per row.
 */

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, MessageSquare } from "lucide-react";
import { apiGet } from "@/api/index";

interface ClientHealth {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  risk?: string;
  last_login?: string;
  open_items?: number;
  recommended_action?: string;
}

interface DreamTeamTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
}

const DOT_COLOR: Record<string, string> = {
  red: "bg-red-500",
  amber: "bg-amber-400",
  green: "bg-emerald-500",
};

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function IntegratorView() {
  const { data: healthData, isLoading } = useQuery({
    queryKey: ["admin-client-health"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success ? (res.clients as ClientHealth[]) : [];
    },
    staleTime: 60_000,
  });

  const { data: tasks } = useQuery({
    queryKey: ["dave-tasks"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/dream-team/tasks" });
      const all = res?.success ? (res.tasks as DreamTeamTask[]) : [];
      return all.filter((t: any) => t.owner_name === "Dave" && t.status !== "done");
    },
    staleTime: 60_000,
  });

  const clients = [...(healthData || [])].sort((a, b) => {
    const order = { red: 0, amber: 1, green: 2 };
    return (order[a.health] ?? 2) - (order[b.health] ?? 2);
  });

  return (
    <div className="max-w-[480px] mx-auto space-y-6">
      {/* Sprint status */}
      <div className="bg-[#212D40] rounded-2xl p-5 text-white">
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Dave's Sprint</p>
        <p className="text-2xl font-black">{tasks?.length || 0} open</p>
        <p className="text-xs text-white/50 mt-1">
          {tasks?.filter((t) => t.priority === "urgent" || t.priority === "high").length || 0} high priority
        </p>
      </div>

      {/* Client health grid */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Client Health</p>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
        )}

        {clients.map((c) => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full shrink-0 ${DOT_COLOR[c.health] || DOT_COLOR.green}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#212D40] truncate">{c.name}</p>
                  <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(c.last_login)}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-500 truncate">
                    {c.recommended_action || (c.open_items ? `${c.open_items} open items` : "On track")}
                  </p>
                  {c.health === "red" && (
                    <button className="shrink-0 ml-2 p-1 text-red-400 hover:text-red-600 transition-colors" title="Flag">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && clients.length === 0 && (
          <div className="text-center text-gray-400 py-6">
            <p className="text-sm">No client health data available.</p>
            <p className="text-xs mt-1">Endpoint: /api/admin/client-health</p>
          </div>
        )}
      </div>

      {/* Dave's open tasks */}
      {tasks && tasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Open Tasks</p>
          {tasks.slice(0, 5).map((t) => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
              {t.status === "in_progress" ? (
                <Clock className="h-4 w-4 text-amber-500 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-gray-300 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[#212D40] truncate">{t.title}</p>
                {t.due_date && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Due: {t.due_date}</p>
                )}
              </div>
              <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                t.priority === "urgent" ? "bg-red-50 text-red-600" :
                t.priority === "high" ? "bg-amber-50 text-amber-600" :
                "bg-gray-50 text-gray-400"
              }`}>
                {t.priority}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
