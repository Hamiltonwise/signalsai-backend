/**
 * VisionaryView -- Corey's HQ view.
 *
 * MRR, AAE countdown, unicorn confidence, pipeline, exceptions only.
 * Clean 4-card layout. No agent management. No build queue.
 */

import { useQuery } from "@tanstack/react-query";
import { DollarSign, Calendar, Target, AlertTriangle } from "lucide-react";
import { adminListOrganizations, type AdminOrganization } from "@/api/admin-organizations";
import { apiGet } from "@/api/index";

const AAE_DATE = new Date("2026-04-15");

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

interface ClientHealth {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  risk?: string;
}

export default function VisionaryView() {
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

  const orgs: AdminOrganization[] =
    (data as any)?.organizations ?? (Array.isArray(data) ? data : []);

  const activeOrgs = orgs.filter((o) => o.subscription_status === "active" || o.subscription_tier);
  const trialOrgs = orgs.filter((o) => o.subscription_status === "trialing" || (!o.subscription_status && !o.subscription_tier));
  const mrr = activeOrgs.length * 2000;
  const d = daysUntil(AAE_DATE);
  const unicorn = Math.min(100, Math.round(activeOrgs.length * 10 + mrr / 100));

  const redClients = (healthData || []).filter((c) => c.health === "red");
  const mostRecentTrial = trialOrgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return (
    <div className="space-y-6">
      {/* Top 4 cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
          <DollarSign className="h-5 w-5 text-emerald-500 mx-auto mb-2" />
          <p className="text-3xl font-black text-[#212D40]">${mrr.toLocaleString()}</p>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">MRR</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{activeOrgs.length} paying</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
          <Calendar className="h-5 w-5 text-[#D56753] mx-auto mb-2" />
          <p className={`text-3xl font-black ${d <= 7 ? "text-red-500" : d <= 21 ? "text-amber-500" : "text-[#212D40]"}`}>{d}</p>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Days to AAE</p>
          <p className="text-[11px] text-gray-400 mt-0.5">April 15, 2026</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
          <Target className="h-5 w-5 text-blue-500 mx-auto mb-2" />
          <p className={`text-3xl font-black ${unicorn >= 50 ? "text-emerald-600" : "text-amber-500"}`}>{unicorn}</p>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Unicorn Score</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Confidence index</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
          <p className="text-3xl font-black text-[#212D40]">{trialOrgs.length}</p>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Trial</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{activeOrgs.length} paying</p>
          {mostRecentTrial && (
            <p className="text-[10px] text-[#D56753] mt-1 truncate">
              Latest: {mostRecentTrial.name}
            </p>
          )}
        </div>
      </div>

      {/* Exceptions -- RED clients only */}
      {redClients.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-xs font-bold uppercase tracking-wider text-red-500">Exceptions</p>
          </div>
          {redClients.map((c) => (
            <div key={c.id} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#212D40]">{c.name}</p>
                <p className="text-xs text-red-600 mt-0.5">{c.risk || "Needs attention"}</p>
              </div>
              <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {redClients.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-sm font-medium text-emerald-700">All clients healthy. No exceptions.</p>
        </div>
      )}
    </div>
  );
}
