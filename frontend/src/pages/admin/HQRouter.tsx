/**
 * HQ Router — role-based admin home screen.
 *
 * Routes by email:
 * - corey@getalloro.com → VisionaryView
 * - jordan@getalloro.com → IntegratorView
 * - dave@getalloro.com → BuildView
 * - anyone else → MorningBrief (default HQ)
 */

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
  "jo@getalloro.com": "integrator",
  "dave@getalloro.com": "build",
};

export default function HQRouter() {
  const { userProfile } = useAuth();
  const email = userProfile?.email?.toLowerCase().trim() || "";
  const role = ROLE_MAP[email] || null;

  switch (role) {
    case "visionary":
      return <VisionaryView />;
    case "integrator":
      return <IntegratorView />;
    case "build":
      return <BuildView />;
    default:
      return <MorningBrief />;
  }
}
