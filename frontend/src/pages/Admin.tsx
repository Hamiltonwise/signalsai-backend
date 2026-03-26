import { Routes, Route, Navigate } from "react-router-dom";
import {
  AdminLayout,
  PMSAutomationCards,
  AgentInsights,
} from "../components/Admin";
import HQRouter from "./admin/HQRouter";
import { AdminGuard } from "@/components/Admin/AdminGuard";
import AIDataInsightsList from "./admin/AIDataInsightsList";
import AIDataInsightsDetail from "./admin/AIDataInsightsDetail";
import AppLogs from "./admin/AppLogs";
import { OrganizationManagement } from "./admin/OrganizationManagement";
import AgentOutputsList from "./admin/AgentOutputsList";
import OrganizationDetail from "./admin/OrganizationDetail";
import PracticeStory from "./admin/PracticeStory";
import WebsitesList from "./admin/WebsitesList";
import WebsiteDetail from "./admin/WebsiteDetail";
import TemplatesList from "./admin/TemplatesList";
import TemplateDetail from "./admin/TemplateDetail";
import ImportDetail from "./admin/ImportDetail";
import PageEditor from "./admin/PageEditor";
import LayoutEditor from "./admin/LayoutEditor";
import AdminSettings from "./admin/AdminSettings";
import Schedules from "./admin/Schedules";
import DreamTeam from "./admin/DreamTeam";
import YourMarket from "./admin/YourMarket";
import MindDetail from "./admin/MindDetail";
import AlloroPostsDocs from "./admin/AlloroPostsDocs";
import BatchCheckup from "./admin/BatchCheckup";
import AccountOverview from "./admin/AccountOverview";
import CaseStudies from "./admin/CaseStudies";
import AAEDashboard from "./admin/AAEDashboard";
import PitchRepTracker from "./admin/PitchRepTracker";
import IntelligencePanel from "./admin/IntelligencePanel";

function WebDevEngine() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
      <p className="text-lg font-semibold text-gray-700">
        Alloro WebDev Engine
      </p>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        Websites, landing pages, and deployment automations will live in this
        workspace.
      </p>
    </div>
  );
}

function SentryTest() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="text-lg font-semibold text-gray-700">Sentry Test</p>
      <button
        className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        onClick={() => {
          throw new Error("This is your first error!");
        }}
      >
        Break the world
      </button>
    </div>
  );
}

/** Admin layout wrapper for non-fullscreen routes */
function AdminWithLayout() {
  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<Navigate to="action-items" replace />} />
        <Route path="ai-pms-automation" element={<PMSAutomationCards />} />
        <Route path="action-items" element={<HQRouter />} />
        <Route path="agent-outputs" element={<AgentOutputsList />} />
        <Route path="ai-data-insight" element={<AgentInsights />} />
        <Route path="ai-data-insights" element={<AIDataInsightsList />} />
        <Route
          path="ai-data-insights/:agentType"
          element={<AIDataInsightsDetail />}
        />
        <Route path="webdev-engine" element={<WebDevEngine />} />
        <Route path="app-logs" element={<AppLogs />} />
        <Route
          path="organization-management"
          element={<OrganizationManagement />}
        />
        <Route path="accounts" element={<AccountOverview />} />
        <Route
          path="organizations/:id"
          element={<PracticeStory />}
        />
        <Route
          path="organizations/:id/manage"
          element={<OrganizationDetail />}
        />
        <Route
          path="organizations/:id/intelligence"
          element={<IntelligencePanel />}
        />
        <Route path="practice-ranking" element={<YourMarket />} />
        <Route path="websites" element={<WebsitesList />} />
        <Route path="websites/:id" element={<WebsiteDetail />} />
        <Route path="templates" element={<TemplatesList />} />
        <Route path="templates/imports/:id" element={<ImportDetail />} />
        <Route path="templates/:id" element={<TemplateDetail />} />
        <Route path="minds" element={<DreamTeam />} />
        <Route path="minds/:mindId" element={<MindDetail />} />
        <Route path="documentation/alloro-posts" element={<AlloroPostsDocs />} />
        <Route path="schedules" element={<Schedules />} />
        <Route path="batch-checkup" element={<BatchCheckup />} />
        <Route path="case-studies" element={<CaseStudies />} />
        <Route path="aae" element={<AAEDashboard />} />
        <Route path="pitch-reps" element={<PitchRepTracker />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="sentry-test" element={<SentryTest />} />
      </Routes>
    </AdminLayout>
  );
}

export default function Admin() {
  return (
    <AdminGuard>
      <Routes>
        {/* Full-screen editors — no AdminLayout */}
        <Route
          path="websites/:id/pages/:pageId/edit"
          element={<PageEditor />}
        />
        <Route
          path="websites/:id/layout/:field"
          element={<LayoutEditor />}
        />

        {/* All other admin routes — with AdminLayout */}
        <Route path="*" element={<AdminWithLayout />} />
      </Routes>
    </AdminGuard>
  );
}
