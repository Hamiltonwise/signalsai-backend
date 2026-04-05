/**
 * Five-Page Layout -- One Alloro
 *
 * The universal layout for the five-page dashboard.
 * Bottom navigation with five icons. No sidebar.
 * Clean. Calm. Three seconds.
 *
 * Replaces PageWrapper + Sidebar for the v2 customer experience.
 * V1 sidebar preserved at /dashboard routes.
 */

import { NavLink, Outlet } from "react-router-dom";
import { Home, BarChart3, Star, Globe, TrendingUp, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import CSAgentChat from "@/components/dashboard/CSAgentChat";

const NAV_ITEMS = [
  { to: "/home", icon: Home, label: "Home" },
  { to: "/compare", icon: BarChart3, label: "Compare" },
  { to: "/reviews", icon: Star, label: "Reviews" },
  { to: "/presence", icon: Globe, label: "Presence" },
  { to: "/progress", icon: TrendingUp, label: "Progress" },
];

export default function FivePageLayout() {
  const { userProfile } = useAuth();
  const practiceName = userProfile?.practiceName || "your practice";

  return (
    <div className="min-h-screen bg-[#F8F6F2] pb-20 sm:pb-0">
      {/* Page content */}
      <main>
        <Outlet />
      </main>

      {/* Advisor chat -- replaces HelpButton on five-page routes */}
      {userProfile && (
        <CSAgentChat practiceName={practiceName} />
      )}

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-100 sm:hidden">
        <div className="flex items-center justify-around h-16 px-2">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
                  isActive
                    ? "text-alloro-orange"
                    : "text-gray-400 hover:text-gray-600"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Side nav (desktop) -- labels visible, not just icons */}
      <nav className="hidden sm:flex fixed left-0 top-0 bottom-0 w-48 flex-col py-6 px-3 gap-1 bg-[#F8F6F2] border-r border-stone-200/60 z-50">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 mb-8">
          <div className="w-8 h-8 rounded-lg bg-alloro-navy flex items-center justify-center">
            <span className="text-white text-xs font-semibold">A</span>
          </div>
          <span className="text-base font-semibold text-[#1A1D23] tracking-tight">Alloro</span>
        </div>

        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-[#D56753]/10 text-[#D56753]"
                  : "text-gray-500 hover:text-[#1A1D23] hover:bg-stone-100/80"
              }`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}

        {/* Settings -- accessible but not one of the five questions */}
        <div className="mt-auto pt-4 border-t border-stone-200/40">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-[#D56753]/10 text-[#D56753]"
                  : "text-gray-500 hover:text-[#1A1D23] hover:bg-stone-100/80"
              }`
            }
          >
            <Settings className="w-5 h-5 shrink-0" />
            <span>Settings</span>
          </NavLink>
        </div>
      </nav>

      {/* Desktop content offset for side nav */}
      <style>{`
        @media (min-width: 640px) {
          main { margin-left: 192px; }
        }
      `}</style>
    </div>
  );
}
