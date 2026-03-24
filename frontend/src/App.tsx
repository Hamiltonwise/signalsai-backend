import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient, persistOptions } from "./lib/queryClient";
import SignIn from "./pages/Signin";
import Signup from "./pages/Signup";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import NewAccountOnboarding from "./pages/NewAccountOnboarding";
import Dashboard from "./pages/Dashboard";
import DoctorDashboard from "./pages/DoctorDashboard";
import ProgressReport from "./pages/ProgressReport";
import RankingsScreen from "./pages/RankingsScreen";
import Demo from "./pages/Demo";
import BusinessClarity from "./pages/BusinessClarity";
import PartnerPortal from "./pages/partner/PartnerPortal";
import ReferralIntelligence from "./pages/ReferralIntelligence";
import Admin from "./pages/Admin";
import { Settings } from "./pages/Settings";
import { IntegrationsRoute } from "./pages/settings/IntegrationsRoute";
import { UsersRoute } from "./pages/settings/UsersRoute";
import { BillingRoute } from "./pages/settings/BillingRoute";
import { AccountRoute } from "./pages/settings/AccountRoute";
import { DFYWebsite } from "./pages/DFYWebsite";
import { Notifications } from "./pages/Notifications";
import Help from "./pages/Help";
import OnboardingPaymentSuccess from "./pages/OnboardingPaymentSuccess";
import OnboardingPaymentCancelled from "./pages/OnboardingPaymentCancelled";
import { PageWrapper } from "./components/PageWrapper";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { GBPProvider } from "./contexts/GBPContext.tsx";
import { ClarityProvider } from "./contexts/ClarityContext.tsx";
import { SessionProvider } from "./contexts/SessionProvider.tsx";
import { LocationProvider } from "./contexts/LocationProvider.tsx";
import { OnboardingWizardProvider } from "./contexts/OnboardingWizardContext.tsx";
import { WizardController } from "./components/onboarding-wizard";
import {
  SetupProgressProvider,
  SetupProgressWizard,
} from "./components/SetupProgressWizard";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import { ConfirmProvider } from "./components/ui/ConfirmModal";
import { DFYRoute } from "./components/DFYRoute";
import { PilotHandler } from "./components/PilotHandler";
import { PilotBanner } from "./components/Admin/PilotBanner";
import CheckupLayout from "./pages/checkup/CheckupLayout";
import EntryScreen from "./pages/checkup/EntryScreen";
import ScanningTheater from "./pages/checkup/ScanningTheater";
import ResultsScreen from "./pages/checkup/ResultsScreen";
import BuildingScreen from "./pages/checkup/BuildingScreen";

// AppProviders wrapper - now used as a layout route to avoid remounting on navigation
function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <LocationProvider>
        <GBPProvider>
          <ClarityProvider>{children}</ClarityProvider>
        </GBPProvider>
      </LocationProvider>
    </SessionProvider>
  );
}

// Layout component for protected routes with AppProviders
// This keeps providers mounted across route changes, preventing duplicate API calls
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <AppProviders>
        <PageWrapper>
          <Outlet />
        </PageWrapper>
      </AppProviders>
    </ProtectedRoute>
  );
}

// Layout for admin routes (no PageWrapper)
function AdminLayout() {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  );
}

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
    <BrowserRouter>
      <PilotHandler />
      <AuthProvider>
        <OnboardingWizardProvider>
          <SetupProgressProvider>
            <ConfirmProvider>
            <Toaster position="top-right" />
            <WizardController />
            <SetupProgressWizard />
            <Routes>
              {/* Public checkup flow — no auth required */}
              <Route path="/checkup" element={<CheckupLayout />}>
                <Route index element={<EntryScreen />} />
                <Route path="scanning" element={<ScanningTheater />} />
                <Route path="results" element={<ResultsScreen />} />
                <Route path="building" element={<BuildingScreen />} />
              </Route>

              {/* Public demo — no auth required */}
              <Route path="/demo" element={<Demo />} />

              {/* Business Clarity content page — SEO, no auth */}
              <Route path="/business-clarity" element={<BusinessClarity />} />

              {/* Partner Portal — auth required, own layout */}
              <Route
                path="/partner"
                element={
                  <ProtectedRoute>
                    <PartnerPortal />
                  </ProtectedRoute>
                }
              />

              <Route path="/" element={<Navigate to="/signin" replace />} />
              <Route
                path="/signin"
                element={
                  <PublicRoute>
                    <SignIn />
                  </PublicRoute>
                }
              />
              <Route
                path="/signup"
                element={
                  <PublicRoute>
                    <Signup />
                  </PublicRoute>
                }
              />
              <Route
                path="/verify-email"
                element={<VerifyEmail />}
              />
              <Route
                path="/forgot-password"
                element={
                  <PublicRoute>
                    <ForgotPassword />
                  </PublicRoute>
                }
              />
              {/* GBP connection onboarding - protected but without PageWrapper (standalone page) */}
              <Route
                path="/new-account-onboarding"
                element={
                  <ProtectedRoute>
                    <NewAccountOnboarding />
                  </ProtectedRoute>
                }
              />
              {/* Onboarding payment return pages — protected, standalone (no PageWrapper) */}
              <Route
                path="/onboarding/payment-success"
                element={
                  <ProtectedRoute>
                    <OnboardingPaymentSuccess />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/onboarding/payment-cancelled"
                element={
                  <ProtectedRoute>
                    <OnboardingPaymentCancelled />
                  </ProtectedRoute>
                }
              />

              {/* Protected routes with shared AppProviders - prevents remounting on navigation */}
              <Route element={<ProtectedLayout />}>
                <Route path="/dashboard" element={<DoctorDashboard />} />
                <Route path="/dashboard/progress" element={<ProgressReport />} />
                <Route path="/dashboard/rankings" element={<RankingsScreen />} />
                <Route path="/dashboard/referrals" element={<ReferralIntelligence />} />
                <Route path="/patientJourneyInsights" element={<Dashboard />} />
                <Route path="/pmsStatistics" element={<Dashboard />} />
                <Route path="/tasks" element={<Dashboard />} />
                <Route path="/rankings" element={<Dashboard />} />
                <Route
                  path="/dfy/website"
                  element={
                    <DFYRoute>
                      <DFYWebsite />
                    </DFYRoute>
                  }
                />
                <Route path="/settings" element={<Settings />}>
                  <Route index element={<Navigate to="integrations" replace />} />
                  <Route path="integrations" element={<IntegrationsRoute />} />
                  <Route path="users" element={<UsersRoute />} />
                  <Route path="billing" element={<BillingRoute />} />
                  <Route path="account" element={<AccountRoute />} />
                </Route>
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/help" element={<Help />} />
              </Route>

              {/* Admin routes with AppProviders but no PageWrapper */}
              <Route element={<AdminLayout />}>
                <Route path="/admin/*" element={<Admin />} />
              </Route>
            </Routes>
            <PilotBanner />
            </ConfirmProvider>
          </SetupProgressProvider>
        </OnboardingWizardProvider>
      </AuthProvider>
    </BrowserRouter>
    <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </PersistQueryClientProvider>
  );
}

export default App;
