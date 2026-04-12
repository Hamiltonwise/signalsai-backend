/**
 * Customer Reality Check
 *
 * Per-org, per-page pass/fail verification.
 * Answers: "If this customer logged in right now, would each page embarrass us?"
 *
 * This is NOT a test suite. It checks what the frontend actually renders
 * by querying the same data sources each page reads. If a check fails,
 * the customer would see blank, stale, or generic content.
 *
 * Usage:
 *   import { runRealityCheck } from "./customerRealityCheck";
 *   const result = await runRealityCheck(orgId);
 *   // result.verdict: "GREEN" | "AMBER" | "RED"
 *   // result.pages: { home, compare, reviews, presence, progress }
 */

import { db } from "../database/connection";

// ── Types ──

export interface PageCheck {
  page: string;
  pass: boolean;
  checks: CheckResult[];
  failCount: number;
}

export interface CheckResult {
  name: string;
  pass: boolean;
  value: string;
  severity: "critical" | "important" | "nice";
}

export interface RealityCheckResult {
  orgId: number;
  orgName: string;
  verdict: "GREEN" | "AMBER" | "RED";
  score: number;
  pages: {
    home: PageCheck;
    compare: PageCheck;
    reviews: PageCheck;
    presence: PageCheck;
    progress: PageCheck;
  };
  summary: string;
  checkedAt: string;
}

// ── Helpers ──

function tryParse(str: string): any {
  try { return JSON.parse(str); } catch { return null; }
}

function check(name: string, pass: boolean, value: string, severity: CheckResult["severity"] = "important"): CheckResult {
  return { name, pass, value, severity };
}

// ── Page Checks ──

async function checkHome(orgId: number, org: any, checkup: any): Promise<PageCheck> {
  const checks: CheckResult[] = [];

  // 1. Greeting -- needs a user with first_name
  const orgUser = await db("organization_users")
    .where({ organization_id: orgId })
    .first();
  const user = orgUser
    ? await db("users").where({ id: orgUser.user_id }).select("first_name").first()
    : null;
  checks.push(check(
    "Greeting",
    !!(user?.first_name),
    user?.first_name ? `"Good morning, ${user.first_name}"` : "No user or missing first_name",
    "critical",
  ));

  // 2. Star rating from checkup
  const rating = checkup?.googleData?.rating ?? checkup?.rating ?? null;
  checks.push(check(
    "Star Rating",
    rating != null && rating > 0,
    rating ? `${rating} stars` : "No rating in checkup_data",
    "critical",
  ));

  // 3. Review count
  const reviewCount = checkup?.googleData?.userRatingCount
    ?? checkup?.googleData?.user_ratings_total
    ?? checkup?.reviewCount
    ?? null;
  checks.push(check(
    "Review Count",
    reviewCount != null && reviewCount > 0,
    reviewCount ? `${reviewCount} reviews` : "No review count",
    "important",
  ));

  // 4. Ranking data exists
  const ranking = await db("practice_rankings")
    .where({ organization_id: orgId, status: "completed" })
    .orderBy("created_at", "desc")
    .first();
  checks.push(check(
    "Market Ranking",
    !!ranking,
    ranking ? `#${ranking.rank_position}/${ranking.total_competitors}` : "No ranking snapshot",
    "critical",
  ));

  // 5. Top competitor named
  const rankingData = ranking?.ranking_data
    ? (typeof ranking.ranking_data === "string" ? tryParse(ranking.ranking_data) : ranking.ranking_data)
    : null;
  const topComp = rankingData?.topCompetitor?.name || rankingData?.competitors?.[0]?.name || null;
  checks.push(check(
    "Top Competitor Named",
    !!topComp,
    topComp || "No competitor identified",
    "important",
  ));

  // 6. Oz moment / action card
  const ozResult = await db("agent_results")
    .where({ organization_id: orgId, agent_type: "oz_moment" })
    .orderBy("created_at", "desc")
    .first()
    .catch(() => null);
  // Also check if checkup has sentimentComparison (ozEngine reads from it)
  const hasSentiment = !!checkup?.sentimentComparison?.data?.insight;
  checks.push(check(
    "Oz Moment",
    !!(ozResult || hasSentiment),
    ozResult ? "Agent result exists" : hasSentiment ? "Sentiment comparison cached" : "No Oz data",
    "important",
  ));

  // 7. Profile completeness score
  const completeness = checkup?.profileCompleteness ?? checkup?.completenessScore ?? null;
  checks.push(check(
    "Profile Completeness",
    completeness != null,
    completeness != null ? `${completeness}` : "Not computed",
    "nice",
  ));

  const failCount = checks.filter((c) => !c.pass).length;
  const criticalFails = checks.filter((c) => !c.pass && c.severity === "critical").length;
  return {
    page: "Home",
    pass: criticalFails === 0,
    checks,
    failCount,
  };
}

async function checkCompare(orgId: number, _org: any, _checkup: any): Promise<PageCheck> {
  const checks: CheckResult[] = [];

  // 1. Ranking with competitors
  const ranking = await db("practice_rankings")
    .where({ organization_id: orgId, status: "completed" })
    .orderBy("created_at", "desc")
    .first();
  const rd = ranking?.ranking_data
    ? (typeof ranking.ranking_data === "string" ? tryParse(ranking.ranking_data) : ranking.ranking_data)
    : null;
  const competitors = rd?.competitors || [];
  checks.push(check(
    "Competitors Found",
    competitors.length > 0,
    competitors.length > 0 ? `${competitors.length} competitors` : "No competitor data",
    "critical",
  ));

  // 2. Top competitor has rating (not N/A)
  const topComp = rd?.topCompetitor || competitors[0] || null;
  const hasRating = topComp && topComp.rating != null && topComp.rating > 0;
  checks.push(check(
    "Top Competitor Rating",
    !!hasRating,
    hasRating ? `${topComp.name}: ${topComp.rating} stars` : topComp ? `${topComp.name}: N/A` : "No top competitor",
    "important",
  ));

  // 3. Top competitor has photo count
  const hasPhotos = topComp && topComp.photoCount != null;
  checks.push(check(
    "Top Competitor Photos",
    !!hasPhotos,
    hasPhotos ? `${topComp.photoCount} photos` : "Photo count missing",
    "nice",
  ));

  // 4. Focus recommendations
  const hasFocus = rd?.focusAreas?.length > 0 || rd?.recommendations?.length > 0;
  checks.push(check(
    "Focus Recommendations",
    !!hasFocus,
    hasFocus ? "Present" : "No focus areas or recommendations",
    "important",
  ));

  const failCount = checks.filter((c) => !c.pass).length;
  const criticalFails = checks.filter((c) => !c.pass && c.severity === "critical").length;
  return { page: "Compare", pass: criticalFails === 0, checks, failCount };
}

async function checkReviews(orgId: number, org: any, checkup: any): Promise<PageCheck> {
  const checks: CheckResult[] = [];

  // 1. Review notifications exist (individual reviews synced)
  let reviewCount = 0;
  try {
    const hasTable = await db.schema.hasTable("review_notifications");
    if (hasTable) {
      const result = await db("review_notifications")
        .where({ organization_id: orgId })
        .count("id as c")
        .first();
      reviewCount = Number(result?.c || 0);
    }
  } catch { /* table may not exist */ }
  checks.push(check(
    "Individual Reviews Synced",
    reviewCount > 0,
    reviewCount > 0 ? `${reviewCount} reviews` : "review_notifications empty (worker hasn't run)",
    "critical",
  ));

  // 2. Overall rating available
  const rating = checkup?.googleData?.rating ?? checkup?.rating ?? null;
  checks.push(check(
    "Overall Rating",
    rating != null,
    rating ? `${rating} stars` : "No rating",
    "important",
  ));

  // 3. Sentiment comparison cached
  const hasSentiment = !!checkup?.sentimentComparison?.data?.insight;
  checks.push(check(
    "Sentiment Comparison",
    hasSentiment,
    hasSentiment ? checkup.sentimentComparison.data.insight.substring(0, 80) : "Not cached -- /api/user/review-sentiment not yet called",
    "important",
  ));

  // 4. Has a place_id (needed for review sync)
  const placeId = org.google_place_id || checkup?.placeId || null;
  checks.push(check(
    "Google Place ID",
    !!placeId,
    placeId ? placeId.substring(0, 30) + "..." : "Missing -- review sync cannot run",
    "critical",
  ));

  const failCount = checks.filter((c) => !c.pass).length;
  const criticalFails = checks.filter((c) => !c.pass && c.severity === "critical").length;
  return { page: "Reviews", pass: criticalFails === 0, checks, failCount };
}

async function checkPresence(orgId: number, org: any, checkup: any): Promise<PageCheck> {
  const checks: CheckResult[] = [];

  // 1. Website URL exists
  const website = checkup?.googleData?.websiteUri || checkup?.website || org.website_url || null;
  checks.push(check(
    "Website URL",
    !!website,
    website || "No website URL",
    "important",
  ));

  // 2. Phone number
  const phone = checkup?.googleData?.nationalPhoneNumber
    || checkup?.googleData?.internationalPhoneNumber
    || checkup?.phone
    || null;
  checks.push(check(
    "Phone Number",
    !!phone,
    phone || "Missing",
    "important",
  ));

  // 3. Hours
  const hours = checkup?.googleData?.regularOpeningHours
    || checkup?.googleData?.openingHours
    || checkup?.hours
    || null;
  checks.push(check(
    "Business Hours",
    !!hours,
    hours ? "Present" : "Missing",
    "important",
  ));

  // 4. GBP profile completeness fields
  const fields = ["phone", "website", "hours", "description", "photos"];
  const present = fields.filter((f) => {
    if (f === "phone") return !!phone;
    if (f === "website") return !!website;
    if (f === "hours") return !!hours;
    if (f === "description") return !!(checkup?.googleData?.description || checkup?.description);
    if (f === "photos") return (checkup?.googleData?.photoCount ?? checkup?.photoCount ?? 0) > 0;
    return false;
  });
  checks.push(check(
    "GBP Completeness",
    present.length >= 3,
    `${present.length}/5 fields (${present.join(", ") || "none"})`,
    "critical",
  ));

  const failCount = checks.filter((c) => !c.pass).length;
  const criticalFails = checks.filter((c) => !c.pass && c.severity === "critical").length;
  return { page: "Presence", pass: criticalFails === 0, checks, failCount };
}

async function checkProgress(orgId: number, _org: any, checkup: any): Promise<PageCheck> {
  const checks: CheckResult[] = [];

  // 1. Proofline exists (trajectory sentence)
  const proofline = await db("agent_results")
    .where({ organization_id: orgId, agent_type: "proofline" })
    .orderBy("created_at", "desc")
    .first()
    .catch(() => null);
  const proofOut = proofline?.agent_output
    ? (typeof proofline.agent_output === "string" ? tryParse(proofline.agent_output) : proofline.agent_output)
    : null;
  const traj = proofOut?.trajectory || proofOut?.results?.[0]?.trajectory || "";
  checks.push(check(
    "Trajectory Sentence",
    traj.length > 20,
    traj ? traj.substring(0, 80) : "No proofline data",
    "critical",
  ));

  // 2. Ranking snapshots (at least one)
  const snapCount = await db("practice_rankings")
    .where({ organization_id: orgId, status: "completed" })
    .count("id as c")
    .first();
  const sc = Number(snapCount?.c || 0);
  checks.push(check(
    "Ranking Snapshots",
    sc > 0,
    sc > 0 ? `${sc} snapshots` : "No ranking history",
    "critical",
  ));

  // 3. Days since signup (for "monitoring for X days" line)
  const created = checkup?.createdAt || null;
  checks.push(check(
    "Monitoring Duration",
    !!created,
    created ? `Since ${new Date(created).toLocaleDateString()}` : "No created_at in checkup",
    "nice",
  ));

  // 4. Profile completeness has a starting value (for Start vs Now comparison)
  const startComp = checkup?.profileCompleteness ?? null;
  checks.push(check(
    "Starting Completeness",
    startComp != null,
    startComp != null ? `Start: ${startComp}/5` : "No baseline completeness recorded",
    "important",
  ));

  const failCount = checks.filter((c) => !c.pass).length;
  const criticalFails = checks.filter((c) => !c.pass && c.severity === "critical").length;
  return { page: "Progress", pass: criticalFails === 0, checks, failCount };
}

// ── Main ──

export async function runRealityCheck(orgId: number): Promise<RealityCheckResult> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) {
    throw new Error(`Organization ${orgId} not found`);
  }

  const checkup = org.checkup_data
    ? (typeof org.checkup_data === "string" ? tryParse(org.checkup_data) : org.checkup_data)
    : null;

  const [home, compare, reviews, presence, progress] = await Promise.all([
    checkHome(orgId, org, checkup),
    checkCompare(orgId, org, checkup),
    checkReviews(orgId, org, checkup),
    checkPresence(orgId, org, checkup),
    checkProgress(orgId, org, checkup),
  ]);

  const pages = { home, compare, reviews, presence, progress };
  const allPages = [home, compare, reviews, presence, progress];
  const totalChecks = allPages.reduce((s, p) => s + p.checks.length, 0);
  const passingChecks = allPages.reduce((s, p) => s + p.checks.filter((c) => c.pass).length, 0);
  const score = Math.round((passingChecks / totalChecks) * 100);

  const criticalFails = allPages.flatMap((p) =>
    p.checks.filter((c) => !c.pass && c.severity === "critical"),
  );
  const pagesDown = allPages.filter((p) => !p.pass).map((p) => p.page);

  let verdict: RealityCheckResult["verdict"] = "GREEN";
  if (criticalFails.length > 0) verdict = "RED";
  else if (pagesDown.length > 0 || score < 80) verdict = "AMBER";

  let summary: string;
  if (verdict === "GREEN") {
    summary = `All 5 pages pass. ${passingChecks}/${totalChecks} checks green.`;
  } else if (verdict === "AMBER") {
    summary = `${pagesDown.length} page(s) have issues: ${pagesDown.join(", ")}. ${passingChecks}/${totalChecks} checks pass.`;
  } else {
    summary = `${criticalFails.length} critical failure(s): ${criticalFails.map((c) => c.name).join(", ")}. Pages down: ${pagesDown.join(", ")}.`;
  }

  return {
    orgId,
    orgName: org.name,
    verdict,
    score,
    pages,
    summary,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Run reality check for all active customers.
 * Returns array sorted worst-first.
 */
export async function runAllCustomerChecks(): Promise<{
  customers: RealityCheckResult[];
  overallVerdict: "GREEN" | "AMBER" | "RED";
  worstOrg: string | null;
}> {
  const activeOrgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .select("id");

  const results = await Promise.all(
    activeOrgs.map((o: { id: number }) => runRealityCheck(o.id).catch((err) => ({
      orgId: o.id,
      orgName: `Org ${o.id} (error)`,
      verdict: "RED" as const,
      score: 0,
      pages: {} as any,
      summary: `Error: ${err.message}`,
      checkedAt: new Date().toISOString(),
    }))),
  );

  results.sort((a, b) => a.score - b.score);

  const hasRed = results.some((r) => r.verdict === "RED");
  const hasAmber = results.some((r) => r.verdict === "AMBER");
  const overallVerdict = hasRed ? "RED" : hasAmber ? "AMBER" : "GREEN";
  const worstOrg = results.length > 0 && results[0].verdict !== "GREEN" ? results[0].orgName : null;

  return { customers: results, overallVerdict, worstOrg };
}
