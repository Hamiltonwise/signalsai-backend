/**
 * BuildView -- CC/Terminal view of HQ.
 *
 * Build state summary, env vars at risk, active work orders, Sentry placeholder.
 */

import { useQuery } from "@tanstack/react-query";
import { Terminal, AlertTriangle, CheckCircle2, Shield, ExternalLink } from "lucide-react";
import { apiGet } from "@/api/index";

interface DreamTeamTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  owner_name: string;
}

interface BuildEvent {
  id: string;
  event_type: string;
  properties: any;
  created_at: string;
}

const ENV_VARS = [
  { name: "GOOGLE_PLACES_API", desc: "Places autocomplete + competitor data", critical: true },
  { name: "ROUTES_API_KEY", desc: "Drive time competitor filtering", critical: false },
  { name: "TWILIO_ACCOUNT_SID", desc: "SMS review requests", critical: false },
  { name: "TWILIO_AUTH_TOKEN", desc: "SMS review requests", critical: false },
  { name: "SENTRY_DSN", desc: "Error monitoring", critical: false },
  { name: "ALLORO_N8N_WEBHOOK_URL", desc: "Monday email delivery", critical: true },
  { name: "MAILGUN_API_KEY", desc: "Email delivery", critical: true },
  { name: "MAILGUN_DOMAIN", desc: "Email delivery", critical: true },
];

export default function BuildView() {
  const { data: tasks } = useQuery({
    queryKey: ["dave-tasks-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/dream-team/tasks" });
      const all = res?.success ? (res.tasks as DreamTeamTask[]) : [];
      return all.filter((t: any) => t.owner_name === "Dave" && t.status !== "done");
    },
    staleTime: 60_000,
  });

  const { data: buildEvents } = useQuery({
    queryKey: ["build-events"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/behavioral-events?type=build&limit=10" });
      return res?.success ? (res.events as BuildEvent[]) : [];
    },
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      {/* Build state summary */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[#D56753]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[#D56753]">Build State</p>
        </div>

        {buildEvents && buildEvents.length > 0 ? (
          <div className="space-y-2">
            {buildEvents.map((e) => (
              <div key={e.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#212D40] truncate font-mono text-xs">
                    {e.properties?.file || e.event_type}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {e.properties?.status || "committed"} -- {new Date(e.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center text-gray-400">
            <p className="text-sm">No build events tracked yet.</p>
            <p className="text-xs mt-1">Events with type "build.*" will appear here.</p>
          </div>
        )}
      </div>

      {/* Env vars at risk */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-amber-500">Environment Variables</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {ENV_VARS.map((v, i) => (
            <div key={v.name} className={`px-4 py-3 flex items-center justify-between ${i > 0 ? "border-t border-gray-100" : ""}`}>
              <div className="min-w-0">
                <p className="text-xs font-mono text-[#212D40]">{v.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{v.desc}</p>
              </div>
              <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full shrink-0 ${
                v.critical ? "bg-red-50 text-red-500 border border-red-200" : "bg-amber-50 text-amber-600 border border-amber-200"
              }`}>
                Unconfirmed
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Active Work Orders (Dave's tasks) */}
      {tasks && tasks.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Active Work Orders (Dave)</p>
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  t.priority === "urgent" ? "bg-red-500" :
                  t.priority === "high" ? "bg-amber-400" : "bg-gray-300"
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#212D40] truncate">{t.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {t.status} {t.due_date ? `-- due ${t.due_date}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sentry placeholder */}
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-400">Sentry Error Monitoring</p>
        <p className="text-xs text-gray-300 mt-1">Connect SENTRY_DSN to activate.</p>
        <p className="text-[10px] text-gray-300 mt-0.5">Dave's task: add DSN to .env</p>
      </div>
    </div>
  );
}
