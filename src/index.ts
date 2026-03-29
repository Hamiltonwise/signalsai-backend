import dotenv from "dotenv";
dotenv.config();

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
});

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";

import { Router } from "express";

import googleAuthRoutes from "./routes/googleauth";
import gbpRoutes from "./routes/gbp";
import {
  testConnection,
  healthCheck,
  closeConnection,
} from "./database/connection";
import clarityRoutes from "./routes/clarity";
import taskRoutes from "./routes/tasks";
import authRoutes from "./routes/auth";
import otpRoutes from "./routes/auth-otp";
import authPasswordRoutes from "./routes/auth-password";
import pmsRoutes from "./routes/pms";
import onboardingRoutes from "./routes/onboarding";
import ragRoutes from "./routes/rag";
import agentRoutes from "./routes/agentsV2";
import notificationsRoutes from "./routes/notifications";
import adminAgentInsightsRoutes from "./routes/adminAgentInsights";
import appLogsRoutes from "./routes/appLogs";
import settingsRoutes from "./routes/settings";
import profileRoutes from "./routes/profile";
import organizationsRoutes from "./routes/admin/organizations";
import adminAuthRoutes from "./routes/admin/auth";
import adminAgentOutputsRoutes from "./routes/admin/agentOutputs";
import adminWebsitesRoutes from "./routes/admin/websites";
import adminMediaRoutes from "./routes/admin/media";
import adminSettingsRoutes from "./routes/admin/settings";
import adminSchedulesRoutes from "./routes/admin/schedules";
import adminSignalRoutes from "./routes/admin/signal";
import adminDreamTeamRoutes from "./routes/admin/dreamTeam";
import adminBatchCheckupRoutes from "./routes/admin/batchCheckup";
import adminFirefliesRoutes from "./routes/admin/firefliesWebhook";
import adminReviewRoutes from "./routes/admin/reviews";
import milestoneRoutes from "./routes/admin/milestones";
import referralIntelligenceRoutes from "./routes/referralIntelligence";
import intelligenceIntakeRoutes from "./routes/admin/intelligenceIntake";
import intelligencePanelRoutes from "./routes/admin/intelligencePanel";
import rankingsSnapshotRoutes from "./routes/admin/rankingsSnapshot";
import patientpathBuildRoutes from "./routes/admin/patientpathBuild";
import demoLoginRoutes from "./routes/demoLogin";
import practiceRankingRoutes from "./routes/practiceRanking";
import supportRoutes from "./routes/support";
import scraperRoutes from "./routes/scraper";
import placesRoutes from "./routes/places";
import checkupRoutes from "./routes/checkup";
import progressReportRoutes from "./routes/progressReport";
import vocabularyRoutes from "./routes/vocabulary";
import partnerRoutes from "./routes/partner";
import rankingsIntelligenceRoutes from "./routes/rankingsIntelligence";
import reviewRequestRoutes from "./routes/reviewRequests";
import csAgentRoutes from "./routes/csAgent";
import ttfvRoutes from "./routes/ttfv";
import auditRoutes from "./routes/audit";
import importsRoutes from "./routes/imports";
import websiteContactRoutes from "./routes/websiteContact";
import userWebsiteRoutes from "./routes/user/website";
import userPatientpathRoutes from "./routes/user/patientpath";
import locationRoutes from "./routes/locations";
import mindsRoutes from "./routes/minds";
import mindsPublicApiRoutes from "./routes/mindsPublicApi";
import skillsPublicApiRoutes from "./routes/skillsPublicApi";
import internalApiRoutes from "./routes/internalApi";
import billingRoutes from "./routes/billing";
import founderSettingsRoutes from "./routes/admin/founderSettings";
import clientHealthRoutes from "./routes/admin/clientHealth";
import dashboardContextRoutes from "./routes/user/dashboardContext";
import gbpAuthRoutes from "./routes/auth/gbp";
import oneActionCardRoutes from "./routes/user/oneActionCard";
import reviewDraftRoutes from "./routes/user/reviewDrafts";
import streakRoutes from "./routes/user/streaks";
import ownerProfileRoutes from "./routes/user/ownerProfile";
import milestoneCardRoutes from "./routes/user/milestoneCards";
import referralThankYouRoutes from "./routes/user/referralThankYou";
import campaignRoutes from "./routes/partner/campaigns";
import gpDiscoveryUserRoutes from "./routes/user/gpDiscovery";
import userPreferencesRoutes from "./routes/user/preferences";
import adminBehavioralEventsRoutes from "./routes/admin/behavioralEvents";
import adminCaseStudiesRoutes from "./routes/admin/caseStudies";
import gpDiscoveryRoutes from "./routes/partner/gpDiscovery";
import billingAdminRoutes from "./routes/admin/billingAdmin";
import userExportRoutes from "./routes/user/export";
import healthRoutes from "./routes/health";
import adminSearchRoutes from "./routes/admin/search";
import adminUserManagementRoutes from "./routes/admin/userManagement";
import adminFeatureFlagRoutes from "./routes/admin/featureFlags";
import adminWebhookHealthRoutes from "./routes/admin/webhookHealth";
import adminAuditLogRoutes from "./routes/admin/auditLog";
import mailgunInboundRoutes from "./routes/webhooks/mailgunInbound";
import adminKnowledgeLatticeRoutes from "./routes/admin/knowledgeLattice";
import morningBriefingRoutes from "./routes/admin/morningBriefing";
import seoRoutes from "./routes/seo";
import foundationRoutes from "./routes/foundation";
import intelligenceRoutes from "./routes/intelligence";
import { billingGateMiddleware } from "./middleware/billingGate";
import {
  isAllowedCustomDomain,
  startCustomDomainCacheRefresh,
} from "./middleware/corsCustomDomains";

const app = express();
app.set("trust proxy", 1);
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

// Security headers
if (isProd) {
  app.use((_req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
}
const router = Router();

// CORS middleware for development
app.use((req, res, next) => {
  // Allow requests from localhost development servers
  const allowedOrigins = [
    "http://localhost:3003",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:5050",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:7777",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:5050",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:7777",
    "https://audit.getalloro.com",
    "https://n8n.getalloro.com",
    "https://getalloro.com",
    "https://www.getalloro.com",
  ];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (
    origin &&
    /\.sites\.(getalloro\.com|localhost:7777)$/.test(origin)
  ) {
    // Allow rendered site subdomains (e.g. bright-dental.sites.getalloro.com)
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (origin && isAllowedCustomDomain(origin)) {
    // Allow verified custom domains (e.g. www.brightdental.com)
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, x-scraper-key",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Stripe webhook needs raw body for signature verification — mount BEFORE JSON parser
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));

// Add JSON body parser middleware with increased limit for large PMS data
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Database health check endpoint (legacy -- kept for backward compat)
app.get("/api/health/db", async (req, res) => {
  const health = await healthCheck();
  res.status(health.status === "healthy" ? 200 : 500).json(health);
});

// Comprehensive health checks: GET /api/health + GET /api/health/detailed
app.use("/api/health", healthRoutes);

// Sentry test endpoint — throws an error to verify Sentry is capturing
app.get("/api/sentry-test", () => {
  throw new Error("Sentry backend test error!");
});

// Billing gate — blocks locked-out orgs from protected routes (self-sufficient JWT parsing)
app.use(billingGateMiddleware);

app.use(router);
app.use("/api/gbp", gbpRoutes);
app.use("/api/clarity", clarityRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth/otp", otpRoutes);
app.use("/api/auth", authPasswordRoutes);
app.use("/api/pms", pmsRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/admin/agent-insights", adminAgentInsightsRoutes);
app.use("/api/admin/app-logs", appLogsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin/organizations", organizationsRoutes);
app.use("/api/admin/agent-outputs", adminAgentOutputsRoutes);
app.use("/api/admin/websites", adminWebsitesRoutes);
app.use("/api/admin/websites/:projectId/media", adminMediaRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin/schedules", adminSchedulesRoutes);
app.use("/api/admin/signal", adminSignalRoutes);
app.use("/api/admin/dream-team", adminDreamTeamRoutes);
app.use("/api/admin/batch-checkup", adminBatchCheckupRoutes);
app.use("/api/admin", adminFirefliesRoutes); // Fireflies webhook + dream team tasks
app.use("/api/admin/reviews", adminReviewRoutes); // Review notifications + AI responses
app.use("/api", milestoneRoutes); // Milestone notifications (admin + client routes)
app.use("/api/referral-intelligence", referralIntelligenceRoutes); // GP referral intelligence
app.use("/api/admin/intelligence", intelligenceIntakeRoutes); // Founder Mode intelligence intake
app.use("/api/admin/intelligence", intelligencePanelRoutes); // WO-8: SEO/AEO/CRO panel endpoints
app.use("/api/admin", rankingsSnapshotRoutes); // WO31/33: rankings snapshot + Monday email manual triggers
app.use("/api/admin/patientpath", patientpathBuildRoutes); // WO19: PatientPath build pipeline
app.use("/api/demo", demoLoginRoutes); // WO-DEMO: auto-login for AAE demo
app.use("/api/admin/practice-ranking", practiceRankingRoutes);
app.use("/api/practice-ranking", practiceRankingRoutes); // Client-facing endpoint for /latest
app.use("/api/admin", adminAuthRoutes);
app.use("/api/support", supportRoutes); // Help form / support inquiries
app.use("/api/scraper", scraperRoutes); // Website scraper for n8n webhooks
app.use("/api/places", placesRoutes); // Google Places API for GBP search
app.use("/api/checkup", checkupRoutes); // Free Referral Base Checkup analysis
app.use("/api/progress-report", progressReportRoutes); // 365-day progress report
app.use("/api/org", vocabularyRoutes); // Vocabulary config per org
app.use("/api/vocabulary", vocabularyRoutes); // Vocabulary defaults (public)
app.use("/api/partner", partnerRoutes); // Partner Portal API
app.use("/api/rankings-intelligence", rankingsIntelligenceRoutes); // Weekly ranking snapshots + drift
app.use("/api/review-requests", reviewRequestRoutes); // Post-appointment review generation
app.use("/api/cs-agent", csAgentRoutes); // Account-aware Claude chat for doctors
app.use("/api/org", ttfvRoutes); // TTFV sensor + billing prompt
app.use("/api/audit", auditRoutes); // Audit process tracking for leadgen tool
app.use("/api/imports", importsRoutes); // Public file serving for self-hosted imports
app.use("/api/websites", websiteContactRoutes); // Public contact form for rendered sites
app.use("/api/user/website", userWebsiteRoutes); // User website management (DFY tier)
app.use("/api/user/patientpath", userPatientpathRoutes); // PatientPath build status for breadcrumb
app.use("/api/locations", locationRoutes); // Location management for multi-location orgs
app.use("/api/admin/minds", mindsRoutes); // Minds MVP — AI chatbot profiles with knowledge sync
app.use("/api/minds", mindsPublicApiRoutes); // Public skill/portal API
app.use("/api/skills", skillsPublicApiRoutes); // Public skill portal API
app.use("/api/internal", internalApiRoutes); // Internal API for n8n workers
app.use("/api/billing", billingRoutes); // Stripe billing & subscription management
app.use("/api/founder/settings", founderSettingsRoutes); // Founder Mode personal settings
app.use("/api/admin/client-health", clientHealthRoutes); // WO-T5: CS Pulse health grid for IntegratorView
app.use("/api/user/dashboard-context", dashboardContextRoutes); // WO-CHECKUP-SESSION-KEY: pre-populate dashboard from checkup data
app.use("/api/auth/google", gbpAuthRoutes); // T6: GBP OAuth connect + callback
app.use("/api/user", oneActionCardRoutes); // T3: One Action Card deterministic engine
app.use("/api/user/review-drafts", reviewDraftRoutes); // WO-49: Review auto-draft responses
app.use("/api/user", streakRoutes); // WO-33: Growth/Action/Review streaks
app.use("/api/user", ownerProfileRoutes); // WO-50: Owner Profile (Lemonis Protocol)
app.use("/api/user", milestoneCardRoutes); // WO-51/52: Milestone check-in cards
app.use("/api/user", referralThankYouRoutes); // WO-47: Referral Thank-You auto-draft
app.use("/api/user", gpDiscoveryUserRoutes); // WO-56: GP Discovery outreach
app.use("/api/partner/campaigns", campaignRoutes); // WO-55: Partner Campaign Intelligence
app.use("/api/user", userPreferencesRoutes); // WO-NOTIFICATION-PREFS + WO-STRIPE-PORTAL
app.use("/api/admin/behavioral-events", adminBehavioralEventsRoutes); // WO-ADMIN-BEHAVIORAL-EVENTS: T4 SessionIntelligence + MorningBrief
app.use("/api/admin/case-studies", adminCaseStudiesRoutes); // T6: Case study CRUD + publish
app.use("/api/partner", gpDiscoveryRoutes); // T5: GP Discovery + referral form
app.use("/api/admin/billing", billingAdminRoutes); // WO-BILLING-RECOVERY: at-risk accounts
app.use("/api/user/export", userExportRoutes); // WO-EXPORT-API: rankings CSV, referrals CSV, checkup JSON
app.use("/api/admin/search", adminSearchRoutes); // WO-ADMIN-SEARCH: cross-collection search for HQ
app.use("/api/admin/users", adminUserManagementRoutes); // T6: User CRUD (GET/POST/PATCH/DELETE)
app.use("/api/admin/feature-flags", adminFeatureFlagRoutes); // T6: Feature flag management
app.use("/api/admin/webhooks", adminWebhookHealthRoutes); // T6: Webhook health monitoring
app.use("/api/admin/audit-log", adminAuditLogRoutes); // T6: Audit log viewer
app.use("/api/webhooks/mailgun", mailgunInboundRoutes); // T3: Mailgun inbound email processing
app.use("/api/admin", adminKnowledgeLatticeRoutes); // T3: Knowledge + Sentiment Lattice CRUD
app.use("/api/admin/morning-briefing", morningBriefingRoutes); // Agent: Morning Briefing daily intelligence summary
app.use("/api/seo", seoRoutes); // WO-7: Programmatic SEO pages + hub/spoke + stats
app.use("/api/foundation", foundationRoutes); // WO-11: Foundation application submissions
app.use("/api/intelligence", intelligenceRoutes); // WO-8: Practice owner intelligence dashboard

// Sentry error handler — must be after all routes and before other error handlers
Sentry.setupExpressErrorHandler(app);

if (isProd) {
  app.use(express.static(path.join(__dirname, "../public")));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });
} else {
  // ✅ FIXED — valid Express path, NOT a full URL
  app.use(
    "/", // or "*"
    createProxyMiddleware({
      target: "http://localhost:5174", // ✅ proxy target
      changeOrigin: true,
      ws: true,
    }),
  );
}

// Initialize database connection and start server
const startServer = async () => {
  try {
    // Test database connection on startup
    await testConnection();

    // Start custom domain CORS cache (refreshes every 5 min)
    startCustomDomainCacheRefresh();

    app.listen(port, () => {
      console.log(
        `🚀 Server running in ${
          isProd ? "production" : "development"
        } mode at http://localhost:${port}`,
      );
      console.log(
        `📊 Database health check: http://localhost:${port}/api/health/db`,
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Prevent crash from non-critical module load failures (e.g. sharp native binaries)
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  if (error.message?.includes("sharp")) {
    console.error(
      "Sharp module error. Image processing will be unavailable. Server continues running."
    );
    return;
  }
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server...");
  await closeConnection();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down server...");
  await closeConnection();
  process.exit(0);
});

startServer();
