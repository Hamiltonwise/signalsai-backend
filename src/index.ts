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
import mondayRoutes from "./routes/monday";
import authRoutes from "./routes/auth";
import pmsRoutes from "./routes/pms";
import onboardingRoutes from "./routes/onboarding";
import ragRoutes from "./routes/rag";

const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const router = Router();

// Add JSON body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use("/api/monday", mondayRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/pms", pmsRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/rag", ragRoutes);

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
