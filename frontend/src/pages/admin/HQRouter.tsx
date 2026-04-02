/**
 * HQ Router -- role-based admin home screen with super admin view switching.
 *
 * Routes by email:
 * - corey@getalloro.com -> VisionaryView (default, can switch to any view)
 * - jordan@getalloro.com -> IntegratorView
 * - dave@getalloro.com -> BuildView
 * - anyone else -> MorningBrief (default HQ)
 *
 * Super admins (corey, info) get a view switcher to see any team member's dashboard.
 */

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import VisionaryView from "./VisionaryView";
import IntegratorView from "./IntegratorView";
import BuildView from "./BuildView";
import MorningBrief from "./MorningBrief";

const ROLE_MAP: Record<string, "visionary" | "integrator" | "build"> = {
  "corey@getalloro.com": "visionary",
  "info@getalloro.com": "visionary",
  "demo@getalloro.com": "visionary",
  "jordan@getalloro.com": "integrator",
  "dave@getalloro.com": "build",
};

const SUPER_ADMINS = ["corey@getalloro.com", "info@getalloro.com"];

export default function HQRouter() {
  const { userProfile } = useAuth();
  const email = userProfile?.email?.toLowerCase().trim() || "";
  const defaultRole = ROLE_MAP[email] || null;
  const isSuperAdmin = SUPER_ADMINS.includes(email);
  const [viewOverride, setViewOverride] = useState<string | null>(null);

  const activeRole = viewOverride || defaultRole;

  return (
    <>
      {isSuperAdmin && (
        <div className="sticky top-0 z-50 bg-[#212D40] border-b border-white/10 px-4 py-2 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/40 mr-2">View as:</span>
          {[
            { key: null, label: "Corey (CEO)" },
            { key: "integrator", label: "Jo (COO)" },
            { key: "build", label: "Dave (CTO)" },
            { key: "morning", label: "Morning Brief" },
          ].map((opt) => (
            <button
              key={opt.key || "default"}
              onClick={() => setViewOverride(opt.key)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                (viewOverride === opt.key) || (!viewOverride && !opt.key)
                  ? "bg-[#D56753] text-white"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {activeRole === "visionary" || activeRole === null && isSuperAdmin ? (
        <VisionaryView />
      ) : activeRole === "integrator" ? (
        <IntegratorView />
      ) : activeRole === "build" ? (
        <BuildView />
      ) : activeRole === "morning" ? (
        <MorningBrief />
      ) : (
        <MorningBrief />
      )}
    </>
  );
}
