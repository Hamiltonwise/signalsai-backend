/**
 * captureBaseline.ts
 *
 * Captures performance baseline metrics for key API endpoints.
 * Stores results in system_config table as performance_baselines JSONB.
 *
 * Usage: npm run benchmark:baseline
 * Optional: BASE_URL=https://staging.getalloro.com npm run benchmark:baseline
 *
 * Default: http://localhost:3000
 */

import * as dotenv from "dotenv";
dotenv.config();

import { db } from "../database/connection";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ITERATIONS = 5; // Run each endpoint multiple times for p95

// ── Endpoint definitions ─────────────────────────────────────────

interface EndpointDef {
  name: string;
  method: "GET" | "POST";
  path: string;
  targetMs: number;
  body?: Record<string, unknown>;
  auth?: boolean;
}

const ENDPOINTS: EndpointDef[] = [
  {
    name: "health_detailed",
    method: "GET",
    path: "/api/health/detailed",
    targetMs: 100,
  },
  {
    name: "checkup_analyze",
    method: "POST",
    path: "/api/checkup/analyze",
    targetMs: 5000,
    body: {
      placeName: "Test Practice",
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      address: "123 Test St",
      specialty: "general",
    },
  },
  {
    name: "admin_client_health",
    method: "GET",
    path: "/api/admin/client-health",
    targetMs: 300,
    auth: true,
  },
];

// ── Benchmark runner ─────────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  path: string;
  targetMs: number;
  timings: number[];
  p50: number;
  p95: number;
  min: number;
  max: number;
  status: "pass" | "warn" | "fail";
  httpStatus: number;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function benchmarkEndpoint(endpoint: EndpointDef): Promise<BenchmarkResult> {
  const timings: number[] = [];
  let lastStatus = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();

    try {
      const headers: Record<string, string> = {};
      if (endpoint.auth) {
        // Use a test token if available
        const token = process.env.TEST_AUTH_TOKEN || "";
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      if (endpoint.body) headers["Content-Type"] = "application/json";

      const res = await fetch(`${BASE_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers,
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
        signal: AbortSignal.timeout(15000),
      });

      lastStatus = res.status;
    } catch {
      lastStatus = 0;
    }

    const elapsed = performance.now() - start;
    timings.push(Math.round(elapsed));

    // Small delay between iterations
    await new Promise((r) => setTimeout(r, 100));
  }

  const p50 = percentile(timings, 50);
  const p95 = percentile(timings, 95);
  const min = Math.min(...timings);
  const max = Math.max(...timings);

  let status: "pass" | "warn" | "fail" = "pass";
  if (p95 > endpoint.targetMs * 1.5) status = "fail";
  else if (p95 > endpoint.targetMs) status = "warn";

  return {
    name: endpoint.name,
    path: endpoint.path,
    targetMs: endpoint.targetMs,
    timings,
    p50,
    p95,
    min,
    max,
    status,
    httpStatus: lastStatus,
  };
}

// ── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[BENCHMARK] Capturing baselines against ${BASE_URL}`);
  console.log(`[BENCHMARK] ${ITERATIONS} iterations per endpoint\n`);

  const results: BenchmarkResult[] = [];

  for (const endpoint of ENDPOINTS) {
    process.stdout.write(`  Testing ${endpoint.name}...`);
    const result = await benchmarkEndpoint(endpoint);
    results.push(result);

    const icon = result.status === "pass" ? "PASS" : result.status === "warn" ? "WARN" : "FAIL";
    console.log(
      ` [${icon}] p50=${result.p50}ms p95=${result.p95}ms target=${result.targetMs}ms (HTTP ${result.httpStatus})`,
    );
  }

  // Store in system_config
  const baseline = {
    captured_at: new Date().toISOString(),
    base_url: BASE_URL,
    iterations: ITERATIONS,
    endpoints: results.map((r) => ({
      name: r.name,
      path: r.path,
      targetMs: r.targetMs,
      p50: r.p50,
      p95: r.p95,
      min: r.min,
      max: r.max,
      status: r.status,
      httpStatus: r.httpStatus,
    })),
  };

  // Ensure system_config table exists
  const tableExists = await db.schema.hasTable("system_config");
  if (!tableExists) {
    console.log("\n[BENCHMARK] Creating system_config table...");
    await db.schema.createTable("system_config", (t) => {
      t.string("key", 200).primary();
      t.jsonb("value").nullable();
      t.timestamp("updated_at", { useTz: true }).defaultTo(db.fn.now());
    });
  }

  // Upsert the baseline
  const existing = await db("system_config").where({ key: "performance_baselines" }).first();
  if (existing) {
    await db("system_config")
      .where({ key: "performance_baselines" })
      .update({ value: JSON.stringify(baseline), updated_at: new Date() });
  } else {
    await db("system_config").insert({
      key: "performance_baselines",
      value: JSON.stringify(baseline),
    });
  }

  console.log("\n[BENCHMARK] Baselines stored in system_config.performance_baselines");

  // Summary
  const passed = results.filter((r) => r.status === "pass").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;

  console.log(`[BENCHMARK] Summary: ${passed} pass, ${warned} warn, ${failed} fail`);

  // T2 registers GET /api/admin/performance-baselines if needed

  await db.destroy();
}

main().catch((err) => {
  console.error("[BENCHMARK] Fatal error:", err);
  process.exit(1);
});
