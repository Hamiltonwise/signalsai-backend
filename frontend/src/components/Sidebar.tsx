import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Activity,
  CheckSquare,
  Trophy,
  BarChart3,
  Bell,
  LogOut,
  ChevronRight,
  AlertTriangle,
  X,
  Lock,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  MapPin,
  Shield,
  Brain,
  Users,
  MessageSquare,
  Radio,
  Eye,
  ArrowLeft,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSidebar } from "./Admin/SidebarContext";
import { apiGet } from "../api/index";
import { fetchClientTasks } from "../api/tasks";
import { fetchNotifications } from "../api/notifications";
import { useIsWizardActive } from "../contexts/OnboardingWizardContext";
import { useLocationContext } from "../contexts/locationContext";
import { useAuth } from "../hooks/useAuth";
import { LocationSwitcher } from "./LocationSwitcher";
import { TailorToggle } from "./TailorToggle";
import { getPriorityItem } from "../hooks/useLocalStorage";
import { isSuperAdminEmail } from "../constants/superAdmins";
import { isPartnerEmail } from "../constants/partners";

type UserRole = "admin" | "manager" | "viewer";
type ViewMode = "admin" | "customer";

interface SidebarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userProfile: any;
  onboardingCompleted: boolean | null;
  disconnect: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedDomain?: any;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: string;
  hasNotification?: boolean;
  isLocked?: boolean;
  minimized?: boolean;
  glow?: boolean;
}

const NavItem = ({
  icon,
  label,
  active = false,
  onClick,
  badge,
  hasNotification = false,
  isLocked = false,
  minimized = false,
  glow = false,
}: NavItemProps) => (
  <button
    onClick={onClick}
    disabled={isLocked}
    title={minimized ? label : undefined}
    className={`w-full flex items-center ${
      minimized ? "justify-center px-0 py-3" : "justify-between px-4 py-3.5"
    } rounded-xl transition-all duration-300 group relative
    ${
      isLocked
        ? "opacity-40 cursor-not-allowed"
        : active
        ? "bg-alloro-sidehover text-white shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] border border-white/5"
        : glow
        ? "text-white/60 hover:text-white hover:bg-alloro-sidehover/60 ring-1 ring-alloro-orange/20 shadow-[0_0_12px_rgba(214,104,83,0.08)]"
        : "text-white/40 hover:text-white/80 hover:bg-alloro-sidehover/60"
    }`}
  >
    <div className={minimized ? "" : "flex items-center gap-3.5"}>
      <div
        className={`transition-all duration-300 ${
          active
            ? "scale-110 text-alloro-orange drop-shadow-[0_0_6px_rgba(214,104,83,0.4)]"
            : glow
            ? "text-alloro-orange/70 opacity-80 group-hover:opacity-100"
            : "opacity-40 group-hover:opacity-80"
        }`}
      >
        {icon}
      </div>
      {!minimized && (
        <span
          className={`text-[13px] font-semibold tracking-tight ${
            active ? "text-white" : glow ? "text-white/70 group-hover:text-white" : "group-hover:text-white/80"
          }`}
        >
          {label}
        </span>
      )}
    </div>
    {hasNotification && !active && !isLocked && (
      <span className={`absolute ${minimized ? "top-1 right-1" : "left-2.5 top-2.5"} flex h-1.5 w-1.5`}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alloro-orange opacity-75"></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-alloro-orange"></span>
      </span>
    )}
    {!minimized && (
      <div className="flex items-center gap-2">
        {isLocked && <Lock size={12} className="text-white/30" />}
        {badge && !isLocked && (
          <span
            className={`px-2 py-0.5 rounded-md text-[9px] font-semibold leading-none
            ${
              active ? "bg-alloro-orange text-white" : "bg-white/10 text-white/40"
            }`}
          >
            {badge}
          </span>
        )}
        {!badge && !isLocked && active && <ChevronRight size={14} className="opacity-20" />}
      </div>
    )}
    {minimized && badge && !isLocked && (
      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-alloro-orange text-white text-[8px] font-semibold px-1">
        {badge}
      </span>
    )}
  </button>
);

/** Returns true if AAE Live should be visible (within 30 days of April 15). */
function isAAEWindow(): boolean {
  const now = new Date();
  const year = now.getFullYear();
  const aaeDate = new Date(year, 3, 15); // April 15
  const diffMs = aaeDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  // Show if within 30 days before OR 5 days after (for follow-up)
  return diffDays >= -5 && diffDays <= 30;
}

export const Sidebar: React.FC<SidebarProps> = ({
  userProfile,
  onboardingCompleted,
  disconnect,
  isOpen,
  onClose,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, toggleCollapsed } = useSidebar();
  const isWizardActive = useIsWizardActive();
  const { selectedLocation } = useLocationContext();
  const { billingStatus } = useAuth();
  const locationId = selectedLocation?.id ?? null;
  const isLockedOut = billingStatus?.isLockedOut ?? false;
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("admin");

  // Intelligence mode determines which nav items to show
  const { data: dashCtx } = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/dashboard-context" });
      return res?.success ? res : null;
    },
    staleTime: 30 * 60_000,
  });
  const intelligenceMode = dashCtx?.intelligence_mode || "referral_based";
  const showReferralHub = intelligenceMode !== "direct_acquisition";
  const [userTaskCount, setUserTaskCount] = useState<number>(0);
  const [unreadNotificationCount, setUnreadNotificationCount] =
    useState<number>(0);

  // Get user role from storage (sessionStorage for pilot mode, localStorage for normal)
  useEffect(() => {
    const role = getPriorityItem("user_role") as UserRole | null;
    setUserRole(role);
  }, []);

  // Fetch user task count (manual/USER type tasks only)
  const loadTaskCount = useCallback(async () => {
    const organizationId = userProfile?.organizationId;
    if (!organizationId || !onboardingCompleted) return;

    try {
      const response = await fetchClientTasks(organizationId, locationId);
      if (response?.success && response.tasks) {
        const pendingUserTasks =
          response.tasks.USER?.filter(
            (task) => task.status !== "complete" && task.status !== "archived"
          ) || [];
        setUserTaskCount(pendingUserTasks.length);
      }
    } catch (err) {
      console.error("Failed to fetch task count for sidebar:", err);
    }
  }, [userProfile?.organizationId, onboardingCompleted, locationId]);

  useEffect(() => {
    loadTaskCount();
  }, [loadTaskCount]);

  useEffect(() => {
    const handleTasksUpdated = () => {
      loadTaskCount();
    };

    window.addEventListener("tasks:updated", handleTasksUpdated);
    return () => {
      window.removeEventListener("tasks:updated", handleTasksUpdated);
    };
  }, [loadTaskCount]);

  // Fetch unread notification count
  const loadNotificationCount = useCallback(async () => {
    const organizationId = userProfile?.organizationId;
    if (!organizationId || !onboardingCompleted) return;

    try {
      const response = await fetchNotifications(organizationId, locationId);
      if (response?.success) {
        setUnreadNotificationCount(response.unreadCount || 0);
      }
    } catch (err) {
      console.error("Failed to fetch notification count for sidebar:", err);
    }
  }, [userProfile?.organizationId, onboardingCompleted, locationId]);

  useEffect(() => {
    loadNotificationCount();

    const interval = setInterval(loadNotificationCount, 3000);
    return () => clearInterval(interval);
  }, [loadNotificationCount]);

  // Check if org has a website project
  useEffect(() => {
    const checkWebsite = async () => {
      const organizationId = userProfile?.organizationId;
      if (!organizationId) return;

      try {
        const data = await apiGet({ path: "/user/website" });
        if (data && !data.error) {
          setHasWebsite(true);
        }
      } catch {
        // Silent fail
      }
    };

    checkWebsite();
  }, [userProfile?.organizationId]);

  useEffect(() => {
    const handleNotificationsUpdated = () => {
      loadNotificationCount();
    };

    window.addEventListener(
      "notifications:updated",
      handleNotificationsUpdated
    );
    return () => {
      window.removeEventListener(
        "notifications:updated",
        handleNotificationsUpdated
      );
    };
  }, [loadNotificationCount]);

  const handleLogout = () => {
    disconnect();
    window.location.href = "/signin";
  };

  const canSeeNotifications = userRole !== "viewer";
  const isManagerOrAbove = userRole === "admin" || userRole === "manager";
  const isSuperAdmin = isSuperAdminEmail(userProfile?.email);
  const isPartner = isPartnerEmail(userProfile?.email);

  // Super admins default to admin view; non-super-admins always see customer view
  const effectiveViewMode: ViewMode = isSuperAdmin ? viewMode : "customer";

  // Execution items with badges (shared between both views)
  const executionNavItems = useMemo(
    () => [
      {
        label: "To-Do List",
        icon: <CheckSquare size={18} />,
        path: "/tasks",
        showDuringOnboarding: false,
        badge: userTaskCount > 0 ? String(userTaskCount) : undefined,
      },
      {
        label: "Notifications",
        icon: <Bell size={18} />,
        path: "/notifications",
        showDuringOnboarding: false,
        hasNotification: unreadNotificationCount > 0,
      },
    ],
    [userTaskCount, unreadNotificationCount]
  );

  const isActive = (path: string) => {
    if (path === "/dashboard" && location.pathname === "/dashboard")
      return true;
    if (path === "/hq/command" && location.pathname === "/hq/command")
      return true;
    return location.pathname.startsWith(path) && path !== "/dashboard" && path !== "/hq/command";
  };

  const handleNavigate = (path: string) => {
    if (isWizardActive) return;
    navigate(path);
    onClose?.();
  };

  const isMinimized = collapsed && !isOpen;

  // ---- Admin nav (super admins only) ----
  const renderAdminNav = () => (
    <div className="space-y-1.5">
      <NavItem
        icon={<LayoutDashboard size={18} />}
        label="Home"
        active={isActive("/hq/command")}
        onClick={() => handleNavigate("/hq/command")}
        minimized={isMinimized}
      />
      <NavItem
        icon={<Brain size={18} />}
        label="The Board"
        active={isActive("/hq/board")}
        onClick={() => handleNavigate("/hq/board")}
        minimized={isMinimized}
        glow={!isActive("/hq/board")}
      />
      <NavItem
        icon={<Users size={18} />}
        label="Organizations"
        active={location.pathname === "/hq/organizations"}
        onClick={() => handleNavigate("/hq/organizations")}
        minimized={isMinimized}
      />
      <NavItem
        icon={<Users size={18} />}
        label="Dream Team"
        active={isActive("/admin/minds")}
        onClick={() => handleNavigate("/admin/minds")}
        minimized={isMinimized}
      />
      <NavItem
        icon={<MessageSquare size={18} />}
        label="Messages"
        active={location.pathname === "/messages"}
        onClick={() => handleNavigate("/messages")}
        minimized={isMinimized}
      />

      {/* Subtle divider */}
      <div className="py-3">
        <div className="border-t border-white/5" />
      </div>

      {/* Customer View toggle */}
      {!isMinimized ? (
        <button
          onClick={() => setViewMode("customer")}
          className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-300 text-white/40 hover:text-white/80 border border-white/10 hover:border-white/20 hover:bg-alloro-sidehover/40"
        >
          <Eye size={18} className="opacity-60" />
          <span className="text-[13px] font-semibold tracking-tight">Customer View</span>
        </button>
      ) : (
        <button
          onClick={() => setViewMode("customer")}
          title="Customer View"
          className="w-full flex items-center justify-center py-3 rounded-xl transition-all duration-300 text-white/40 hover:text-white/80 border border-white/10 hover:border-white/20"
        >
          <Eye size={18} className="opacity-60" />
        </button>
      )}

      {/* AAE Live - conditional, within 30 days of April 15 */}
      {isAAEWindow() && (
        <NavItem
          icon={<Radio size={18} />}
          label="AAE Live"
          active={isActive("/admin/aae")}
          onClick={() => handleNavigate("/admin/aae")}
          minimized={isMinimized}
        />
      )}
    </div>
  );

  // ---- Customer nav ----
  const renderCustomerNav = () => {
    const mainItems = [
      {
        label: "Home",
        icon: <LayoutDashboard size={18} />,
        path: "/dashboard",
        showDuringOnboarding: true,
      },
      // Referrals Hub: owner + manager only, hidden for direct_acquisition verticals
      ...(isManagerOrAbove && showReferralHub
        ? [
            {
              label: intelligenceMode === "hybrid" ? "Revenue Sources" : "Referrals Hub",
              icon: <Activity size={18} />,
              path: "/pmsStatistics",
              showDuringOnboarding: false,
            },
          ]
        : []),
      {
        label: "Local Rankings",
        icon: <Trophy size={18} />,
        path: "/rankings",
        showDuringOnboarding: false,
      },
      {
        label: "Progress Report",
        icon: <BarChart3 size={18} />,
        path: "/dashboard/progress",
        showDuringOnboarding: false,
      },
      {
        label: "Intelligence",
        icon: <Shield size={18} />,
        path: "/dashboard/intelligence",
        showDuringOnboarding: false,
      },
      // Locations: owner + manager only
      ...(isManagerOrAbove
        ? [
            {
              label: "Locations",
              icon: <MapPin size={18} />,
              path: "/dashboard/locations",
              showDuringOnboarding: false,
            },
          ]
        : []),
    ];

    const filteredMain = onboardingCompleted
      ? mainItems
      : mainItems.filter((item) => item.showDuringOnboarding);

    const filteredExecution = onboardingCompleted
      ? executionNavItems
      : executionNavItems.filter((item) => item.showDuringOnboarding);

    return (
      <>
        {/* Customer View banner for super admins */}
        {isSuperAdmin && !isMinimized && (
          <div className="bg-alloro-orange/10 border border-alloro-orange/20 rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-alloro-orange/80 uppercase tracking-wider">
                Viewing as customer
              </span>
              <button
                onClick={() => setViewMode("admin")}
                className="flex items-center gap-1.5 text-xs font-bold text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft size={12} />
                Exit
              </button>
            </div>
          </div>
        )}
        {isSuperAdmin && isMinimized && (
          <button
            onClick={() => setViewMode("admin")}
            title="Exit customer view"
            className="w-full flex items-center justify-center py-2 mb-2 rounded-lg bg-alloro-orange/10 text-alloro-orange/80 hover:text-alloro-orange transition-colors"
          >
            <ArrowLeft size={14} />
          </button>
        )}

        {/* Main nav items */}
        <div className="space-y-1.5">
          {!isMinimized && (
            <div className="text-xs font-semibold text-white/20 uppercase tracking-[0.3em] px-4 mb-4">
              Operations
              {isWizardActive && (
                <span className="ml-2 text-alloro-orange">(Tour Active)</span>
              )}
            </div>
          )}
          {filteredMain.map(({ label, icon, path }) => (
            <NavItem
              key={label}
              icon={icon}
              label={label}
              active={isActive(path)}
              onClick={() => handleNavigate(path)}
              isLocked={isWizardActive}
              minimized={isMinimized}
            />
          ))}
        </div>

        {/* Websites */}
        {onboardingCompleted && hasWebsite && isManagerOrAbove && (
          <div className="space-y-1.5 mt-1.5">
            <NavItem
              icon={<Globe size={18} />}
              label="Websites"
              active={isActive("/dfy/website")}
              onClick={() => handleNavigate("/dfy/website")}
              isLocked={isWizardActive}
              minimized={isMinimized}
            />
          </div>
        )}

        {/* Subtle divider */}
        {onboardingCompleted && (
          <div className="py-3">
            <div className="border-t border-white/5" />
          </div>
        )}

        {/* Execution & Alerts */}
        {onboardingCompleted && (
          <div className="space-y-1.5">
            {filteredExecution.map(
              ({ label, icon, path, badge, hasNotification }) =>
                canSeeNotifications || path !== "/notifications" ? (
                  <NavItem
                    key={label}
                    icon={icon}
                    label={label}
                    active={isActive(path)}
                    onClick={() => handleNavigate(path)}
                    badge={badge}
                    hasNotification={hasNotification}
                    isLocked={isWizardActive}
                    minimized={isMinimized}
                  />
                ) : null
            )}
            <NavItem
              icon={<MessageSquare size={18} />}
              label="Messages"
              active={location.pathname === "/messages"}
              onClick={() => handleNavigate("/messages")}
              isLocked={isWizardActive}
              minimized={isMinimized}
            />
          </div>
        )}

        {/* Partner extras: The Board */}
        {isPartner && onboardingCompleted && (
          <>
            <div className="py-3">
              <div className="border-t border-white/5" />
            </div>
            <div className="space-y-1.5">
              <NavItem
                icon={<Brain size={18} />}
                label="The Board"
                active={isActive("/board")}
                onClick={() => handleNavigate("/board")}
                minimized={isMinimized}
                glow={!isActive("/board")}
              />
            </div>
          </>
        )}
      </>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-alloro-navy/40 backdrop-blur-sm z-[70] lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
              onClick={() => setShowLogoutConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-red-50 text-red-600">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-alloro-navy font-heading">
                    Log Out?
                  </h3>
                </div>
                <p className="text-slate-600 mb-6 leading-relaxed text-[14px]">
                  Are you sure you want to log out of your account?
                </p>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md"
                  >
                    Log Out
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-screen bg-alloro-sidebg text-white flex flex-col z-[80] border-r border-white/5 shadow-2xl
          transition-all duration-300 ease-in-out overflow-hidden
          w-72 ${collapsed ? "lg:w-[68px]" : "lg:w-72"}
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Brand Header */}
        {isMinimized ? (
          <div className="px-3 pt-5 pb-4 flex flex-col items-center gap-3">
            <img
              src="/logo.png"
              alt="Alloro"
              className="w-8 h-8 rounded-xl shadow-soft-glow cursor-pointer hover:scale-105 transition-transform"
              onClick={() => handleNavigate(isSuperAdmin && effectiveViewMode === "admin" ? "/hq/command" : "/dashboard")}
            />
            <button
              onClick={toggleCollapsed}
              className="p-1.5 text-white/30 hover:text-white/70 transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen size={16} />
            </button>
          </div>
        ) : (
          <div className="p-10 pb-12 flex items-center justify-between">
            <div
              className="flex items-center gap-4 group cursor-pointer"
              onClick={() => handleNavigate(isSuperAdmin && effectiveViewMode === "admin" ? "/hq/command" : "/dashboard")}
            >
              <img
                src="/logo.png"
                alt="Alloro"
                className="w-10 h-10 rounded-xl shadow-soft-glow transition-transform group-hover:scale-105"
              />
              <div className="flex flex-col">
                <h1 className="font-heading font-semibold text-xl tracking-tight leading-none">
                  Alloro
                </h1>
                <span className="text-[9px] font-semibold text-white/30 uppercase tracking-[0.25em] mt-1.5 leading-none">
                  Intelligence
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 text-white/40 hover:text-white transition-colors bg-white/5 rounded-lg"
            >
              <X size={18} />
            </button>
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex p-2 text-white/40 hover:text-white transition-colors bg-white/5 rounded-lg"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${isMinimized ? "px-2 space-y-2" : "px-6 space-y-4"} scrollbar-thin`}>
          {/* Lockout Banner */}
          {isLockedOut && (
            isMinimized ? (
              <div className="flex justify-center py-2" title="Account Locked">
                <Lock size={16} className="text-red-400" />
              </div>
            ) : (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Lock size={14} className="text-red-400 shrink-0" />
                  <span className="text-xs font-semibold text-red-300 uppercase tracking-wider">
                    Account Locked
                  </span>
                </div>
                <p className="text-xs text-red-300/70 leading-relaxed">
                  Add a payment method in Settings to restore access.
                </p>
              </div>
            )
          )}

          {/* Role-aware nav rendering */}
          {!isLockedOut && effectiveViewMode === "admin" && isSuperAdmin && renderAdminNav()}
          {!isLockedOut && effectiveViewMode === "customer" && renderCustomerNav()}
        </nav>

        {/* Location Switcher (customer view only, hidden when minimized) */}
        {!isMinimized && effectiveViewMode === "customer" && <LocationSwitcher />}

        {/* Footer / Account */}
        {isMinimized ? (
          <div className="px-2 pt-2 pb-4 mt-auto flex flex-col items-center gap-2">
            <TailorToggle minimized />
            <button
              onClick={() => handleNavigate("/settings")}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-xs font-semibold border border-white/10 hover:border-alloro-orange transition-colors"
              title="Settings"
            >
              {userProfile?.practiceName?.substring(0, 2).toUpperCase() || "AP"}
            </button>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="p-1.5 text-white/20 hover:text-red-400 transition-all"
              title="Log out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="px-8 pt-2 pb-8 mt-auto">
            <div className="px-0 mb-3">
              <TailorToggle />
            </div>
            <div
              className="bg-white/5 border border-white/5 rounded-2xl p-5 transition-all hover:bg-alloro-sidehover cursor-pointer group"
              onClick={() => handleNavigate("/settings")}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-xs font-semibold border border-white/10 group-hover:border-alloro-orange transition-colors">
                  {userProfile?.practiceName?.substring(0, 2).toUpperCase() ||
                    "AP"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate">
                    {userProfile?.practiceName || "Your Business"}
                  </p>
                  <p className="text-[9px] text-white/20 font-semibold uppercase tracking-widest mt-0.5">
                    {isSuperAdmin
                      ? "Super Admin"
                      : isPartner
                      ? "Partner"
                      : userRole === "admin"
                      ? "Administrator"
                      : userRole === "manager"
                      ? "Manager"
                      : "Viewer"}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLogoutConfirm(true);
                }}
                className="flex items-center gap-2 text-white/20 hover:text-red-400 transition-all w-full text-[9px] font-semibold uppercase tracking-widest"
              >
                <LogOut size={14} /> Log out
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
