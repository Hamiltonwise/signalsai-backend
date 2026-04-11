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
import { db } from "./database/connection";

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
import checkupFunnelRoutes from "./routes/admin/checkupFunnel";
import agentRunnerRoutes from "./routes/admin/agentRunner";
import adminDreamTeamRoutes from "./routes/admin/dreamTeam";
import adminFlagIssueRoutes from "./routes/admin/flagIssue";
import adminBatchCheckupRoutes from "./routes/admin/batchCheckup";
import adminFirefliesRoutes from "./routes/admin/firefliesWebhook";
import adminReviewRoutes from "./routes/admin/reviews";
import milestoneRoutes from "./routes/admin/milestones";
import claudeObservationsRoutes from "./routes/admin/claudeObservations";
import adminPasswordResetRoutes from "./routes/admin/passwordReset";
import referralIntelligenceRoutes from "./routes/referralIntelligence";
import intelligenceIntakeRoutes from "./routes/admin/intelligenceIntake";
import intelligencePanelRoutes from "./routes/admin/intelligencePanel";
import rankingsSnapshotRoutes from "./routes/admin/rankingsSnapshot";
import scoringConfigRoutes from "./routes/admin/scoringConfig";
import patientpathBuildRoutes from "./routes/admin/patientpathBuild";
import demoLoginRoutes from "./routes/demoLogin";
import bootstrapRoutes from "./routes/bootstrap";
import messagesRoutes from "./routes/messages";
import practiceRankingRoutes from "./routes/practiceRanking";
import supportRoutes from "./routes/support";
import scraperRoutes from "./routes/scraper";
import placesRoutes from "./routes/places";
import checkupRoutes from "./routes/checkup";
import progressReportRoutes from "./routes/progressReport";
import vocabularyRoutes from "./routes/vocabulary";
import partnerRoutes from "./routes/partner";
import focusKeywordsRoutes from "./routes/focusKeywords";
import hubspotRoutes from "./routes/integrations/hubspot";
import complianceRoutes from "./routes/compliance";
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
import emailPreviewRoutes from "./routes/admin/emailPreview";
import mondayPreviewRoutes from "./routes/admin/mondayPreview";
import dashboardContextRoutes from "./routes/user/dashboardContext";
import homeIntelligenceRoutes from "./routes/user/homeIntelligence";
import ozEngineRoutes from "./routes/user/ozEngine";
import gbpAuthRoutes from "./routes/auth/gbp";
import oneActionCardRoutes from "./routes/user/oneActionCard";
import reviewDraftRoutes from "./routes/user/reviewDrafts";
import championRoutes from "./routes/user/champion";
import streakRoutes from "./routes/user/streaks";
import ownerProfileRoutes from "./routes/user/ownerProfile";
import milestoneCardRoutes from "./routes/user/milestoneCards";
import activityRoutes from "./routes/user/activity";
import referralThankYouRoutes from "./routes/user/referralThankYou";
import campaignRoutes from "./routes/partner/campaigns";
import gpDiscoveryUserRoutes from "./routes/user/gpDiscovery";
import userPreferencesRoutes from "./routes/user/preferences";
import anniversaryReportRoutes from "./routes/user/anniversaryReport";
import adminBehavioralEventsRoutes from "./routes/admin/behavioralEvents";
import aaeDashboardRoutes from "./routes/admin/aaeDashboard";
import adminCaseStudiesRoutes from "./routes/admin/caseStudies";
import gpDiscoveryRoutes from "./routes/partner/gpDiscovery";
import billingAdminRoutes from "./routes/admin/billingAdmin";
import userExportRoutes from "./routes/user/export";
import userProgressReportRoutes from "./routes/user/progressReport";
import healthRoutes from "./routes/health";
import adminSearchRoutes from "./routes/admin/search";
import adminUserManagementRoutes from "./routes/admin/userManagement";
import adminFeatureFlagRoutes from "./routes/admin/featureFlags";
import experimentRoutes from "./routes/admin/experiments";
import adminWebhookHealthRoutes from "./routes/admin/webhookHealth";
import adminAuditLogRoutes from "./routes/admin/auditLog";
import mailgunInboundRoutes from "./routes/webhooks/mailgunInbound";
import adminKnowledgeLatticeRoutes from "./routes/admin/knowledgeLattice";
import morningBriefingRoutes from "./routes/admin/morningBriefing";
import adminRoadmapRoutes from "./routes/admin/roadmap";
import adminMetricsRoutes from "./routes/admin/metrics";
import adminConfigRoutes from "./routes/admin/config";
import snapshotRoutes from "./routes/snapshot";
import ceoChatRoutes from "./routes/admin/ceoChat";
import clarityMetricsRoutes from "./routes/admin/clarityMetrics";
import seoRoutes from "./routes/seo";
import foundationRoutes from "./routes/foundation";
import intelligenceRoutes from "./routes/intelligence";
import marketRoutes from "./routes/market";
import publicScoreCardRoutes from "./routes/publicScoreCard";
import sitemapRoutes from "./routes/sitemap";
import contentRoutes from "./routes/content";
import contentPublishRoutes from "./routes/admin/contentPublish";
import adminTailorRoutes from "./routes/admin/tailor";
import adminTasksRoutes from "./routes/admin/tasks";
import agentActivityRoutes from "./routes/admin/agentActivity";
import changelogRoutes from "./routes/admin/changelog";
import alloroLabsRoutes from "./routes/alloroLabs";
import personalAgentRoutes from "./routes/personalAgent";
import improvementPlanRoutes from "./routes/user/improvementPlan";
import competitorRoutes from "./routes/user/competitors";
import missionControlRoutes from "./routes/admin/missionControl";
import killSwitchRoutes from "./routes/admin/killSwitch";
import customerReadinessRoutes from "./routes/admin/customerReadiness";
import agentIdentityRoutes from "./routes/admin/agentIdentity";
import agentCanonRoutes from "./routes/admin/agentCanon";
import analyticsRoutes from "./routes/admin/analytics";
import dataExportRoutes from "./routes/user/dataExport";
import croInsightsRoutes from "./routes/user/croInsights";
import helpRoutes from "./routes/user/help";
import helpArticleRoutes from "./routes/user/helpArticles";
import mailgunEventsRoutes from "./routes/webhooks/mailgunEvents";
import dfyApprovalRoutes from "./routes/dfyApproval";
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

// Snapshot bridge — temp token-protected, read-only endpoints for Claude Web
// Enable: set SNAPSHOT_TOKEN env var. Disable: remove it.
app.use("/api/snapshot", snapshotRoutes);

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
app.use("/api/admin/ceo-chat", ceoChatRoutes);
app.use("/api/admin/clarity-metrics", clarityMetricsRoutes);
app.use("/api/admin/checkup-funnel", checkupFunnelRoutes);
app.use("/api/admin/agent", agentRunnerRoutes); // Dream Team agent runner (invoke any agent from HQ)
app.use("/api/admin/dream-team", adminDreamTeamRoutes);
app.use("/api/admin", adminFlagIssueRoutes); // Bug flag button in admin header
app.use("/api/admin/batch-checkup", adminBatchCheckupRoutes);
app.use("/api/admin", adminFirefliesRoutes); // Fireflies webhook + dream team tasks
app.use("/api/admin/reviews", adminReviewRoutes); // Review notifications + AI responses
app.use("/api/admin", adminPasswordResetRoutes); // Admin password reset (no email dependency)
app.use("/api", milestoneRoutes); // Milestone notifications (admin + client routes)
app.use("/api/admin/claude-observations", claudeObservationsRoutes); // Claude push intelligence for team dashboards
app.use("/api/referral-intelligence", referralIntelligenceRoutes); // GP referral intelligence
app.use("/api/admin/intelligence", intelligenceIntakeRoutes); // Founder Mode intelligence intake
app.use("/api/admin/intelligence", intelligencePanelRoutes); // WO-8: SEO/AEO/CRO panel endpoints
app.use("/api/admin", rankingsSnapshotRoutes); // WO31/33: rankings snapshot + Monday email manual triggers
app.use("/api/admin/scoring-config", scoringConfigRoutes); // Scoring weight config (admin panel)
app.use("/api/admin/patientpath", patientpathBuildRoutes); // WO19: PatientPath build pipeline
app.use("/api/demo", demoLoginRoutes); // WO-DEMO: auto-login for AAE demo
app.use("/api/bootstrap", bootstrapRoutes); // One-time team setup
app.use("/api/messages", messagesRoutes); // Internal team messaging
app.use("/api/admin/practice-ranking", practiceRankingRoutes);
app.use("/api/practice-ranking", practiceRankingRoutes); // Client-facing endpoint for /latest
app.use("/api/admin", adminAuthRoutes);
app.use("/api/support", supportRoutes); // Help form / support inquiries
app.use("/api/scraper", scraperRoutes); // Website scraper for n8n webhooks
app.use("/api/places", placesRoutes); // Google Places API for GBP search
app.use("/api/checkup", checkupRoutes); // Free Referral Base Checkup analysis
app.use("/api/actions", dfyApprovalRoutes); // DFY approval: one-tap approve/reject from Monday email (public endpoints)
app.use("/api/progress-report", progressReportRoutes); // 365-day progress report
app.use("/api/org", vocabularyRoutes); // Vocabulary config per org
app.use("/api/vocabulary", vocabularyRoutes); // Vocabulary defaults (public)
app.use("/api/partner", partnerRoutes); // Partner Portal API
app.use("/api/focus-keywords", focusKeywordsRoutes); // Focus keyword tracking + suggestions
app.use("/api/integrations/hubspot", hubspotRoutes); // HubSpot CRM read-only pipeline sync
app.use("/api/compliance", complianceRoutes); // Website marketing compliance scanner
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
app.use("/api/admin/email-preview", emailPreviewRoutes); // Email preview for design QA
app.use("/api/admin/monday-preview", mondayPreviewRoutes); // Monday Email HQ: preview all orgs before send
app.use("/api/user/dashboard-context", dashboardContextRoutes); // WO-CHECKUP-SESSION-KEY: pre-populate dashboard from checkup data
app.use("/api/user/home-intelligence", homeIntelligenceRoutes); // Layer 4: behavioral_events + snapshot findings for home page
app.use("/api/user/oz-engine", ozEngineRoutes); // Oz Engine: deterministic hero insight for Home page
app.use("/api/auth/google", gbpAuthRoutes); // T6: GBP OAuth connect + callback
app.use("/api/user", oneActionCardRoutes); // T3: One Action Card deterministic engine
app.use("/api/user/review-drafts", reviewDraftRoutes); // WO-49: Review auto-draft responses
app.use("/api/user", streakRoutes); // WO-33: Growth/Action/Review streaks
app.use("/api/user", ownerProfileRoutes); // WO-50: Owner Profile (Lemonis Protocol)
app.use("/api/user", milestoneCardRoutes); // WO-51/52: Milestone check-in cards
app.use("/api/user", activityRoutes); // What Alloro did this week
app.use("/api/user", referralThankYouRoutes); // WO-47: Referral Thank-You auto-draft
app.use("/api/user", gpDiscoveryUserRoutes); // WO-56: GP Discovery outreach
app.use("/api/partner/campaigns", campaignRoutes); // WO-55: Partner Campaign Intelligence
app.use("/api/user", userPreferencesRoutes); // WO-NOTIFICATION-PREFS + WO-STRIPE-PORTAL
app.use("/api/user", anniversaryReportRoutes); // U-NEW-5: Anniversary Report (shareable journey page)
app.use("/api/user", championRoutes); // Heroes & Founders Foundation: Champion Client opt-in
app.use("/api/admin/behavioral-events", adminBehavioralEventsRoutes);
app.use("/api/admin/aae-dashboard", aaeDashboardRoutes); // AAE 2026 conference war room // WO-ADMIN-BEHAVIORAL-EVENTS: T4 SessionIntelligence + MorningBrief
app.use("/api/admin/case-studies", adminCaseStudiesRoutes); // T6: Case study CRUD + publish
app.use("/api/partner", gpDiscoveryRoutes); // T5: GP Discovery + referral form
app.use("/api/admin/billing", billingAdminRoutes); // WO-BILLING-RECOVERY: at-risk accounts
app.use("/api/user", helpRoutes); // HelpButton -> dream_team_task + behavioral_event
app.use("/api/user/help-articles", helpArticleRoutes);
app.use("/api/user/export", userExportRoutes); // WO-EXPORT-API: rankings CSV, referrals CSV, checkup JSON
app.use("/api/user", userProgressReportRoutes); // Enhanced progress report data
app.use("/api/admin/search", adminSearchRoutes); // WO-ADMIN-SEARCH: cross-collection search for HQ
app.use("/api/admin/users", adminUserManagementRoutes); // T6: User CRUD (GET/POST/PATCH/DELETE)
app.use("/api/admin/feature-flags", adminFeatureFlagRoutes); // T6: Feature flag management
app.use("/api/admin/experiments", experimentRoutes); // Kenji Lopez-Alt Experiment Lab
app.use("/api/admin/webhooks", adminWebhookHealthRoutes); // T6: Webhook health monitoring
app.use("/api/admin/audit-log", adminAuditLogRoutes); // T6: Audit log viewer
app.use("/api/webhooks/mailgun", mailgunInboundRoutes); // T3: Mailgun inbound email processing
app.use("/api/admin", adminKnowledgeLatticeRoutes); // T3: Knowledge + Sentiment Lattice CRUD
app.use("/api/admin/morning-briefing", morningBriefingRoutes); // Agent: Morning Briefing daily intelligence summary
app.use("/api/admin/config", adminConfigRoutes); // Editable business config (burn rate, pricing, thresholds)
app.use("/api/admin/roadmap", adminRoadmapRoutes); // Self-correcting roadmap engine for VisionaryView
app.use("/api/admin/metrics", adminMetricsRoutes); // Single-source business metrics for all admin dashboards
app.use("/api/seo", seoRoutes); // WO-7: Programmatic SEO pages + hub/spoke + stats
app.use("/api/foundation", foundationRoutes); // WO-11: Foundation application submissions
app.use("/api/intelligence", intelligenceRoutes); // WO-8: Practice owner intelligence dashboard
app.use("/api/market", marketRoutes); // Programmatic city pages market data
app.use("/api/clarity-card", publicScoreCardRoutes); // Public score card for viral sharing
app.use("/api/content", contentRoutes); // Public content API for dynamic articles
app.use("/api/admin/content", contentPublishRoutes); // Admin content publishing pipeline
app.use("/api/admin/tailor", adminTailorRoutes); // Tailor mode: inline text overrides
app.use("/api/admin/tasks", adminTasksRoutes); // Jo's My Flags task board
app.use("/api/admin/agent-activity", agentActivityRoutes); // Dream Team activity feed
app.use("/api/admin/changelog", changelogRoutes); // Auto-generated changelog for Jo + Dave
app.use("/api/labs", alloroLabsRoutes); // Alloro Labs: anonymized benchmark data
app.use("/api/personal-agent", personalAgentRoutes); // Personal team agent daily briefs
app.use("/api/user", improvementPlanRoutes); // Score Improvement Plan: actionable checkup improvements
app.use("/api/user/competitors", competitorRoutes); // Tracked Competitors: side-by-side comparison
app.use("/api/admin/mission-control", missionControlRoutes); // Mission Control: real-time agent status grid
app.use("/api/admin/kill-switch", killSwitchRoutes); // Emergency kill switch for all agents
app.use("/api/admin/customer-readiness", customerReadinessRoutes); // Customer experience readiness scores
app.use("/api/admin/agent-identity", agentIdentityRoutes); // Agent identity, scopes, audit, quarantine
app.use("/api/admin/agent-canon", agentCanonRoutes); // Canon governance: spec, gold questions, gate verdicts
app.use("/api/admin/analytics", analyticsRoutes); // GA4 + GSC analytics data pipeline
app.use("/api/user/data-export", dataExportRoutes); // Full client data export (GDPR/compliance)
app.use("/api/user", croInsightsRoutes); // CRO insights for Presence page
app.use("/api/webhooks/mailgun", mailgunEventsRoutes); // Mailgun event webhooks: deliverability tracking

// Sentry error handler — must be after all routes and before other error handlers
Sentry.setupExpressErrorHandler(app);

if (isProd) {
  // Dynamic sitemap — must be before static file serving and catch-all
  app.use("/sitemap.xml", sitemapRoutes);

  app.use(express.static(path.join(__dirname, "../public")));

  // Dynamic OG tags for checkup share links (social media crawlers)
  // When iMessage/WhatsApp/Twitter fetches the URL, serve a page with
  // dynamic meta tags so the preview shows the score and competitive framing.
  // Regular browsers get the SPA which renders the full SharedResults component.
  app.get("/checkup/shared/:shareId", async (req, res, next) => {
    const ua = (req.headers["user-agent"] || "").toLowerCase();
    const isCrawler = /facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|imessage|applebot|googlebot|bingbot/i.test(ua);
    if (!isCrawler) return next(); // Regular browser: serve SPA

    try {
      const share = await db("checkup_shares").where({ share_id: req.params.shareId }).first();
      if (!share) return next();

      const title = share.total_competitors
        ? `${share.total_competitors} competitors in ${share.city}. How do you compare?`
        : `I checked my Google presence. How does yours compare?`;
      const description = share.top_competitor_name
        ? `${share.total_competitors} competitors in ${share.city}. ${share.top_competitor_name} is the one to watch. Free, 60 seconds.`
        : `${share.total_competitors} competitors in ${share.city}. See where you rank. Free, 60 seconds.`;
      const url = `${process.env.APP_URL || "https://app.getalloro.com"}/checkup/shared/${share.share_id}`;

      res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${description}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:site_name" content="Alloro"/>
<meta property="og:image" content="https://getalloro.com/og-alloro.png"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${description}"/>
<meta http-equiv="refresh" content="0;url=${url}"/>
</head>
<body><p>Redirecting...</p></body>
</html>`);
    } catch {
      next();
    }
  });

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

      // On startup: recalculate stale scores (older than 7 days).
      // This is the system fix: no human button, no cron dependency.
      // Every deploy catches stale scores automatically.
      catchUpStaleScores().catch((err) =>
        console.error("[Startup] Stale score catch-up failed (non-blocking):", err.message)
      );

      // On startup: poll reviews for all orgs with a placeId.
      // Catches new Google reviews, generates AI drafts, sends notifications.
      pollReviewsOnStartup().catch((err) =>
        console.error("[Startup] Review poll failed (non-blocking):", err.message)
      );

      // On startup: fetch GA4 + GSC data for connected orgs.
      // Skips orgs fetched in the last 24h. 2s delay between orgs for rate limits.
      pollAnalyticsOnStartup().catch((err) =>
        console.error("[Startup] Analytics poll failed (non-blocking):", err.message)
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

/**
 * Catch up stale scores on server startup.
 * Any org with a score older than 7 days gets recalculated.
 * Non-blocking. Runs in background. No human intervention.
 */
async function catchUpStaleScores(): Promise<void> {
  try {
    const { recalculateScore } = await import("./services/weeklyScoreRecalc");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Find orgs with stale or missing scores
    const staleOrgs = await db("organizations")
      .whereNotNull("checkup_data")
      .where(function () {
        this.whereNull("score_updated_at")
          .orWhere("score_updated_at", "<", sevenDaysAgo);
      })
      .select("id", "name", "score_updated_at");

    if (staleOrgs.length === 0) {
      console.log("[Startup] All scores are fresh. No catch-up needed.");
      return;
    }

    console.log(`[Startup] Found ${staleOrgs.length} orgs with stale scores. Recalculating...`);
    let updated = 0;
    for (const org of staleOrgs) {
      try {
        await recalculateScore(org.id);
        updated++;
      } catch (err: any) {
        console.error(`[Startup] Score recalc failed for ${org.name}:`, err.message);
      }
      // Small delay to avoid hammering Places API
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(`[Startup] Score catch-up complete: ${updated}/${staleOrgs.length} updated.`);
  } catch (err: any) {
    console.error("[Startup] Score catch-up error:", err.message);
  }
}

/**
 * Poll Google reviews on server startup.
 * Finds all orgs with a placeId in checkup_data, skips any polled in the last 24h,
 * then fetches new reviews and generates AI response drafts.
 * Non-blocking. Runs in background. 2s delay between orgs for API limits.
 */
async function pollReviewsOnStartup(): Promise<void> {
  try {
    const { pollPracticeReviews } = await import("./services/reviewMonitor");
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find all orgs that have a placeId in their checkup_data
    const orgs = await db("organizations")
      .whereNotNull("checkup_data")
      .select("id", "name", "specialty", "checkup_data");

    const eligible: Array<{
      id: number;
      name: string;
      placeId: string;
      specialty: string;
    }> = [];

    for (const org of orgs) {
      const data = typeof org.checkup_data === "string"
        ? JSON.parse(org.checkup_data)
        : org.checkup_data;

      const placeId = data?.placeId || data?.place?.placeId;
      if (!placeId) continue;

      const specialty =
        data?.market?.specialty || data?.specialty || org.specialty || "practice";

      eligible.push({ id: org.id, name: org.name, placeId, specialty });
    }

    if (eligible.length === 0) {
      console.log("[Startup] No orgs with placeId found. Skipping review poll.");
      return;
    }

    // Filter out orgs polled in the last 24 hours
    const recentPolls = await db("review_notifications")
      .select("organization_id")
      .where("created_at", ">=", twentyFourHoursAgo)
      .groupBy("organization_id");

    const recentOrgIds = new Set(recentPolls.map((r: any) => r.organization_id));
    const toPoll = eligible.filter((org) => !recentOrgIds.has(org.id));

    if (toPoll.length === 0) {
      console.log(
        `[Startup] All ${eligible.length} orgs polled within 24h. Skipping review poll.`
      );
      return;
    }

    console.log(
      `[Startup] Polling reviews for ${toPoll.length} org(s) (${eligible.length - toPoll.length} skipped, polled <24h ago)...`
    );

    let polled = 0;
    let totalNew = 0;

    for (const org of toPoll) {
      try {
        const result = await pollPracticeReviews(
          org.id,
          null,
          org.placeId,
          org.name,
          org.specialty,
        );
        polled++;
        totalNew += result.newReviews;
      } catch (err: any) {
        console.error(
          `[Startup] Review poll failed for ${org.name}:`,
          err.message,
        );
      }
      // 2s delay between orgs to respect Google API limits
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(
      `[Startup] Review poll complete: ${polled}/${toPoll.length} orgs polled, ${totalNew} new review(s) found.`
    );
  } catch (err: any) {
    console.error("[Startup] Review poll error:", err.message);
  }
}

/**
 * Fetch GA4 + GSC analytics on server startup.
 * Finds all orgs with GA4 or GSC properties connected, skips any fetched
 * in the last 24 hours, then pulls fresh data and stores in google_data_store.
 * Non-blocking. Runs in background. 2s delay between orgs for API rate limits.
 */
async function pollAnalyticsOnStartup(): Promise<void> {
  try {
    const { fetchAndStoreAnalytics } = await import("./services/analyticsService");
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find all orgs with GA4 or GSC property IDs
    const connections = await db("google_connections")
      .select("organization_id", "google_property_ids")
      .whereNotNull("refresh_token");

    const eligible: Array<{ orgId: number }> = [];
    for (const conn of connections) {
      const pids = typeof conn.google_property_ids === "string"
        ? JSON.parse(conn.google_property_ids || "{}")
        : conn.google_property_ids;

      if (pids?.ga4?.propertyId || pids?.gsc?.siteUrl) {
        eligible.push({ orgId: conn.organization_id });
      }
    }

    if (eligible.length === 0) {
      console.log("[Startup] No orgs with GA4/GSC connected. Skipping analytics poll.");
      return;
    }

    // Filter out orgs with a recent analytics fetch (within 24h)
    const recentFetches = await db("google_data_store")
      .select("organization_id")
      .where("run_type", "analytics")
      .where("created_at", ">=", twentyFourHoursAgo)
      .groupBy("organization_id");

    const recentOrgIds = new Set(recentFetches.map((r: any) => r.organization_id));
    const toPoll = eligible.filter((e) => !recentOrgIds.has(e.orgId));

    if (toPoll.length === 0) {
      console.log(
        `[Startup] All ${eligible.length} orgs fetched analytics within 24h. Skipping.`
      );
      return;
    }

    console.log(
      `[Startup] Fetching analytics for ${toPoll.length} org(s) (${eligible.length - toPoll.length} skipped, fetched <24h ago)...`
    );

    let fetched = 0;
    let ga4Count = 0;
    let gscCount = 0;

    for (const { orgId } of toPoll) {
      try {
        const result = await fetchAndStoreAnalytics(orgId);
        fetched++;
        if (result.ga4) ga4Count++;
        if (result.gsc) gscCount++;
      } catch (err: any) {
        console.error(`[Startup] Analytics fetch failed for org ${orgId}:`, err.message);
      }
      // 2s delay between orgs to respect Google API rate limits
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(
      `[Startup] Analytics poll complete: ${fetched}/${toPoll.length} orgs, ${ga4Count} GA4, ${gscCount} GSC.`
    );
  } catch (err: any) {
    console.error("[Startup] Analytics poll error:", err.message);
  }
}

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
