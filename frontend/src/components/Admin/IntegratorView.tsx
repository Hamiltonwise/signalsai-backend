/**
 * IntegratorView -- Jo's HQ.
 *
 * COO view: everything running, nothing blocked.
 * Bezos: single-threaded ownership. Jo owns the operation.
 * Musk: if it's not broken, it doesn't need Jo's attention.
 *
 * Four zones:
 * 1. Operations Status (all green or what needs attention)
 * 2. Client Pipeline (onboarding stages, who's stuck)
 * 3. Team Workload (Corey, Dave, agents -- who has open items)
 * 4. Blockers (anything that stops forward movement)
 */

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Zap,
  ArrowRight,
} from "lucide-react";
import { adminListOrganizations, type AdminOrganization } from "@/api/admin-organizations";
import { apiGet } from "@/api/index";
import ChangelogCard from "./ChangelogCard";

interface ClientHealth {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  risk?: string;
}

interface DreamTeamTask {
  id: number;
  title: string;
  owner: string;
  status: string;
  priority: string;
  due_date?: string;
}

export default function IntegratorView() {
  const { data } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const { data: healthData } = useQuery({
    queryKey: ["admin-client-health"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success ? (res.clients as ClientHealth[]) : [];
    },
    staleTime: 60_000,
  });

  const { data: tasksData } = useQuery({
    queryKey: ["dream-team-tasks-all"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/dream-team/tasks" });
      return res?.success ? (res.tasks as DreamTeamTask[]) : [];
    },
    staleTime: 60_000,
  });

  const orgs: AdminOrganization[] =
    (data as any)?.organizations ?? (Array.isArray(data) ? data : []);

  const health = healthData || [];
  const redCount = health.filter((c) => c.health === "red").length;
  const amberCount = health.filter((c) => c.health === "amber").length;
  const greenCount = health.filter((c) => c.health === "green").length;

  const tasks = tasksData || [];
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "completed");
  const coreyTasks = openTasks.filter((t) => t.owner?.toLowerCase().includes("corey"));
  const daveTasks = openTasks.filter((t) => t.owner?.toLowerCase().includes("dave"));
  const urgentTasks = openTasks.filter((t) => t.priority === "urgent" || t.priority === "high");

  // Pipeline: categorize orgs by onboarding stage
  const withGBP = orgs.filter((o: any) => o.gbp_access_token || o.google_connected);
  const withPMS = orgs.filter((o: any) => o.pms_uploaded || o.has_pms_data);
  const newSignups = orgs.filter((o) => {
    const age = (Date.now() - new Date(o.created_at).getTime()) / 86_400_000;
    return age <= 7;
  });

  const opsStatus = redCount === 0 && urgentTasks.length === 0;

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Zone 1: Operations Status -- ONE answer */}
      <div className={`rounded-2xl p-5 ${opsStatus ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
        <div className="flex items-center gap-3">
          {opsStatus ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
          )}
          <div>
            <p className={`text-lg font-bold ${opsStatus ? "text-emerald-700" : "text-amber-700"}`}>
              {opsStatus
                ? "Operations clear. Nothing blocked."
                : `${redCount} client${redCount !== 1 ? "s" : ""} need attention. ${urgentTasks.length} urgent task${urgentTasks.length !== 1 ? "s" : ""}.`}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {orgs.length} total accounts. {greenCount} green, {amberCount} amber, {redCount} red.
            </p>
          </div>
        </div>
      </div>

      {/* Zone 2: Client Pipeline */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-blue-500" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Onboarding Pipeline</p>
        </div>
        <div className="space-y-2">
          <PipelineRow label="Signed up (last 7 days)" count={newSignups.length} color="blue" />
          <PipelineRow label="Google connected" count={withGBP.length} total={orgs.length} color="emerald" />
          <PipelineRow label="Data uploaded" count={withPMS.length} total={orgs.length} color="purple" />
        </div>

        {/* Stuck accounts (signed up > 7 days, no GBP) */}
        {(() => {
          const stuck = orgs.filter((o: any) => {
            const age = (Date.now() - new Date(o.created_at).getTime()) / 86_400_000;
            return age > 7 && !o.gbp_access_token && !o.google_connected;
          });
          if (stuck.length === 0) return null;
          return (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2">
                Stuck ({stuck.length})
              </p>
              {stuck.slice(0, 3).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm py-1">
                  <span className="text-[#212D40] font-medium">{o.name}</span>
                  <span className="text-xs text-amber-500">No GBP after {Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86_400_000)}d</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Zone 3: Team Workload */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-[#D56753]" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Team Load</p>
        </div>
        <div className="space-y-2">
          <WorkloadRow name="Corey" count={coreyTasks.length} urgent={coreyTasks.filter((t) => t.priority === "urgent").length} />
          <WorkloadRow name="Dave" count={daveTasks.length} urgent={daveTasks.filter((t) => t.priority === "urgent").length} />
          <WorkloadRow name="Agents" count={42} label="registered" status="green" />
        </div>

        {/* Urgent tasks detail */}
        {urgentTasks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Urgent</p>
            {urgentTasks.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-start gap-2 text-sm">
                <ArrowRight className="h-3 w-3 text-red-500 mt-1 shrink-0" />
                <div>
                  <span className="text-[#212D40] font-medium">{t.title}</span>
                  <span className="text-xs text-gray-400 ml-2">{t.owner}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zone 3.5: Changelog -- what changed in sandbox, pending production */}
      <ChangelogCard />

      {/* Zone 4: Blockers */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Blockers</p>
        <div className="space-y-2 text-sm">
          <BlockerRow
            label="EC2 Pipeline"
            status={false}
            detail="Dave: merge sandbox to main, verify PM2"
          />
          <BlockerRow
            label="Mailgun"
            status={false}
            detail="Monday emails, trial sequence, review auto-draft all dormant"
          />
          <BlockerRow
            label="Sentry"
            status={false}
            detail="SENTRY_DSN not set on EC2"
          />
          <BlockerRow
            label="TypeScript"
            status={true}
            detail="Clean. Zero errors."
          />
          <BlockerRow
            label="Smoke Test"
            status={true}
            detail="5/6 passing"
          />
        </div>
      </div>
    </div>
  );
}

function PipelineRow({ label, count, total, color }: { label: string; count: number; total?: number; color: string }) {
  const colorMap: Record<string, string> = { blue: "bg-blue-500", emerald: "bg-emerald-500", purple: "bg-purple-500" };
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${colorMap[color] || "bg-gray-400"}`} />
        <span className="text-sm font-semibold text-[#212D40]">{count}{total ? ` / ${total}` : ""}</span>
      </div>
    </div>
  );
}

function WorkloadRow({ name, count, urgent, label, status }: { name: string; count: number; urgent?: number; label?: string; status?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-[#212D40]">{name}</span>
      <div className="flex items-center gap-2">
        {urgent && urgent > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">{urgent} urgent</span>}
        <span className={`text-sm font-semibold ${status === "green" ? "text-emerald-600" : "text-[#212D40]"}`}>
          {count} {label || "open"}
        </span>
      </div>
    </div>
  );
}

function BlockerRow({ label, status, detail }: { label: string; status: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      {status ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
      ) : (
        <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      )}
      <div>
        <span className="font-medium text-[#212D40]">{label}</span>
        <p className="text-xs text-gray-400">{detail}</p>
      </div>
    </div>
  );
}
