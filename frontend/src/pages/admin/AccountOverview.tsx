/**
 * Account Overview -- Multi-Location Admin View (Phase 2)
 *
 * Shows all accounts with their locations, user counts, health status.
 * Replaces the old organization list with account-level aggregation.
 */

import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, Users, Loader2, ChevronRight } from "lucide-react";
import { adminListOrganizations, type AdminOrganization } from "@/api/admin-organizations";

function healthDot(org: AdminOrganization): { color: string; label: string } {
  if (org.connections?.gbp) {
    return { color: "bg-emerald-500", label: "Connected" };
  }
  return { color: "bg-amber-400", label: "Needs setup" };
}

function specialtyIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("endodon")) return "\uD83E\uDDB7";
  if (lower.includes("orthodon")) return "\u2728";
  if (lower.includes("pediatric")) return "\uD83D\uDC76";
  if (lower.includes("oral surg")) return "\u2695\uFE0F";
  return "\uD83C\uDFE2";
}

function AccountCard({ org }: { org: AdminOrganization }) {
  const navigate = useNavigate();
  const dot = healthDot(org);

  return (
    <button
      onClick={() => navigate(`/admin/organizations/${org.id}`)}
      className="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-gray-300 hover:shadow-md group"
    >
      {/* Icon */}
      <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-xl shrink-0 group-hover:bg-[#D56753]/5 transition-colors">
        {specialtyIcon(org.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-[#1A1D23] truncate">
            {org.name}
          </h3>
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${dot.color}`}
            title={dot.label}
          />
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            1 location
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {org.userCount} user{org.userCount !== 1 ? "s" : ""}
          </span>
          {org.subscription_tier && (
            <span className="font-medium text-[#D56753]">
              {org.subscription_tier}
            </span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#D56753] transition-colors shrink-0" />
    </button>
  );
}

export default function AccountOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const orgs: AdminOrganization[] =
    (data as any)?.organizations ?? (Array.isArray(data) ? data : []);

  const totalUsers = orgs.reduce((s, o) => s + (o.userCount || 0), 0);
  const connectedCount = orgs.filter((o) => o.connections?.gbp).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1A1D23] flex items-center gap-3">
          <Building2 className="h-6 w-6 text-[#D56753]" />
          Accounts
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {orgs.length} account{orgs.length !== 1 ? "s" : ""} &middot;{" "}
          {totalUsers} user{totalUsers !== 1 ? "s" : ""} &middot;{" "}
          {connectedCount} connected
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && orgs.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-16 text-center text-gray-400">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">No accounts yet.</p>
          <p className="text-sm mt-1">
            Accounts appear when practices complete onboarding.
          </p>
        </div>
      )}

      {/* Account list */}
      {!isLoading && orgs.length > 0 && (
        <div className="space-y-3">
          {orgs.map((org) => (
            <AccountCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  );
}
