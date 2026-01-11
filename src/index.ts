import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";

import { Router } from "express";

import ga4Routes from "./routes/ga4";
import gscRoutes from "./routes/gsc";
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
import practiceRankingRoutes from "./routes/practiceRanking";
import supportRoutes from "./routes/support";
import scraperRoutes from "./routes/scraper";

const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const router = Router();

// Add JSON body parser middleware with increased limit for large PMS data
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Database health check endpoint
app.get("/api/health/db", async (req, res) => {
  const health = await healthCheck();
  res.status(health.status === "healthy" ? 200 : 500).json(health);
});

app.use(router);
app.use("/api/ga4", ga4Routes);
app.use("/api/gsc", gscRoutes);
app.use("/api/gbp", gbpRoutes);
app.use("/api/clarity", clarityRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth/otp", otpRoutes);
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
app.use("/api/admin/practice-ranking", practiceRankingRoutes);
app.use("/api/practice-ranking", practiceRankingRoutes); // Client-facing endpoint for /latest
app.use("/api/admin", adminAuthRoutes);
app.use("/api/support", supportRoutes); // Help form / support inquiries
app.use("/api/scraper", scraperRoutes); // Website scraper for n8n webhooks

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
    })
  );
}

// Initialize database connection and start server
const startServer = async () => {
  try {
    // Test database connection on startup
    await testConnection();

    app.listen(port, () => {
      console.log(
        `🚀 Server running in ${
          isProd ? "production" : "development"
        } mode at http://localhost:${port}`
      );
      console.log(
        `📊 Database health check: http://localhost:${port}/api/health/db`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

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
