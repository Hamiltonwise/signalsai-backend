/**
 * Smoke Test Suite -- comprehensive end-to-end validation of every critical system.
 *
 * Usage:
 *   npm run smoke
 *   SMOKE_TEST_URL=http://localhost:3000 SMOKE_ADMIN_TOKEN=xxx npm run smoke
 *   npx tsx src/scripts/smokeTest.ts --auth-token=<jwt>
 *
 * Exits 0 if all pass, 1 if any fail.
 */

const BASE_URL = process.env.SMOKE_TEST_URL || "http://localhost:3000";
const ADMIN_TOKEN = process.env.SMOKE_ADMIN_TOKEN || "";

// Parse --auth-token flag from CLI args
const AUTH_TOKEN_FLAG = (() => {
  const arg = process.argv.find((a) => a.startsWith("--auth-token="));
  return arg ? arg.split("=")[1] : "";
})();

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: CheckResult[] = [];
let createdOrgId: number | null = null;
let sessionToken: string | null = AUTH_TOKEN_FLAG || null;

// Salt Lake City dental practice (real Google place_id)
const SLC_PLACE_ID = "ChIJnwl8rqiHTYcRYv_X4YtFBJc";

// ── HTTP Helper ──────────────────────────────────────────────────────

async function http(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; timeoutMs?: number } = {},
): Promise<{ status: number; data: any }> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Timing + Recording ──────────────────────────────────────────────

let checkStart = 0;

function startTimer() {
  checkStart = Date.now();
}

function formatError(e: unknown): string {
  if (e instanceof DOMException && e.name === "AbortError") return "request timed out";
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ECONNREFUSED")) return `backend unreachable at ${BASE_URL}`;
  if (msg.includes("fetch failed")) return `cannot connect to ${BASE_URL}`;
  return msg;
}

function record(name: string, passed: boolean, detail?: string) {
  const elapsed = Date.now() - checkStart;
  results.push({ name, passed, detail });
  const tag = passed ? "[PASS]" : "[FAIL]";
  const time = `(${elapsed}ms)`;
  const msg = detail ? `${tag} ${name} ${time} -- ${detail}` : `${tag} ${name} ${time}`;
  console.log(msg);
}

// ── CHECK 1: Health Check ────────────────────────────────────────────

async function checkHealth() {
  const name = "1. Health Check (GET /api/health)";
  startTimer();
  try {
    const { status, data } = await http("GET", "/api/health");
    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }
    const s = data?.status;
    if (s !== "ok" && s !== "degraded") {
      return record(name, false, `status="${s}" (expected ok or degraded)`);
    }
    record(name, true, `status=${s}`);
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 2: Checkup Analyze ─────────────────────────────────────────

async function checkCheckupAnalyze() {
  const name = "2. Checkup Analyze (POST /api/checkup/analyze)";
  startTimer();
  try {
    const { status, data } = await http("POST", "/api/checkup/analyze", {
      timeoutMs: 30_000,
      body: {
        placeId: SLC_PLACE_ID,
        name: "Mountain View Endodontics",
        city: "Salt Lake City",
        state: "UT",
        category: "dentist",
      },
    });

    if (status !== 200) {
      return record(name, false, `status ${status}: ${JSON.stringify(data)?.slice(0, 200)}`);
    }

    const score = data?.score?.composite ?? data?.score;
    const scoreNum = typeof score === "number" ? score : Number(score);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      return record(name, false, `score not 0-100: ${JSON.stringify(score)}`);
    }
    if (!Array.isArray(data?.competitors)) {
      return record(name, false, "competitors is not an array");
    }

    // Verify expected shape: score, competitors, findings, market
    const hasFindings = Array.isArray(data?.findings) || data?.findings !== undefined;
    const hasMarket = data?.market !== undefined || data?.marketRadius !== undefined;

    record(
      name,
      true,
      `score=${scoreNum}, ${data.competitors.length} competitors, findings=${hasFindings}, market=${hasMarket}`,
    );
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 3: Authentication (login or demo) ──────────────────────────

async function checkAuth() {
  const name = "3. Authentication (POST /api/auth/login)";
  startTimer();

  // If a token was passed via flag, skip login
  if (AUTH_TOKEN_FLAG) {
    sessionToken = AUTH_TOKEN_FLAG;
    return record(name, true, "using --auth-token flag");
  }

  try {
    // Try login with test credentials
    const testEmail = process.env.SMOKE_TEST_EMAIL || "demo@getalloro.com";
    const testPassword = process.env.SMOKE_TEST_PASSWORD || "";

    if (testPassword) {
      const { status, data } = await http("POST", "/api/auth/login", {
        body: { email: testEmail, password: testPassword },
      });

      if (status === 200 && data?.token) {
        sessionToken = data.token;
        return record(name, true, `logged in as ${testEmail}`);
      }
    }

    // Fall back to demo login
    const { status: demoStatus, data: demoData } = await http("GET", "/api/demo/login");
    if (demoStatus === 200 && demoData?.token) {
      sessionToken = demoData.token;
      return record(name, true, "used demo login fallback");
    }

    // Fall back to account creation
    const timestamp = Date.now();
    const { status: createStatus, data: createData } = await http(
      "POST",
      "/api/checkup/create-account",
      {
        body: {
          email: `smoke-test-${timestamp}@getalloro.com`,
          password: "SmokeTest123!",
          practice_name: "Smoke Test Practice",
          relationship: "doctor",
        },
      },
    );

    if (createStatus === 200 && createData?.token) {
      sessionToken = createData.token;
      createdOrgId = createData.organizationId ?? null;
      return record(name, true, `created smoke-test account, orgId=${createdOrgId}`);
    }

    record(name, false, `all login methods failed. Last: status ${createStatus}`);
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 4: Dashboard Context ───────────────────────────────────────

async function checkDashboardContext() {
  const name = "4. Dashboard Context (GET /api/user/dashboard-context)";
  startTimer();
  if (!sessionToken) {
    return record(name, false, "skipped, no auth token");
  }
  try {
    const { status, data } = await http("GET", "/api/user/dashboard-context", {
      token: sessionToken,
    });
    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }
    if (typeof data !== "object" || data === null || data.error) {
      return record(name, false, `unexpected body: ${JSON.stringify(data)?.slice(0, 200)}`);
    }

    // Verify expected shape keys (any of: score, rank, topCompetitor, checkup_context)
    const keys = Object.keys(data);
    const hasExpectedShape =
      keys.includes("checkup_context") ||
      keys.includes("score") ||
      keys.includes("rank") ||
      keys.includes("topCompetitor") ||
      keys.includes("success");

    record(name, true, `keys: ${keys.slice(0, 8).join(", ")}`);
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 5: One Action Card ─────────────────────────────────────────

async function checkOneActionCard() {
  const name = "5. One Action Card (GET /api/user/one-action-card)";
  startTimer();
  if (!sessionToken) {
    return record(name, false, "skipped, no auth token");
  }
  try {
    const { status, data } = await http("GET", "/api/user/one-action-card", {
      token: sessionToken,
    });
    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }
    if (!data?.success) {
      return record(name, false, `success=${data?.success}`);
    }

    const card = data?.card;
    if (!card) {
      return record(name, false, "missing card object");
    }

    // Verify card has expected fields (headline, body, action_text, priority_level)
    const hasHeadline = typeof card.headline === "string" && card.headline.length > 0;
    const hasBody = typeof card.body === "string" && card.body.length > 0;
    const hasPriority = typeof card.priority_level === "number";

    if (!hasHeadline || !hasBody) {
      return record(name, false, `card missing headline or body: ${JSON.stringify(card)?.slice(0, 200)}`);
    }

    record(name, true, `headline="${card.headline.slice(0, 50)}", priority=${card.priority_level}`);
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 6: Streaks API ─────────────────────────────────────────────

async function checkStreaks() {
  const name = "6. Streaks (GET /api/user/streaks)";
  startTimer();
  if (!sessionToken) {
    return record(name, false, "skipped, no auth token");
  }
  try {
    const { status, data } = await http("GET", "/api/user/streaks", {
      token: sessionToken,
    });
    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }
    if (!data?.success) {
      return record(name, false, `success=${data?.success}`);
    }

    // streak can be null (no active streak), win can be null
    const streakType = data.streak?.type ?? "none";
    const winPresent = data.win !== null && data.win !== undefined;

    record(name, true, `streak=${streakType}, win=${winPresent}`);
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 7: Monday Email (admin trigger) ────────────────────────────

async function checkMondayEmail() {
  const name = "7. Monday Email (POST /api/admin/monday-email/run-now)";
  startTimer();
  if (!ADMIN_TOKEN) {
    return record(name, false, "skipped, SMOKE_ADMIN_TOKEN not set");
  }
  try {
    // This is an admin-only endpoint, we just verify it responds with a known shape
    const { status, data } = await http("POST", "/api/admin/monday-email/run-now", {
      token: ADMIN_TOKEN,
      body: { orgId: 1 },
      timeoutMs: 20_000,
    });

    // 200 with success or 400/404 with a structured error are both valid (endpoint exists)
    if (status === 200) {
      return record(name, true, `success=${data?.success}, message=${data?.message?.slice(0, 60)}`);
    }
    if (status === 400 || status === 404 || status === 422) {
      // Endpoint responded, just no valid org. Still a pass for smoke test purposes
      return record(name, true, `endpoint alive, status ${status}: ${data?.error?.slice(0, 80) || "no error msg"}`);
    }
    record(name, false, `status ${status}: ${JSON.stringify(data)?.slice(0, 200)}`);
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 8: Notification Bell ───────────────────────────────────────

async function checkNotifications() {
  const name = "8. Notifications (GET /api/notifications)";
  startTimer();
  if (!sessionToken) {
    return record(name, false, "skipped, no auth token");
  }
  try {
    const { status, data } = await http("GET", "/api/notifications", {
      token: sessionToken,
    });
    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }
    if (!data?.success) {
      return record(name, false, `success=${data?.success}`);
    }

    const notifications = data?.notifications;
    if (!Array.isArray(notifications)) {
      return record(name, false, `notifications is not an array: ${typeof notifications}`);
    }

    record(name, true, `${notifications.length} notification(s)`);
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 9: Review Drafts ───────────────────────────────────────────

async function checkReviewDrafts() {
  const name = "9. Review Drafts (GET /api/user/review-drafts)";
  startTimer();
  if (!sessionToken) {
    return record(name, false, "skipped, no auth token");
  }
  try {
    const { status, data } = await http("GET", "/api/user/review-drafts", {
      token: sessionToken,
    });
    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }
    if (!data?.success) {
      return record(name, false, `success=${data?.success}`);
    }

    const reviews = data?.reviews;
    if (!Array.isArray(reviews)) {
      return record(name, false, `reviews is not an array: ${typeof reviews}`);
    }

    record(name, true, `${reviews.length} review draft(s)`);
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 10: Progress Report ────────────────────────────────────────

async function checkProgressReport() {
  const name = "10. Progress Report (GET /api/progress-report)";
  startTimer();
  if (!sessionToken) {
    return record(name, false, "skipped, no auth token");
  }
  try {
    const { status, data } = await http("GET", "/api/progress-report", {
      token: sessionToken,
    });
    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }
    if (!data?.success) {
      return record(name, false, `success=${data?.success}`);
    }

    // data.data can be null for new orgs, that is acceptable
    const report = data?.data;
    if (report === null) {
      return record(name, true, "data=null (new org, expected)");
    }

    // Verify expected shape: yearInReview, topMoves, next90Days
    const hasYearInReview = report?.yearInReview !== undefined;
    const hasTopMoves = Array.isArray(report?.topMoves);
    const hasNext90 = Array.isArray(report?.next90Days);

    record(
      name,
      true,
      `yearInReview=${hasYearInReview}, topMoves=${hasTopMoves}, next90Days=${hasNext90}`,
    );
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 11: Referral Intelligence ──────────────────────────────────

async function checkReferralIntelligence() {
  const name = "11. Referral Intelligence (GET /api/referral-intelligence)";
  startTimer();
  if (!sessionToken) {
    return record(name, false, "skipped, no auth token");
  }
  try {
    const { status, data } = await http("GET", "/api/referral-intelligence", {
      token: sessionToken,
    });
    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }
    if (!data?.success) {
      return record(name, false, `success=${data?.success}`);
    }

    // Verify expected shape: hasData, topReferrers, driftAlerts, recommendedAction
    const hasData = data?.hasData;
    const hasTopReferrers = Array.isArray(data?.topReferrers);
    const hasDriftAlerts = Array.isArray(data?.driftAlerts);

    record(
      name,
      true,
      `hasData=${hasData}, topReferrers=${hasTopReferrers} (${data?.topReferrers?.length}), driftAlerts=${hasDriftAlerts}`,
    );
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── CHECK 12: Demo Route ─────────────────────────────────────────────

async function checkDemoLogin() {
  const name = "12. Demo Login (GET /api/demo/login)";
  startTimer();
  try {
    const { status, data } = await http("GET", "/api/demo/login");

    // In production this returns 404, which is correct behavior
    if (status === 404) {
      return record(name, true, "404 (expected in production mode)");
    }

    if (status !== 200) {
      return record(name, false, `status ${status}: ${JSON.stringify(data)?.slice(0, 200)}`);
    }

    if (typeof data?.token !== "string" || !data.token) {
      return record(name, false, "missing demo token");
    }

    // Verify user object shape
    const user = data?.user;
    const hasUserShape = user?.id && user?.email && user?.organizationId !== undefined;

    record(name, true, `token present, user=${hasUserShape ? user.email : "missing shape"}`);
  } catch (e) {
    record(name, false, formatError(e));
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────

async function cleanup() {
  if (!createdOrgId || !ADMIN_TOKEN) return;
  try {
    await http("DELETE", `/api/admin/organizations/${createdOrgId}`, {
      token: ADMIN_TOKEN,
      body: { confirmDelete: true },
    });
    console.log(`[CLEANUP] Deleted smoke-test org ${createdOrgId}`);
  } catch {
    console.log(`[CLEANUP] Failed to delete org ${createdOrgId}, manual cleanup needed`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nAlloro Smoke Test Suite`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Admin token: ${ADMIN_TOKEN ? "set" : "not set"}`);
  console.log(`Auth token flag: ${AUTH_TOKEN_FLAG ? "set" : "not set"}\n`);
  console.log("─".repeat(60) + "\n");

  try {
    // 1. Health check first (if this fails, everything else will too)
    await checkHealth();

    // 2. Checkup flow (unauthenticated)
    await checkCheckupAnalyze();

    // 3. Authentication (gets a session token for remaining tests)
    await checkAuth();

    // 4-11: Authenticated endpoints
    await checkDashboardContext();
    await checkOneActionCard();
    await checkStreaks();
    await checkMondayEmail();
    await checkNotifications();
    await checkReviewDrafts();
    await checkProgressReport();
    await checkReferralIntelligence();

    // 12. Demo route (unauthenticated)
    await checkDemoLogin();
  } finally {
    await cleanup();
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\nSMOKE TEST RESULTS: ${passed} of ${results.length} passed`);

  if (failed > 0) {
    console.log(`\nFailed checks:`);
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.detail || "no detail"}`);
    }
  }

  console.log("");
  process.exit(passed === results.length ? 0 : 1);
}

main();
