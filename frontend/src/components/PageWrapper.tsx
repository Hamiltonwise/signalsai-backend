import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, Lock, CreditCard } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { LocationTransitionOverlay } from "./LocationTransitionOverlay";
import { NotificationPopover } from "./NotificationPopover";
import { SidebarProvider, useSidebar } from "./Admin/SidebarContext";
import { useAuth } from "../hooks/useAuth";
import { useSession } from "../contexts/sessionContext";
import { isConferenceMode } from "../pages/checkup/conferenceFallback";

interface PageWrapperProps {
  children: React.ReactNode;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({ children }) => {
  return (
    <SidebarProvider defaultCollapsed={false}>
      <PageWrapperInner>{children}</PageWrapperInner>
    </SidebarProvider>
  );
};

const PageWrapperInner: React.FC<PageWrapperProps> = ({ children }) => {
  const { userProfile, selectedDomain, onboardingCompleted, billingStatus } =
    useAuth();
  const { disconnect } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed } = useSidebar();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isLockedOut = billingStatus?.isLockedOut ?? false;
  const isOnSettingsPage = location.pathname.startsWith("/settings");

  // Redirect locked-out users to /settings (the only page they can access)
  useEffect(() => {
    if (isLockedOut && !isOnSettingsPage) {
      navigate("/settings/billing", { replace: true });
    }
  }, [isLockedOut, isOnSettingsPage, navigate]);

  return (
    <div className="flex bg-alloro-bg min-h-screen font-body text-alloro-navy relative overflow-x-hidden selection:bg-alloro-orange selection:text-white">
      {/* Mobile Header - consistent across all pages */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 z-[60] shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-alloro-navy hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-alloro-orange rounded-lg flex items-center justify-center text-white font-semibold text-sm">
              {onboardingCompleted
                ? userProfile?.practiceName?.charAt(0)?.toUpperCase() || "A"
                : "A"}
            </div>
            <span className="text-alloro-navy font-heading font-semibold text-base hidden sm:inline-block">
              {onboardingCompleted
                ? userProfile?.practiceName || "Alloro"
                : "Alloro"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isLockedOut && (
            <NotificationPopover
              organizationId={userProfile?.organizationId || null}
            />
          )}
          <button
            onClick={() => navigate("/settings")}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold border border-slate-200"
          >
            {userProfile?.practiceName?.substring(0, 2).toUpperCase() || "AP"}
          </button>
        </div>
      </div>

      <Sidebar
        userProfile={userProfile}
        onboardingCompleted={onboardingCompleted}
        disconnect={disconnect}
        selectedDomain={selectedDomain}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area - responsive padding applied here */}
      <main
        className={`flex-1 w-full pt-16 lg:pt-0 min-h-screen flex flex-col transition-all duration-300 ease-in-out ${
          collapsed ? "lg:pl-[68px]" : "lg:pl-72"
        }`}
      >
        {/* Lockout Banner -- persistent top bar when account is locked */}
        {isLockedOut && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <Lock size={16} className="text-red-600 shrink-0" />
              <p className="text-sm text-red-800 font-medium">
                Your account is locked. Add a payment method to restore full
                access.
              </p>
            </div>
            {!isOnSettingsPage && (
              <button
                onClick={() => navigate("/settings/billing")}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors shrink-0"
              >
                <CreditCard size={14} />
                Go to Settings
              </button>
            )}
          </div>
        )}

        {/* Subscribe Banner -- persistent for admin-granted users without Stripe. Hidden in conference mode. */}
        {!isLockedOut && billingStatus?.isAdminGranted && !billingStatus?.isFoundation && !isOnSettingsPage && !isConferenceMode() && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <CreditCard size={16} className="text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 font-medium">
                You haven't subscribed to Alloro yet. Head to Settings &gt;
                Billing to get started.
              </p>
            </div>
            <button
              onClick={() => navigate("/settings/billing")}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-alloro-orange text-white text-xs font-semibold rounded-lg hover:bg-alloro-orange/90 transition-colors shrink-0"
            >
              <CreditCard size={14} />
              Subscribe
            </button>
          </div>
        )}
        {children}
      </main>

      <LocationTransitionOverlay />
    </div>
  );
};
