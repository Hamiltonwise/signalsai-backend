/**
 * Visionary View — Corey's HQ
 *
 * Panel 1: MRR, runway, days to AAE, unicorn confidence
 * Panel 2: Exception-only client alerts (red dots only)
 * Panel 3: Pipeline
 * Panel 4: One action — what needs Corey's decision today
 *
 * Closes in 90 seconds. No agent management. No build queue.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  Calendar,
  Zap,
  TrendingUp,
} from "lucide-react";
import FounderMode from "./FounderMode";
import { useNavigate } from "react-router-dom";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";

const AAE_DATE = new Date("2026-04-14");

function daysUntilAAE(): number {
  return Math.max(0, Math.ceil((AAE_DATE.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export default function VisionaryView() {
  const navigate = useNavigate();
  const [founderOpen, setFounderOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const orgs: AdminOrganization[] =
    (data as any)?.organizations ?? (Array.isArray(data) ? data : []);

  const activeOrgs = orgs.filter(
    (o) => o.subscription_status === "active" || o.subscription_tier
  );
  const estimatedMRR = activeOrgs.length * 2000;

  // Exception-only: orgs without GBP or with issues
  const exceptions = orgs.filter((o) => !o.connections?.gbp);

  return (
    <>
    {/* Founder Mode overlay */}
    {founderOpen && <FounderMode onClose={() => setFounderOpen(false)} />}

    {/* F badge — top right, no label */}
    <button
      onClick={() => setFounderOpen(true)}
      className="fixed top-4 right-4 z-40 w-8 h-8 rounded-lg bg-[#212D40] text-white text-xs font-black flex items-center justify-center hover:bg-[#D56753] transition-colors"
      title="Founder Mode"
    >
      F
    </button>

    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      {/* Panel 1: Key Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
          <DollarSign className="h-5 w-5 text-emerald-600 mx-auto mb-2" />
          <p className="text-2xl font-black text-[#212D40]">
            ${(estimatedMRR / 1000).toFixed(0)}k
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
            MRR
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
          <Calendar className="h-5 w-5 text-[#D56753] mx-auto mb-2" />
          <p className="text-2xl font-black text-[#212D40]">
            {daysUntilAAE()}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
            Days to AAE
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
          <TrendingUp className="h-5 w-5 text-blue-500 mx-auto mb-2" />
          <p className="text-2xl font-black text-[#212D40]">
            {orgs.length}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
            Accounts
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
          <Zap className="h-5 w-5 text-amber-500 mx-auto mb-2" />
          <p className="text-2xl font-black text-[#212D40]">
            {activeOrgs.length}/{orgs.length}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
            Active
          </p>
        </div>
      </div>

      {/* Panel 2: Exception-only alerts */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
          Exceptions Only
        </p>
        {exceptions.length === 0 ? (
          <p className="text-sm text-emerald-600 font-medium">
            All clear. No accounts need attention right now.
          </p>
        ) : (
          <div className="space-y-2">
            {exceptions.map((org) => (
              <button
                key={org.id}
                onClick={() => navigate(`/admin/organizations/${org.id}`)}
                className="w-full flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left hover:border-amber-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-sm font-semibold text-[#212D40]">
                    {org.name}
                  </span>
                </div>
                <span className="text-xs text-amber-600">Needs setup</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Panel 3: Pipeline */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
          Pipeline
        </p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-black text-[#212D40]">{orgs.length}</p>
            <p className="text-[10px] text-gray-400 uppercase font-bold mt-1">Total</p>
          </div>
          <div>
            <p className="text-xl font-black text-emerald-600">{activeOrgs.length}</p>
            <p className="text-[10px] text-gray-400 uppercase font-bold mt-1">Paying</p>
          </div>
          <div>
            <p className="text-xl font-black text-amber-600">{orgs.length - activeOrgs.length}</p>
            <p className="text-[10px] text-gray-400 uppercase font-bold mt-1">In funnel</p>
          </div>
        </div>
      </div>

      {/* Panel 4: One Action */}
      <div className="rounded-2xl border border-[#D56753]/20 bg-[#D56753]/[0.03] p-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-5 w-5 text-[#D56753]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[#D56753]">
            Needs Your Decision
          </p>
        </div>
        {exceptions.length > 0 ? (
          <>
            <p className="text-sm font-bold text-[#212D40]">
              {exceptions.map((o) => o.name || `Org #${o.id}`).join(" and ")} {exceptions.length === 1 ? "hasn't" : "haven't"} connected Google yet.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Push onboarding or defer?
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-[#212D40]">
              Nothing urgent. Focus on AAE prep.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              All accounts are connected and running. {daysUntilAAE()} days to conference.
            </p>
          </>
        )}
      </div>
    </div>
    </>
  );
}
