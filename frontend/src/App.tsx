import React from "react";
import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
const ReactQueryDevtools = import.meta.env.DEV
  ? React.lazy(() => import("@tanstack/react-query-devtools").then(m => ({ default: m.ReactQueryDevtools })))
  : null;
import { queryClient, persistOptions } from "./lib/queryClient";
import { Loader2 } from "lucide-react";

// --- Critical path imports (NOT lazy-loaded) ---
import SignIn from "./pages/Signin";
import Signup from "./pages/Signup";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import DoctorDashboard from "./pages/DoctorDashboard";
import NotFound from "./pages/NotFound";
import CheckupLayout from "./pages/checkup/CheckupLayout";
import EntryScreen from "./pages/checkup/EntryScreen";
import ScanningTheater from "./pages/checkup/ScanningTheater";
import ResultsScreen from "./pages/checkup/ResultsScreen";
import BuildingScreen from "./pages/checkup/BuildingScreen";
import ColleagueShare from "./pages/checkup/ColleagueShare";

// --- Lazy-loaded page imports ---
const NewAccountOnboarding = React.lazy(() => import("./pages/NewAccountOnboarding"));
const ProgressReport = React.lazy(() => import("./pages/ProgressReport"));
const RankingsScreen = React.lazy(() => import("./pages/RankingsScreen"));
const Demo = React.lazy(() => import("./pages/Demo"));
const BusinessClarity = React.lazy(() => import("./pages/BusinessClarity"));
const PartnerPortal = React.lazy(() => import("./pages/partner/PartnerPortal"));
const ReferralIntelligence = React.lazy(() => import("./pages/ReferralIntelligence"));
const Admin = React.lazy(() => import("./pages/Admin"));
const Settings = React.lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })));
const IntegrationsRoute = React.lazy(() => import("./pages/settings/IntegrationsRoute").then(m => ({ default: m.IntegrationsRoute })));
const UsersRoute = React.lazy(() => import("./pages/settings/UsersRoute").then(m => ({ default: m.UsersRoute })));
const BillingRoute = React.lazy(() => import("./pages/settings/BillingRoute").then(m => ({ default: m.BillingRoute })));
const AccountRoute = React.lazy(() => import("./pages/settings/AccountRoute").then(m => ({ default: m.AccountRoute })));
const DFYWebsite = React.lazy(() => import("./pages/DFYWebsite").then(m => ({ default: m.DFYWebsite })));
const Notifications = React.lazy(() => import("./pages/Notifications").then(m => ({ default: m.Notifications })));
const Help = React.lazy(() => import("./pages/Help"));
const OnboardingPaymentSuccess = React.lazy(() => import("./pages/OnboardingPaymentSuccess"));
const OnboardingPaymentCancelled = React.lazy(() => import("./pages/OnboardingPaymentCancelled"));
const AAELanding = React.lazy(() => import("./pages/AAELanding"));
const ThankYou = React.lazy(() => import("./pages/ThankYou"));
const WhatIsBusinessClarity = React.lazy(() => import("./pages/content/WhatIsBusinessClarity"));
const EndodontistMarketing = React.lazy(() => import("./pages/content/EndodontistMarketing"));
const GPReferralIntelligenceContent = React.lazy(() => import("./pages/content/GPReferralIntelligence"));
const PatientPathWebsite = React.lazy(() => import("./pages/dashboard/PatientPathWebsite"));
const ReviewRequests = React.lazy(() => import("./pages/dashboard/ReviewRequests"));
const DashboardSettings = React.lazy(() => import("./pages/dashboard/DashboardSettings"));
const IntelligenceDashboard = React.lazy(() => import("./pages/dashboard/IntelligenceDashboard"));
const AnniversaryReport = React.lazy(() => import("./pages/dashboard/AnniversaryReport"));
const GPDiscoveryPage = React.lazy(() => import("./pages/partner/GPDiscoveryPage"));
const CampaignIntelligence = React.lazy(() => import("./pages/partner/CampaignIntelligence"));
const Changelog = React.lazy(() => import("./pages/Changelog"));
const ReferralProgram = React.lazy(() => import("./pages/ReferralProgram"));
const MessagesPage = React.lazy(() => import("./pages/Messages").then(m => ({ default: m.Messages })));

// --- Marketing site rebuild (WO-13) ---
const MarketingHome = React.lazy(() => import("./pages/marketing/HomePage"));
const HowItWorks = React.lazy(() => import("./pages/marketing/HowItWorks"));
const WhoItsFor = React.lazy(() => import("./pages/marketing/WhoItsFor"));
const PricingPage = React.lazy(() => import("./pages/marketing/PricingPage"));
const StoryPage = React.lazy(() => import("./pages/marketing/Story"));
const BlogPage = React.lazy(() => import("./pages/marketing/Blog"));
const DynamicArticle = React.lazy(() => import("./pages/content/DynamicArticle"));
const BlogPost1 = React.lazy(() => import("./pages/marketing/blog/TheSecondJobProblem"));
const BlogPost2 = React.lazy(() => import("./pages/marketing/blog/GoogleBusinessProfileScore"));
const BlogPost3 = React.lazy(() => import("./pages/marketing/blog/WhyYourCompetitorKeepsShowingUp"));
const SharedResults = React.lazy(() => import("./pages/checkup/SharedResults"));
const ClarityCard = React.lazy(() => import("./pages/ClarityCard"));
const Compare = React.lazy(() => import("./pages/Compare"));
const LegalPracticeMarketing = React.lazy(() => import("./pages/content/LegalPracticeMarketing"));
const FinancialAdvisorMarketing = React.lazy(() => import("./pages/content/FinancialAdvisorMarketing"));
const OptometristMarketing = React.lazy(() => import("./pages/content/OptometristMarketing"));
const Locations = React.lazy(() => import("./pages/dashboard/Locations"));
// Intelligence replaced by IntelligenceDashboard (WO-8: uses /api/intelligence, not admin API)
// import About from "./pages/About"; // Not built yet
const TermsOfService = React.lazy(() => import("./pages/legal/TermsOfService"));
const PrivacyPolicy = React.lazy(() => import("./pages/legal/PrivacyPolicy"));
// import PhysicalTherapistMarketing from "./pages/content/PhysicalTherapistMarketing"; // Not built yet
const ProgrammaticPage = React.lazy(() => import("./pages/ProgrammaticPage"));
const FoundationHome = React.lazy(() => import("./pages/foundation/FoundationHome"));
const HeroesPage = React.lazy(() => import("./pages/foundation/HeroesPage"));
const FoundersPage = React.lazy(() => import("./pages/foundation/FoundersPage"));
const FoundationApply = React.lazy(() => import("./pages/foundation/FoundationApply"));

const PatientPathPreview = React.lazy(() => import("./pages/dashboard/PatientPathPreview"));
const MarketPage = React.lazy(() => import("./pages/market/MarketPage"));
const TasksPage = React.lazy(() => import("./pages/TasksPage"));
const ProductPage = React.lazy(() => import("./pages/marketing/ProductPage"));
const RisePage = React.lazy(() => import("./pages/marketing/RisePage"));
const AboutPage = React.lazy(() => import("./pages/marketing/AboutPage"));
const OwnerProfile = React.lazy(() => import("./pages/OwnerProfile"));

// HQ pages (rendered inside CF layout for unified sidebar experience)
const HQCommand = React.lazy(() => import("./pages/admin/HQRouter"));
const HQOrganizations = React.lazy(() => import("./pages/admin/OrganizationManagement").then(m => ({ default: m.OrganizationManagement })));
const HQBoard = React.lazy(() => import("./pages/admin/BoardChat"));

// --- Non-page imports (always loaded) ---
import { PageWrapper } from "./components/PageWrapper";
import { ReportIssue } from "./components/ReportIssue";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { VocabularyProvider } from "./contexts/vocabularyContext.tsx";
import { GBPProvider } from "./contexts/GBPContext.tsx";
import { ClarityProvider } from "./contexts/ClarityContext.tsx";
import { SessionProvider } from "./contexts/SessionProvider.tsx";
import { LocationProvider } from "./contexts/LocationProvider.tsx";
import { OnboardingWizardProvider } from "./contexts/OnboardingWizardContext.tsx";
import { TailorProvider } from "./contexts/TailorContext.tsx";
const WizardController = React.lazy(() => import("./components/onboarding-wizard").then(m => ({ default: m.WizardController })));
import { SetupProgressProvider } from "./components/SetupProgressWizard";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import { ConfirmProvider } from "./components/ui/ConfirmModal";
import { DFYRoute } from "./components/DFYRoute";
import { PilotHandler } from "./components/PilotHandler";
// PilotBanner removed -- no floating overlays
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./contexts/ToastContext";
import ScrollToTop from "./components/ScrollToTop";
import { EnvironmentBanner } from "./components/EnvironmentBanner";

/** Loading fallback for lazy-loaded routes */
function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="text-sm font-medium text-gray-500">Loading...</span>
      </div>
    </div>
  );
}

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
          <React.Suspense fallback={<LoadingFallback />}>
            <Outlet />
          </React.Suspense>
        </PageWrapper>
      </AppProviders>
    </ProtectedRoute>
  );
}

// Layout for admin routes (no PageWrapper)
function AdminLayout() {
  return (
    <AppProviders>
      <React.Suspense fallback={<LoadingFallback />}>
        <Outlet />
      </React.Suspense>
    </AppProviders>
  );
}

/** Wraps children in ErrorBoundary keyed by pathname so navigation resets error state */
function ErrorBoundaryWithReset({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
    <ToastProvider>
    <BrowserRouter>
      <EnvironmentBanner />
      <ScrollToTop />
      <PilotHandler />
      <AuthProvider>
        <VocabularyProvider>
        <TailorProvider>
        <OnboardingWizardProvider>
          <SetupProgressProvider>
            <ConfirmProvider>
            <Toaster position="top-right" />
            <React.Suspense fallback={null}><WizardController /></React.Suspense>
            {/* SetupProgressWizard removed -- Apple rule: if the product needs a floating help button, the design failed */}
            <ErrorBoundaryWithReset>
            <React.Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Public checkup flow — no auth required */}
              <Route path="/checkup" element={<CheckupLayout />}>
                <Route index element={<EntryScreen />} />
                <Route path="scanning" element={<ScanningTheater />} />
                <Route path="results" element={<ResultsScreen />} />
                <Route path="building" element={<BuildingScreen />} />
              </Route>
              <Route path="/checkup/shared/:shareId" element={<SharedResults />} />
              <Route path="/checkup/share" element={<ColleagueShare />} />
              <Route path="/clarity/:id" element={<ClarityCard />} />

              {/* Public demo — no auth required */}
              <Route path="/demo" element={<Demo />} />

              {/* Business Clarity content page — SEO, no auth */}
              <Route path="/business-clarity" element={<BusinessClarity />} />
              <Route path="/business-clarity/what-is" element={<WhatIsBusinessClarity />} />
              <Route path="/endodontist-marketing" element={<EndodontistMarketing />} />
              <Route path="/gp-referral-intelligence" element={<GPReferralIntelligenceContent />} />

              {/* SEO content pages — vertical marketing */}
              <Route path="/law-firm-marketing" element={<LegalPracticeMarketing />} />
              <Route path="/financial-advisor-marketing" element={<FinancialAdvisorMarketing />} />
              <Route path="/optometrist-marketing" element={<OptometristMarketing />} />
              {/* <Route path="/physical-therapist-marketing" element={<PhysicalTherapistMarketing />} /> -- not built yet */}

              {/* Public pages — no auth */}
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/changelog" element={<Changelog />} />
              <Route path="/referral-program" element={<ReferralProgram />} />
              <Route path="/compare" element={<Compare />} />
              {/* <Route path="/about" element={<About />} /> -- not built yet */}
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />

              {/* Heroes & Founders Foundation — no auth (WO-11) */}
              <Route path="/foundation" element={<FoundationHome />} />
              <Route path="/foundation/heroes" element={<HeroesPage />} />
              <Route path="/foundation/founders" element={<FoundersPage />} />
              <Route path="/foundation/apply" element={<FoundationApply />} />

              {/* AAE conference pages — no auth */}
              <Route path="/aae" element={<AAELanding />} />
              <Route path="/thank-you" element={<ThankYou />} />

              {/* Partner Portal — auth required, own layout */}
              <Route
                path="/partner"
                element={
                  <ProtectedRoute>
                    <PartnerPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/partner/campaigns"
                element={
                  <ProtectedRoute>
                    <CampaignIntelligence />
                  </ProtectedRoute>
                }
              />

              {/* Marketing site (WO-13 + WO-27) */}
              <Route path="/" element={<MarketingHome />} />
              <Route path="/product" element={<ProductPage />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/who-its-for" element={<WhoItsFor />} />
              <Route path="/rise" element={<RisePage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/story" element={<StoryPage />} />
              <Route path="/blog" element={<BlogPage />} />
              <Route path="/blog/the-second-job-problem" element={<BlogPost1 />} />
              <Route path="/blog/google-business-profile-score" element={<BlogPost2 />} />
              <Route path="/blog/why-your-competitor-keeps-showing-up" element={<BlogPost3 />} />
              <Route path="/blog/:slug" element={<DynamicArticle />} />
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
              {/* Owner Profile -- Lemonis Protocol onboarding questions (WO-50) */}
              <Route
                path="/owner-profile"
                element={
                  <ProtectedRoute>
                    <OwnerProfile />
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
                <Route path="/dashboard/reviews" element={<ReviewRequests />} />
                <Route path="/dashboard/settings" element={<DashboardSettings />} />
                <Route path="/dashboard/website" element={<PatientPathWebsite />} />
                <Route path="/dashboard/intelligence" element={<IntelligenceDashboard />} />
                <Route path="/dashboard/anniversary" element={<AnniversaryReport />} />
                <Route path="/dashboard/locations" element={<Locations />} />
                <Route path="/dashboard/patientpath-preview" element={<PatientPathPreview />} />
                <Route path="/dashboard/refer/:orgSlug?" element={<GPDiscoveryPage />} />
                <Route path="/patientJourneyInsights" element={<Navigate to="/dashboard/referrals" replace />} />
                <Route path="/pmsStatistics" element={<Navigate to="/dashboard/referrals" replace />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/rankings" element={<Navigate to="/dashboard/rankings" replace />} />
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
                <Route path="/messages" element={<React.Suspense fallback={null}><MessagesPage /></React.Suspense>} />
                {/* HQ routes inside CF layout -- same sidebar, no jarring layout switch */}
                <Route path="/hq" element={<Navigate to="/hq/command" replace />} />
                <Route path="/hq/command" element={<React.Suspense fallback={null}><HQCommand /></React.Suspense>} />
                <Route path="/hq/organizations" element={<React.Suspense fallback={null}><HQOrganizations /></React.Suspense>} />
                <Route path="/hq/board" element={<React.Suspense fallback={null}><HQBoard /></React.Suspense>} />
                <Route path="/board" element={<React.Suspense fallback={null}><HQBoard /></React.Suspense>} />
              </Route>

              {/* Admin routes with AppProviders but no PageWrapper */}
              <Route element={<AdminLayout />}>
                <Route path="/admin/*" element={<Admin />} />
              </Route>

              {/* Programmatic city pages: /market/:specialty/:city */}
              <Route path="/market/:specialty/:city" element={<MarketPage />} />

              {/* Programmatic SEO pages: /[specialty]-[city]-[state] */}
              <Route path="/:pageSlug" element={<ProgrammaticPage />} />

              {/* 404 catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </React.Suspense>
            {/* PilotBanner removed -- no floating overlays */}
            </ErrorBoundaryWithReset>
            </ConfirmProvider>
          </SetupProgressProvider>
        </OnboardingWizardProvider>
        </TailorProvider>
        </VocabularyProvider>
        <ReportIssue />
      </AuthProvider>
    </BrowserRouter>
    </ToastProvider>
    {ReactQueryDevtools && <React.Suspense fallback={null}><ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" /></React.Suspense>}
    </PersistQueryClientProvider>
  );
}

export default App;
