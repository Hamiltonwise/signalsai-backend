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
import { Home, BarChart3, Star, Globe, Settings } from "lucide-react";

const NAV_ITEMS = [
  { to: "/home", icon: Home, label: "Home" },
  { to: "/compare", icon: BarChart3, label: "Compare" },
  { to: "/reviews", icon: Star, label: "Reviews" },
  { to: "/presence", icon: Globe, label: "Presence" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function FivePageLayout() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 sm:pb-0">
      {/* Page content */}
      <main>
        <Outlet />
      </main>

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
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Side nav (desktop) */}
      <nav className="hidden sm:flex fixed left-0 top-0 bottom-0 w-16 flex-col items-center py-6 gap-2 bg-white border-r border-gray-100 z-50">
        {/* Logo */}
        <div className="w-8 h-8 rounded-lg bg-alloro-navy flex items-center justify-center mb-6">
          <span className="text-white text-xs font-semibold">A</span>
        </div>

        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
                isActive
                  ? "bg-alloro-orange/10 text-alloro-orange"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`
            }
          >
            <Icon className="w-5 h-5" />
          </NavLink>
        ))}
      </nav>

      {/* Desktop content offset for side nav */}
      <style>{`
        @media (min-width: 640px) {
          main { margin-left: 64px; }
        }
      `}</style>
    </div>
  );
}
