/**
 * @deprecated Plan 3 (Restore sidebar) walked back Plan 2's top-bar layout.
 * This component is preserved on disk for potential revival but is no longer
 * mounted. The global layout shell is `PageWrapper.tsx` (sidebar + mobile
 * header). All file dependencies (lucide imports, useAuth, useLocationContext)
 * remain intact so this can be re-enabled with a one-line PageWrapper edit.
 *
 * Plan: plans/04282026-no-ticket-restore-sidebar-keep-dashboard/spec.md
 */
import React, { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  RefreshCw,
  ChevronDown,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useLocationContext } from "../../contexts/locationContext";

/**
 * TopBar — global authenticated layout chrome.
 *
 * Replaces the legacy `Sidebar.tsx` for the new Focus dashboard shell.
 * Renders brand mark, URL-driven tab nav, live pill, refresh, location
 * selector, and avatar. Mobile (<lg): collapses to brand + avatar +
 * hamburger that opens a drawer of the same tabs.
 *
 * Reference design: ~/Desktop/another-design/project/Focus Dashboard.html
 *                   ~/Desktop/another-design/project/app.jsx (TopBar)
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T4)
 */

export interface TopBarProps {
  taskCount?: number;
  /** Optional refresh dispatcher; fires when user clicks refresh icon. */
  onRefresh?: () => void;
}

interface TabItem {
  name: string;
  to: string;
  /** Match exact route — `end` prop on NavLink. */
  end: boolean;
  /** Render a count badge (used by Tasks tab). */
  count?: number;
}

const formatBrandDate = (now: Date): string =>
  now.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const getInitials = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  practiceName: string | null | undefined
): string => {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (first || last) {
    const a = first.charAt(0).toUpperCase();
    const b = last.charAt(0).toUpperCase();
    return `${a}${b}`.trim() || a || b || "U";
  }
  const practice = (practiceName ?? "").trim();
  if (practice) return practice.substring(0, 2).toUpperCase();
  return "U";
};

interface TabLinkProps {
  tab: TabItem;
  variant: "desktop" | "mobile";
  onClick?: () => void;
}

const TabLink: React.FC<TabLinkProps> = ({ tab, variant, onClick }) => {
  const baseDesktop =
    "relative inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[11.5px] font-bold uppercase tracking-[0.1em] transition-colors duration-150";
  const baseMobile =
    "flex items-center justify-between w-full px-4 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.1em] transition-colors";

  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      onClick={onClick}
      className={({ isActive }) =>
        variant === "desktop"
          ? `${baseDesktop} ${
              isActive
                ? "bg-[#1A1A1A] text-white"
                : "text-[#6B7280] hover:text-[#1A1A1A] hover:bg-[#F0ECE5]"
            }`
          : `${baseMobile} ${
              isActive
                ? "bg-[#1A1A1A] text-white"
                : "text-[#1A1A1A] hover:bg-[#F0ECE5]"
            }`
      }
    >
      {({ isActive }) => (
        <>
          <span>{tab.name}</span>
          {tab.count != null && (
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[9.5px] font-extrabold leading-none ${
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-[#D66853] text-white"
              }`}
            >
              {tab.count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
};

interface BrandMarkProps {
  todayLabel: string;
}

const BrandMark: React.FC<BrandMarkProps> = ({ todayLabel }) => (
  <div className="flex items-center gap-3 pr-6 lg:border-r lg:border-[#E8E4DD] h-9">
    <span
      aria-hidden
      className="w-[10px] h-[10px] rounded-full bg-[#D66853]"
      style={{ boxShadow: "0 0 0 4px rgba(214, 104, 83, 0.15)" }}
    />
    <div className="flex flex-col leading-[1.05]">
      <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]">
        Practice Hub
      </span>
      <span className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
        Focus View · {todayLabel}
      </span>
    </div>
  </div>
);

const LivePill: React.FC = () => (
  <span
    className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full bg-[#E8F1E5] text-[#4F8A5B] text-[10px] font-bold uppercase tracking-[0.1em]"
    aria-live="polite"
  >
    <span
      aria-hidden
      className="w-1.5 h-1.5 rounded-full bg-[#4F8A5B]"
      style={{ animation: "alloro-topbar-pulse 2.4s ease-in-out infinite" }}
    />
    Live
  </span>
);

interface RefreshButtonProps {
  onRefresh?: () => void;
}

const RefreshButton: React.FC<RefreshButtonProps> = ({ onRefresh }) => (
  <button
    type="button"
    onClick={onRefresh}
    title="Refresh"
    aria-label="Refresh data"
    className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-[#E8E4DD] bg-white text-[#6B7280] hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-colors"
  >
    <RefreshCw size={14} />
  </button>
);

const LocationSelector: React.FC = () => {
  const { locations, selectedLocation, setSelectedLocation } =
    useLocationContext();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Hide entirely when there is no location context populated yet.
  if (!selectedLocation) return null;

  const isMulti = locations.length > 1;

  const buttonContent = (
    <>
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A]" />
      <span className="truncate max-w-[140px]">{selectedLocation.name}</span>
      {isMulti && <ChevronDown size={12} className="text-[#6B7280]" />}
    </>
  );

  if (!isMulti) {
    return (
      <div className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#E8E4DD] bg-white text-[12px] font-semibold text-[#2C2A26]">
        {buttonContent}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#E8E4DD] bg-white text-[12px] font-semibold text-[#2C2A26] hover:border-[#1A1A1A] transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 min-w-[200px] bg-white border border-[#E8E4DD] rounded-xl shadow-lg overflow-hidden z-50"
        >
          {locations.map((loc) => {
            const isActive = loc.id === selectedLocation.id;
            return (
              <button
                key={loc.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  if (!isActive) setSelectedLocation(loc);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold transition-colors ${
                  isActive
                    ? "bg-[#F0ECE5] text-[#1A1A1A]"
                    : "text-[#2C2A26] hover:bg-[#F0ECE5]"
                }`}
              >
                <span
                  aria-hidden
                  className={`w-1.5 h-1.5 rounded-full ${
                    isActive ? "bg-[#D66853]" : "bg-[#1A1A1A]"
                  }`}
                />
                <span className="truncate">{loc.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface AvatarProps {
  initials: string;
}

const Avatar: React.FC<AvatarProps> = ({ initials }) => (
  <span
    className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-[#1A1A1A] text-white text-[11px] font-bold tracking-[0.04em] border-2 border-white"
    style={{ boxShadow: "0 0 0 1px #E8E4DD" }}
    aria-label="Account"
  >
    {initials}
  </span>
);

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  tabs: TabItem[];
}

const MobileDrawer: React.FC<MobileDrawerProps> = ({ open, onClose, tabs }) => {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute right-0 top-0 h-full w-[280px] max-w-[85vw] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E4DD]">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]">
            Navigation
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#6B7280] hover:text-[#1A1A1A] hover:bg-[#F0ECE5]"
          >
            <X size={16} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {tabs.map((tab) => (
            <TabLink
              key={tab.to}
              tab={tab}
              variant="mobile"
              onClick={onClose}
            />
          ))}
        </nav>
      </div>
    </div>
  );
};

interface HamburgerButtonProps {
  onClick: () => void;
  Icon: LucideIcon;
}

const HamburgerButton: React.FC<HamburgerButtonProps> = ({ onClick, Icon }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Open menu"
    className="lg:hidden w-9 h-9 inline-flex items-center justify-center rounded-lg border border-[#E8E4DD] bg-white text-[#1A1A1A] hover:bg-[#F0ECE5] transition-colors"
  >
    <Icon size={18} />
  </button>
);

export function TopBar({ taskCount = 0, onRefresh }: TopBarProps) {
  const { userProfile } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [todayLabel, setTodayLabel] = useState<string>(() =>
    formatBrandDate(new Date())
  );

  // Update label at most once per minute so the date stays correct across midnight.
  useEffect(() => {
    const tick = () => setTodayLabel(formatBrandDate(new Date()));
    const interval = setInterval(tick, 60_000);
    return () => clearInterval(interval);
  }, []);

  const initials = getInitials(
    userProfile?.firstName,
    userProfile?.lastName,
    userProfile?.practiceName
  );

  // Note: Referral Engine is currently an internal dashboard tab without
  // a dedicated route. Per spec D5/T4: link to /dashboard?tab=referral.
  const tabs: TabItem[] = [
    { name: "Focus", to: "/dashboard", end: true },
    { name: "Journey", to: "/patientJourneyInsights", end: false },
    { name: "PMS", to: "/pmsStatistics", end: false },
    { name: "Rankings", to: "/rankings", end: false },
    { name: "Tasks", to: "/tasks", end: false, count: taskCount },
    { name: "Referral Engine", to: "/dashboard?tab=referral", end: false },
  ];

  return (
    <>
      {/* Inline keyframes for the live-pill pulse — keeps styling self-contained. */}
      <style>{`
        @keyframes alloro-topbar-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>

      <header
        className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-[#E8E4DD]"
        style={{ WebkitBackdropFilter: "saturate(140%) blur(8px)" }}
      >
        <div className="max-w-[1320px] mx-auto px-4 lg:px-8">
          <div className="flex items-center gap-7 h-16">
            <BrandMark todayLabel={todayLabel} />

            {/* Desktop tabs */}
            <nav
              aria-label="Primary navigation"
              className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0"
            >
              {tabs.map((tab) => (
                <TabLink key={tab.to} tab={tab} variant="desktop" />
              ))}
            </nav>

            {/* Spacer for mobile so right cluster aligns flush */}
            <div className="flex-1 lg:hidden" />

            {/* Right cluster */}
            <div className="flex items-center gap-2.5">
              <span className="hidden lg:inline-flex">
                <LivePill />
              </span>
              <span className="hidden lg:inline-flex">
                <RefreshButton onRefresh={onRefresh} />
              </span>
              <LocationSelector />
              <Avatar initials={initials} />
              <HamburgerButton
                onClick={() => setDrawerOpen(true)}
                Icon={Menu}
              />
            </div>
          </div>
        </div>
      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        tabs={tabs}
      />
    </>
  );
}
