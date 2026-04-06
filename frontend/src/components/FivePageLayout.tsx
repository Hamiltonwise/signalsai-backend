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

import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Home, BarChart3, Star, Globe, TrendingUp, Settings, HelpCircle, MapPin, ChevronDown, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import CSAgentChat from "@/components/dashboard/CSAgentChat";

const NAV_ITEMS = [
  { to: "/home", icon: Home, label: "Home" },
  { to: "/compare", icon: BarChart3, label: "Compare" },
  { to: "/reviews", icon: Star, label: "Reviews" },
  { to: "/presence", icon: Globe, label: "Presence" },
  { to: "/progress", icon: TrendingUp, label: "Progress" },
];

/** Compact location picker for multi-location orgs. Light theme. */
function LocationPicker({ className }: { className?: string }) {
  const { locations, selectedLocation, setSelectedLocation } = useLocationContext();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (locations.length <= 1) return null;

  function handleSelect(location: (typeof locations)[number]) {
    const rect = buttonRef.current?.getBoundingClientRect();
    const origin = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : undefined;
    setSelectedLocation(location, origin);
    setIsOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-50/80 border border-stone-200/60 text-sm font-medium text-[#1A1D23] hover:bg-stone-100/80 transition-colors"
      >
        <MapPin size={14} className="text-[#D56753] flex-shrink-0" />
        <span className="flex-1 text-left truncate">{selectedLocation?.name || "Select Location"}</span>
        <ChevronDown size={14} className={`text-[#1A1D23]/40 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200/60 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="py-1 max-h-48 overflow-y-auto">
            {locations.map((location) => {
              const isSelected = selectedLocation?.id === location.id;
              return (
                <button
                  key={location.id}
                  onClick={() => handleSelect(location)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? "text-[#D56753] bg-[#D56753]/5"
                      : "text-[#1A1D23]/60 hover:text-[#1A1D23] hover:bg-stone-50"
                  }`}
                >
                  {isSelected ? (
                    <Check size={14} className="text-[#D56753] flex-shrink-0" />
                  ) : (
                    <span className="w-3.5 flex-shrink-0" />
                  )}
                  <span className="truncate font-medium">{location.name}</span>
                  {location.is_primary && (
                    <span className="ml-auto text-xs text-[#1A1D23]/40 flex-shrink-0">Primary</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FivePageLayout() {
  const { userProfile } = useAuth();
  const practiceName = userProfile?.practiceName || "your practice";

  return (
    <div className="min-h-screen bg-[#F8F6F2] pb-20 sm:pb-0 pt-14 sm:pt-0">
      {/* Mobile header: location picker + settings gear */}
      <div className="sm:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-2 px-3 py-2 bg-[#F8F6F2]/95 backdrop-blur-sm">
        <LocationPicker className="flex-1 min-w-0" />
        <NavLink
          to="/settings"
          className="w-9 h-9 rounded-full bg-white/80 border border-stone-200/60 flex items-center justify-center text-gray-400 hover:text-[#1A1D23] transition-colors flex-shrink-0"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </NavLink>
      </div>

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

        <LocationPicker className="mb-3" />

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
          <NavLink
            to="/help"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-[#D56753]/10 text-[#D56753]"
                  : "text-gray-500 hover:text-[#1A1D23] hover:bg-stone-100/80"
              }`
            }
          >
            <HelpCircle className="w-5 h-5 shrink-0" />
            <span>Help</span>
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
