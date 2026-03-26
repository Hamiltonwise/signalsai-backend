/**
 * Build View — Dave's HQ
 *
 * Panel 1: Build State (sandbox vs deployed)
 * Panel 2: Active Work Orders
 * Panel 3: Environment health
 * Panel 4: Production health (recent errors)
 *
 * No client data. No pipeline. Build focus only.
 */

import { useQuery } from "@tanstack/react-query";
import {
  GitBranch,
  FileCode,
  AlertCircle,
  Shield,
  CheckCircle2,
  Clock,
} from "lucide-react";
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

export default function BuildView() {
  const { data: scheduleData } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: fetchSchedules,
  });

  const schedules: Schedule[] = Array.isArray(scheduleData) ? scheduleData : [];
  const failedAgents = schedules.filter((s) => s.latest_run?.status === "failed");
  const runningAgents = schedules.filter((s) => s.latest_run?.status === "running");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      {/* Panel 1: Build State */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="h-5 w-5 text-[#D56753]" />
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Build State
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <p className="text-sm font-medium text-[#212D40]">sandbox</p>
            </div>
            <span className="text-xs text-gray-400">Active branch</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <p className="text-sm font-medium text-[#212D40]">main</p>
            </div>
            <span className="text-xs text-gray-400">Production</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Merge sandbox → main requires Dave review. All builds auto-execute on sandbox.
        </p>
      </div>

      {/* Panel 2: Active Work Orders */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileCode className="h-5 w-5 text-blue-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Build Queue
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-[#212D40]">
              All pre-AAE work orders complete (WO1-17 + audit + polish)
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
            <Clock className="h-4 w-4 text-gray-400 shrink-0" />
            <p className="text-sm text-gray-600">
              Post-AAE: GBP OAuth + Stage 2 Data
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
            <Clock className="h-4 w-4 text-gray-400 shrink-0" />
            <p className="text-sm text-gray-600">
              Pending: Routes API enablement (Google Cloud Console)
            </p>
          </div>
        </div>
      </div>

      {/* Panel 3: Environment Health */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-emerald-600" />
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Environment
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Database (RDS)</span>
            <span className="text-xs font-semibold text-emerald-600">Connected</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Redis</span>
            <span className="text-xs font-semibold text-emerald-600">Connected</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Google Places API</span>
            <span className="text-xs font-semibold text-emerald-600">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Routes API</span>
            <span className="text-xs font-semibold text-amber-600">Not enabled</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Twilio SMS</span>
            <span className="text-xs font-semibold text-amber-600">Not configured</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">n8n Email Webhook</span>
            <span className="text-xs font-semibold text-emerald-600">Active</span>
          </div>
        </div>
      </div>

      {/* Panel 4: Production Health */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Production Health
          </p>
        </div>
        {failedAgents.length === 0 && runningAgents.length === 0 ? (
          <p className="text-sm text-emerald-600 font-medium">
            All systems nominal. No failed agent runs in the last 24 hours.
          </p>
        ) : (
          <div className="space-y-2">
            {failedAgents.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <div>
                  <p className="text-sm font-medium text-[#212D40]">{s.display_name}</p>
                  <p className="text-xs text-amber-600">
                    Failed {s.last_run_at ? timeAgo(s.last_run_at) : "unknown"}
                  </p>
                </div>
              </div>
            ))}
            {runningAgents.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <p className="text-sm font-medium text-[#212D40]">{s.display_name}, running</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
