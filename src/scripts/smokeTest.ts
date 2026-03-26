/**
 * Smoke Test - 6 critical path checks against a running Alloro instance.
 *
 * Usage:
 *   SMOKE_TEST_URL=http://localhost:3000 SMOKE_ADMIN_TOKEN=xxx npm run smoke
 *
 * Exits 0 if all 6 pass, 1 if any fail.
 */

const BASE_URL = process.env.SMOKE_TEST_URL || "http://localhost:3000";
const ADMIN_TOKEN = process.env.SMOKE_ADMIN_TOKEN || "";

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: CheckResult[] = [];
let createdOrgId: number | null = null;
let createdToken: string | null = null;

// Salt Lake City dental practice (real Google place_id)
const SLC_PLACE_ID = "ChIJnwl8rqiHTYcRYv_X4YtFBJc"; // a dental practice in SLC

async function http(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; timeoutMs?: number } = {}
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

let checkStart = 0;

function startTimer() {
  checkStart = Date.now();
}

function record(name: string, passed: boolean, detail?: string) {
  const elapsed = Date.now() - checkStart;
  results.push({ name, passed, detail });
  const tag = passed ? "[PASS]" : "[FAIL]";
  const time = `(${elapsed}ms)`;
  const msg = detail ? `${tag} ${name} ${time} -- ${detail}` : `${tag} ${name} ${time}`;
  console.log(msg);
}

// ── CHECK 1: Checkup analyze ──────────────────────────────────────────
async function check1() {
  const name = "CHECK 1: Checkup analyze";
  startTimer();
  try {
    const { status, data } = await http("POST", "/api/checkup/analyze", {
      timeoutMs: 30_000,
      body: {
        placeId: SLC_PLACE_ID,
        name: "Smoke Test Dental",
        city: "Salt Lake City",
        state: "UT",
        category: "dentist",
      },
    });

    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }

    const score = data?.score?.composite ?? data?.score;
    const scoreNum = typeof score === "number" ? score : Number(score);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      return record(name, false, `score not 0-100: ${JSON.stringify(score)}`);
    }
    if (!Array.isArray(data?.competitors)) {
      return record(name, false, "competitors is not an array");
    }
    record(name, true, `score=${scoreNum}, ${data.competitors.length} competitors`);
  } catch (e: any) {
    record(name, false, e.message);
  }
}

// ── CHECK 2: Account creation ─────────────────────────────────────────
async function check2() {
  const name = "CHECK 2: Account creation";
  startTimer();
  const timestamp = Date.now();
  try {
    const { status, data } = await http("POST", "/api/checkup/create-account", {
      body: {
        email: `smoke-test-${timestamp}@getalloro.com`,
        password: "SmokeTest123!",
        practice_name: "Smoke Test Practice",
        relationship: "doctor",
      },
    });

    if (status !== 200) {
      return record(name, false, `status ${status}: ${JSON.stringify(data)}`);
    }

    const token = data?.token;
    const orgId = data?.organizationId;

    if (typeof token !== "string" || !token) {
      return record(name, false, "missing token");
    }
    if (typeof orgId !== "number") {
      return record(name, false, `organizationId not a number: ${orgId}`);
    }

    createdToken = token;
    createdOrgId = orgId;
    record(name, true, `orgId=${orgId}`);
  } catch (e: any) {
    record(name, false, e.message);
  }
}

// ── CHECK 3: Dashboard context loads ──────────────────────────────────
async function check3() {
  const name = "CHECK 3: Dashboard context loads";
  startTimer();
  if (!createdToken) {
    return record(name, false, "skipped -- no token from Check 2");
  }
  try {
    const { status, data } = await http("GET", "/api/user/dashboard-context", {
      token: createdToken,
    });
    if (status !== 200) {
      return record(name, false, `status ${status}`);
    }
    if (typeof data !== "object" || data === null || data.error) {
      return record(name, false, `unexpected body: ${JSON.stringify(data)}`);
    }
    record(name, true);
  } catch (e: any) {
    record(name, false, e.message);
  }
}

// ── CHECK 4: Pilot feature present ───────────────────────────────────
async function check4() {
  const name = "CHECK 4: Pilot feature (admin orgs)";
  startTimer();
  if (!ADMIN_TOKEN) {
    return record(name, false, "skipped -- SMOKE_ADMIN_TOKEN not set");
  }
  try {
    const { status, data } = await http("GET", "/api/admin/organizations", {
      token: ADMIN_TOKEN,
    });
    if (status !== 200) {
      return record(name, false, `list status ${status}`);
    }
    const orgs = data?.organizations;
    if (!Array.isArray(orgs) || orgs.length === 0) {
      return record(name, false, "organizations array empty");
    }

    const firstId = orgs[0].id;
    const detail = await http("GET", `/api/admin/organizations/${firstId}`, {
      token: ADMIN_TOKEN,
    });
    if (detail.status !== 200) {
      return record(name, false, `detail status ${detail.status}`);
    }
    const org = detail.data?.organization;
    if (!org?.id || !org?.name) {
      return record(name, false, "detail missing id or name");
    }
    record(name, true, `verified org ${firstId}: ${org.name}`);
  } catch (e: any) {
    record(name, false, e.message);
  }
}

// ── CHECK 5: Demo account accessible ─────────────────────────────────
async function check5() {
  const name = "CHECK 5: Demo account accessible";
  startTimer();
  try {
    const { status, data } = await http("GET", "/api/demo/login");
    if (status !== 200) {
      return record(name, false, `login status ${status}`);
    }
    if (typeof data?.token !== "string" || !data.token) {
      return record(name, false, "missing demo token");
    }

    const dash = await http("GET", "/api/user/dashboard-context", {
      token: data.token,
    });
    if (dash.status !== 200) {
      return record(name, false, `dashboard-context status ${dash.status}`);
    }
    record(name, true);
  } catch (e: any) {
    record(name, false, e.message);
  }
}

// ── CHECK 6: Health check ─────────────────────────────────────────────
async function check6() {
  const name = "CHECK 6: Health check";
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
  } catch (e: any) {
    record(name, false, e.message);
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────
async function cleanup() {
  if (!createdOrgId || !ADMIN_TOKEN) return;
  try {
    await http("DELETE", `/api/admin/organizations/${createdOrgId}`, {
      token: ADMIN_TOKEN,
      body: { confirmDelete: true },
    });
    console.log(`[CLEANUP] Deleted smoke-test org ${createdOrgId}`);
  } catch {
    console.log(`[CLEANUP] Failed to delete org ${createdOrgId} -- manual cleanup needed`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSmoke Test targeting: ${BASE_URL}\n`);

  try {
    await check1();
    await check2();
    await check3();
    await check4();
    await check5();
    await check6();
  } finally {
    await cleanup();
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\nSMOKE TEST: ${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
