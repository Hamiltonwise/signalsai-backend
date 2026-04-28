/**
 * PageWrapper — global authenticated layout shell.
 *
 * Plan 2 (Focus dashboard redesign): replaced the left Sidebar with a top
 * TopBar + Ticker (Ticker only on dashboard routes). The sidebar is no
 * longer rendered. `Sidebar.tsx` is preserved on disk for revert/reference
 * but is unmounted from the layout. `MobileBottomNav` continues to render
 * as the primary mobile nav until the mobile redesign lands.
 *
 * Plan ref: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T19)
 */

import React, { useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, CreditCard, ArrowRight } from "lucide-react";
import { MobileBottomNav } from "./MobileBottomNav";
import { LocationTransitionOverlay } from "./LocationTransitionOverlay";
import { TopBar } from "./layout/TopBar";
import Ticker from "./layout/Ticker";
import { useAuth } from "../hooks/useAuth";

interface PageWrapperProps {
  children: React.ReactNode;
}

const DASHBOARD_ROUTE_PREFIXES = [
  "/dashboard",
  "/patientJourneyInsights",
  "/pmsStatistics",
  "/rankings",
  "/tasks",
];

export const PageWrapper: React.FC<PageWrapperProps> = ({ children }) => {
  const { onboardingCompleted, billingStatus } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isLockedOut = billingStatus?.isLockedOut ?? false;
  const isOnSettingsPage = location.pathname.startsWith("/settings");

  // Redirect locked-out users to /settings (the only page they can access)
  useEffect(() => {
    if (isLockedOut && !isOnSettingsPage) {
      navigate("/settings/billing", { replace: true });
    }
  }, [isLockedOut, isOnSettingsPage, navigate]);

  // T21: Ticker + refresh button only render on dashboard routes.
  const isDashboardRoute = useMemo(
    () =>
      DASHBOARD_ROUTE_PREFIXES.some((prefix) =>
        location.pathname.startsWith(prefix),
      ),
    [location.pathname],
  );

  // T21: Refresh handler — invalidate every TanStack query so the dashboard
  // re-fetches dashboard metrics, tasks, ranking, PMS, form submissions, etc.
  // in one click. Cheap because TanStack Query dedupes identical keys.
  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  return (
    <div className="bg-alloro-bg min-h-screen font-body text-alloro-navy relative overflow-x-hidden selection:bg-alloro-orange selection:text-white">
      <TopBar onRefresh={handleRefresh} />
      {isDashboardRoute && <Ticker items={[]} />}

      <main className="flex-1 w-full min-h-screen flex flex-col">
        {/* Onboarding-incomplete banner is now rendered per-page (Focus dashboard
            uses SetupProgressBanner). The lockout + subscribe banners below
            remain global because they apply to every authenticated page. */}

        {/* Lockout Banner — persistent top bar when account is locked */}
        {isLockedOut && (
          <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 py-3 sm:py-3.5 shrink-0">
            <div className="flex items-center gap-3 max-w-5xl mx-auto">
              <Lock size={14} className="text-red-600 shrink-0" />
              <p className="flex-1 text-xs sm:text-[13px] text-red-800 font-medium leading-snug">
                Your account is locked. Add a payment method to restore full access.
              </p>
              {!isOnSettingsPage && (
                <button
                  onClick={() => navigate("/settings/billing")}
                  className="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shrink-0 whitespace-nowrap shadow-sm"
                >
                  <span className="hidden sm:inline">Go to Settings</span>
                  <span className="sm:hidden">Fix</span>
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Subscribe Banner — persistent for admin-granted users without Stripe */}
        {!isLockedOut && billingStatus?.isAdminGranted && !isOnSettingsPage && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3 sm:py-3.5 shrink-0">
            <div className="flex items-center gap-3 max-w-5xl mx-auto">
              <CreditCard size={14} className="text-amber-600 shrink-0" />
              <p className="flex-1 text-xs sm:text-[13px] text-amber-800 font-medium leading-snug">
                You haven't subscribed to Alloro yet.{" "}
                <span className="hidden sm:inline">Head to Settings › Billing to get started.</span>
              </p>
              <button
                onClick={() => navigate("/settings/billing")}
                className="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-alloro-orange hover:bg-[#c45a47] rounded-lg transition-colors shrink-0 whitespace-nowrap shadow-sm"
              >
                Subscribe
                <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        )}
        {children}
      </main>

      <MobileBottomNav onboardingCompleted={onboardingCompleted} />
      <LocationTransitionOverlay />
    </div>
  );
};
