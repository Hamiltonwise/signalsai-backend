/**
 * Health Check Routes -- WO-HEALTH-CHECK-ENDPOINT
 *
 * GET /api/health       -- basic (for load balancer, fast)
 * GET /api/health/detailed -- comprehensive (for Dave and Sentry)
 */

import express from "express";
import { db } from "../database/connection";

const healthRoutes = express.Router();

// ─── Basic Health Check ───

/**
 * GET /api/health
 * Fast response for load balancer. No DB call.
 */
healthRoutes.get("/", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Detailed Health Check ───

interface CheckResult {
  status: "ok" | "error";
  latency_ms?: number;
  last_successful_call?: string;
  queued_jobs?: number;
  failed_jobs?: number;
  error?: string;
}

/**
 * GET /api/health/detailed
 * Comprehensive check for Dave's post-deploy verification + Sentry alerting.
 */
healthRoutes.get("/detailed", async (_req, res) => {
  const checks: Record<string, CheckResult> = {};

  // 1. Database
  try {
    const start = Date.now();
    await db.raw("SELECT 1");
    checks.database = { status: "ok", latency_ms: Date.now() - start };
  } catch (err: any) {
    checks.database = { status: "error", error: err.message };
  }

  // 2. Redis / BullMQ
  try {
    const IORedis = require("ioredis");
    const redisHost = process.env.REDIS_HOST || "127.0.0.1";
    const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
    const redis = new IORedis({
      host: redisHost,
      port: redisPort,
      connectTimeout: 3000,
      lazyConnect: true,
      ...(process.env.REDIS_TLS === "true" && { tls: {} }),
    });

    const start = Date.now();
    await redis.connect();
    await redis.ping();
    const latency = Date.now() - start;

    // Check BullMQ queue stats
    let queuedJobs = 0;
    let failedJobs = 0;
    try {
      const keys = await redis.keys("bull:*:waiting");
      for (const key of keys) {
        const len = await redis.llen(key);
        queuedJobs += len;
      }
      const failedKeys = await redis.keys("bull:*:failed");
      for (const key of failedKeys) {
        const len = await redis.zcard(key);
        failedJobs += len;
      }
    } catch {
      // BullMQ stats are best-effort
    }

    await redis.disconnect();
    checks.redis = { status: "ok", latency_ms: latency, queued_jobs: queuedJobs, failed_jobs: failedJobs };
  } catch (err: any) {
    checks.redis = { status: "error", error: err.message };
  }

  // 3. Google Places API (check last successful call from behavioral_events)
  try {
    const lastPlacesEvent = await db("behavioral_events")
      .whereIn("event_type", ["checkup.analyzed", "clearpath.build_triggered"])
      .orderBy("created_at", "desc")
      .select("created_at")
      .first();

    checks.places_api = {
      status: "ok",
      last_successful_call: lastPlacesEvent?.created_at
        ? new Date(lastPlacesEvent.created_at).toISOString()
        : "never",
    };
  } catch (err: any) {
    checks.places_api = { status: "error", error: err.message };
  }

  // 4. Claude API (check last successful agent call)
  try {
    const lastClaudeEvent = await db("behavioral_events")
      .whereIn("event_type", ["cs_agent.response", "intelligence.generated"])
      .orderBy("created_at", "desc")
      .select("created_at")
      .first();

    checks.claude_api = {
      status: "ok",
      last_successful_call: lastClaudeEvent?.created_at
        ? new Date(lastClaudeEvent.created_at).toISOString()
        : "never",
    };
  } catch (err: any) {
    checks.claude_api = { status: "error", error: err.message };
  }

  // 5. BullMQ (summarize from redis check)
  checks.bullmq = checks.redis?.status === "ok"
    ? {
        status: "ok",
        queued_jobs: checks.redis.queued_jobs || 0,
        failed_jobs: checks.redis.failed_jobs || 0,
      }
    : { status: "error", error: "Redis unavailable" };

  // Overall status
  let status: "ok" | "degraded" | "down" = "ok";
  if (checks.database.status === "error") {
    status = "down";
  } else if (
    checks.redis?.status === "error" ||
    checks.places_api?.status === "error" ||
    checks.claude_api?.status === "error"
  ) {
    status = "degraded";
  }

  const statusCode = status === "down" ? 503 : 200;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    checks,
    version: process.env.APP_VERSION || "unknown",
    uptime_seconds: Math.floor(process.uptime()),
  });
});

export default healthRoutes;
