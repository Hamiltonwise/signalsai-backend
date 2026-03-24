/**
 * Integrator View — Jo's HQ
 *
 * Panel 1: All clients with health dots, last login, open items
 * Panel 2: Active risks and open CS actions
 * Panel 3: Sprint status (Dave's task list)
 * Panel 4: Agent outputs awaiting review
 *
 * Phone-optimized. 4-minute check-in from anywhere.
 */

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users,
  AlertTriangle,
  CheckSquare,
  Activity,
  ChevronRight,
} from "lucide-react";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
import { fetchSchedules, type Schedule } from "@/api/schedules";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function healthDot(org: AdminOrganization): { color: string; label: string } {
  if (org.connections?.gbp) return { color: "bg-emerald-500", label: "Connected" };
  return { color: "bg-amber-400", label: "Needs setup" };
}

export default function IntegratorView() {
  const navigate = useNavigate();

  const { data: orgData } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const { data: scheduleData } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: fetchSchedules,
  });

  const orgs: AdminOrganization[] =
    (orgData as any)?.organizations ?? (Array.isArray(orgData) ? orgData : []);
  const schedules: Schedule[] = Array.isArray(scheduleData) ? scheduleData : [];

  const riskyOrgs = orgs.filter((o) => !o.connections?.gbp);
  const failedAgents = schedules.filter(
    (s) => s.latest_run?.status === "failed"
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      {/* Panel 1: All Clients */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-[#D56753]" />
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            All Clients ({orgs.length})
          </p>
        </div>
        {orgs.length === 0 ? (
          <p className="text-sm text-gray-400">No accounts yet.</p>
        ) : (
          <div className="space-y-2">
            {orgs.map((org) => {
              const dot = healthDot(org);
              return (
                <button
                  key={org.id}
                  onClick={() => navigate(`/admin/organizations/${org.id}`)}
                  className="w-full flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot.color}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#212D40] truncate">
                        {org.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {org.userCount} user{org.userCount !== 1 ? "s" : ""} &middot;{" "}
                        {org.subscription_tier || "No tier"} &middot;{" "}
                        Created {timeAgo(org.created_at)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Panel 2: Active Risks */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Active Risks
          </p>
        </div>
        {riskyOrgs.length === 0 && failedAgents.length === 0 ? (
          <p className="text-sm text-emerald-600 font-medium">No open risks. All clear.</p>
        ) : (
          <div className="space-y-2">
            {riskyOrgs.map((org) => (
              <div key={org.id} className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <p className="text-sm text-[#212D40]">
                  <span className="font-semibold">{org.name}</span> — GBP not connected
                </p>
              </div>
            ))}
            {failedAgents.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <p className="text-sm text-[#212D40]">
                  <span className="font-semibold">{s.display_name}</span> — last run failed
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel 3: Sprint Status */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckSquare className="h-5 w-5 text-blue-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Sprint Status
          </p>
        </div>
        <p className="text-sm text-gray-500">
          Build queue and sprint items visible at{" "}
          <button
            onClick={() => navigate("/admin/action-items")}
            className="text-[#D56753] font-medium hover:underline"
          >
            Morning Brief
          </button>.
          All pre-AAE work orders complete. Post-AAE items in queue.
        </p>
      </div>

      {/* Panel 4: Agent Outputs */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-[#D56753]" />
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Agent Queue
          </p>
        </div>
        {schedules.length === 0 ? (
          <p className="text-sm text-gray-400">No agents scheduled.</p>
        ) : (
          <div className="space-y-2">
            {schedules.slice(0, 6).map((s) => {
              const isOk = s.latest_run?.status === "completed";
              const isFailed = s.latest_run?.status === "failed";
              return (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isFailed ? "bg-amber-400" : isOk ? "bg-emerald-500" : "bg-gray-300"
                      }`}
                    />
                    <p className="text-sm text-[#212D40] font-medium truncate">
                      {s.display_name}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {s.last_run_at ? timeAgo(s.last_run_at) : "never"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
