/**
 * BuildView -- Dave's HQ.
 *
 * CTO view: infrastructure health, deployment status, what to do next.
 * Musk Step 4 (accelerate): show the critical path, remove ambiguity.
 * Bezos: two-pizza team, single-threaded ownership.
 *
 * Four zones:
 * 1. System Health (one answer: green or what's broken)
 * 2. Dave's Queue (open tasks, sorted by priority)
 * 3. Infrastructure Checklist (env vars, services, connections)
 * 4. Migrations
 */

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Server,
  Database,
  GitBranch,
} from "lucide-react";
import { apiGet } from "@/api/index";

interface DreamTeamTask {
  id: number;
  title: string;
  owner: string;
  status: string;
  priority: string;
  due_date?: string;
}

export default function BuildView() {
  const { data: healthData } = useQuery({
    queryKey: ["api-health"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/health");
        return res.ok ? await res.json() : null;
      } catch { return null; }
    },
    staleTime: 30_000,
  });

  const { data: tasksData } = useQuery({
    queryKey: ["dream-team-tasks-dave"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/dream-team/tasks?owner=dave" });
      return res?.success ? (res.tasks as DreamTeamTask[]) : [];
    },
    staleTime: 60_000,
  });

  const apiHealthy = healthData?.status === "ok";
  const tasks = (tasksData || []).filter((t) => t.status !== "done" && t.status !== "completed");
  const urgentTasks = tasks.filter((t) => t.priority === "urgent" || t.priority === "high");

  return (
    <div className="space-y-6 max-w-3xl">
      <div className={`rounded-2xl p-5 ${apiHealthy ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
        <div className="flex items-center gap-3">
          {apiHealthy ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />
          )}
          <div>
            <p className={`text-lg font-bold ${apiHealthy ? "text-emerald-700" : "text-red-700"}`}>
              {apiHealthy ? "Systems operational." : "API health check failed."}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {urgentTasks.length > 0
                ? `${urgentTasks.length} urgent task${urgentTasks.length !== 1 ? "s" : ""} in your queue.`
                : `${tasks.length} open task${tasks.length !== 1 ? "s" : ""}.`}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="h-4 w-4 text-[#D56753]" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Your Queue ({tasks.length})</p>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-emerald-600">Queue clear.</p>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, 10).map((t) => (
              <div key={t.id} className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  t.priority === "urgent" ? "bg-red-500" : t.priority === "high" ? "bg-amber-500" : "bg-gray-300"
                }`} />
                <p className="text-sm font-medium text-[#212D40] truncate flex-1">{t.title}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                  t.priority === "urgent" ? "bg-red-100 text-red-600" : t.priority === "high" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500"
                }`}>{t.priority || "normal"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-blue-500" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Infrastructure</p>
        </div>
        <div className="space-y-2 text-sm">
          <InfraRow label="API Server" ok={apiHealthy} detail={apiHealthy ? "Responding" : "Not responding"} />
          <InfraRow label="Database" ok={apiHealthy} detail={apiHealthy ? "Connected" : "Unknown"} />
          <InfraRow label="Redis / BullMQ" ok={null} detail="Verify: redis-cli ping on EC2" />
          <InfraRow label="Mailgun" ok={false} detail="ALLORO_EMAIL_SERVICE_WEBHOOK not set" />
          <InfraRow label="Sentry" ok={false} detail="SENTRY_DSN not set" />
          <InfraRow label="Anthropic API" ok={null} detail="ANTHROPIC_API_KEY needed for agents" />
          <InfraRow label="Lob Cards" ok={false} detail="LOB_API_KEY not set. Cards queuing." />
          <InfraRow label="Google Places" ok={null} detail="Rotate key (exposed Mar 23)" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-purple-500" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pending Migrations</p>
        </div>
        <p className="font-mono text-xs text-gray-600">npx knex migrate:latest</p>
        <p className="text-xs text-gray-400 mt-2">Run on EC2 after pulling latest. Includes: week1_win, checkup_invitations, champion fields.</p>
      </div>
    </div>
  );
}

function InfraRow({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok === true ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
        : ok === false ? <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        : <Clock className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />}
      <div>
        <span className="font-medium text-[#212D40]">{label}</span>
        <span className="text-xs text-gray-400 ml-2">{detail}</span>
      </div>
    </div>
  );
}
