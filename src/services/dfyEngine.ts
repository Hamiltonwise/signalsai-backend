/**
 * DFY Execution Engine
 *
 * The autopilot layer. Does the work, shows the receipt.
 *
 * Three execution capabilities:
 * 1. GBP Post Publishing -- weekly posts to Google Business Profile
 * 2. CRO Auto-Apply -- title/meta changes to PatientPath pages
 * 3. Target Competitor Lock -- gap analysis + directed execution
 *
 * Every action records to behavioral_events as dfy.* for proof-of-work.
 * The Monday email reads these to show the owner what Alloro did.
 *
 * Owner.com proved the model: do the work, show the receipt, charge for outcomes.
 */

import crypto from "crypto";
import axios from "axios";
import { db } from "../database/connection";
import { getValidOAuth2ClientByOrg } from "../auth/oauth2Helper";
import { buildAuthHeaders } from "../controllers/gbp/gbp-services/gbp-api.service";
import { runCROEngine, type CRORecommendation } from "./croEngine";
import { runAgent } from "../agents/service.llm-runner";

// =====================================================================
// 1. GBP POST PUBLISHING
// =====================================================================

/**
 * Generate and publish a Google Business Profile post for an org.
 * Uses specialty, city, and recent activity to create relevant content.
 * Records dfy.gbp_post_published to behavioral_events.
 */
export async function publishGBPPost(orgId: number): Promise<{
  success: boolean;
  postSummary?: string;
  error?: string;
}> {
  try {
    // Get org data for content generation
    const org = await db("organizations")
      .where({ id: orgId })
      .select("name", "specialty", "city", "state", "checkup_data")
      .first();

    if (!org) return { success: false, error: "Org not found" };

    // Get GBP location info
    const connection = await db("google_connections")
      .where({ organization_id: orgId })
      .whereNotNull("refresh_token")
      .first();

    if (!connection) return { success: false, error: "No GBP connection" };

    const locationName = connection.location_name || connection.location_resource_name;
    const accountId = connection.account_id;
    const locationId = connection.location_id;

    if (!accountId || !locationId) {
      return { success: false, error: "Missing GBP account/location IDs" };
    }

    // Generate post content via LLM
    const postContent = await generatePostContent(org);
    if (!postContent) return { success: false, error: "Failed to generate post content" };

    // Publish to GBP via v4 API
    const auth = await getValidOAuth2ClientByOrg(orgId);
    const headers = await buildAuthHeaders(auth);

    const parent = locationName || `accounts/${accountId}/locations/${locationId}`;

    const { data } = await axios.post(
      `https://mybusiness.googleapis.com/v4/${parent}/localPosts`,
      {
        languageCode: "en-US",
        summary: postContent,
        topicType: "STANDARD",
      },
      { headers, timeout: 15000 },
    );

    const postId = data?.name?.split("/").pop() || "unknown";
    console.log(`[DFY] Published GBP post for org ${orgId}: ${postId}`);

    // Record the receipt
    await recordDFYAction(orgId, "dfy.gbp_post_published", {
      post_id: postId,
      summary: postContent.slice(0, 200),
      generated_by: "dfy_engine",
    });

    return { success: true, postSummary: postContent };
  } catch (err: any) {
    const message = err?.response?.data?.error?.message || err.message;
    console.error(`[DFY] GBP post failed for org ${orgId}: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Generate a GBP post tailored to the practice's specialty and city.
 * Short, human, locally relevant. Never generic.
 */
async function generatePostContent(org: {
  name: string;
  specialty: string;
  city: string;
  state: string;
}): Promise<string | null> {
  const model = process.env.LLM_MODEL || "claude-sonnet-4-6";

  try {
    const result = await runAgent({
      systemPrompt: `You write Google Business Profile posts for local service businesses. Rules:
- Under 300 words. Most posts should be 80-150 words.
- Write like a real person, not a marketing agency.
- Reference the city name naturally.
- Reference the specialty naturally.
- Include one specific, helpful tip or insight relevant to potential patients/clients in that area.
- Never use em-dashes. Use commas or periods.
- Never use generic phrases like "trusted provider" or "quality care."
- Never include hashtags.
- End with a soft call to action (call us, visit our website, schedule online).
- The post should make someone scrolling Google Maps stop and read.`,
      userMessage: `Write a Google Business Profile post for ${org.name}, a ${org.specialty} practice in ${org.city}, ${org.state}. Make it feel local and helpful.`,
      model,
      maxTokens: 500,
      temperature: 0.7,
    });

    return result.raw?.trim() || null;
  } catch {
    return null;
  }
}

// =====================================================================
// 2. CRO AUTO-EXECUTION
// =====================================================================

/**
 * Run CRO engine and auto-apply safe changes (title/meta only).
 * Records before/after for each change so the Monday email can show results.
 *
 * This bridges the gap: CRO engine generates recommendations,
 * this function executes the auto-executable ones via the AI Command pipeline.
 */
export async function executeCRORecommendations(orgId: number): Promise<{
  applied: number;
  skipped: number;
  recommendations: CRORecommendation[];
}> {
  const { recommendations } = await runCROEngine(orgId);

  if (recommendations.length === 0) {
    return { applied: 0, skipped: 0, recommendations: [] };
  }

  let applied = 0;
  let skipped = 0;

  for (const rec of recommendations) {
    if (!rec.autoExecutable) {
      skipped++;
      continue;
    }

    // Only auto-execute title and meta_description changes
    if (rec.changeType !== "title" && rec.changeType !== "meta_description") {
      skipped++;
      continue;
    }

    try {
      // Find the PatientPath page
      const project = await db("website_builder.projects")
        .where({ organization_id: orgId })
        .whereIn("status", ["published", "live"])
        .first();

      if (!project) {
        skipped++;
        continue;
      }

      const page = await db("website_builder.pages")
        .where({ project_id: project.id })
        .where(function () {
          this.where("path", rec.pageUrl)
            .orWhere("path", rec.pageUrl.replace(/^\//, ""));
        })
        .where("status", "published")
        .first();

      if (!page) {
        skipped++;
        continue;
      }

      // Read current SEO data
      const currentSeo = typeof page.seo_data === "string"
        ? JSON.parse(page.seo_data)
        : page.seo_data || {};

      const beforeValue = rec.changeType === "title"
        ? currentSeo.meta_title || ""
        : currentSeo.meta_description || "";

      // Apply the change
      const updatedSeo = { ...currentSeo };
      if (rec.changeType === "title") {
        updatedSeo.meta_title = rec.recommendedValue;
      } else {
        updatedSeo.meta_description = rec.recommendedValue;
      }

      await db("website_builder.pages")
        .where({ id: page.id })
        .update({
          seo_data: JSON.stringify(updatedSeo),
          updated_at: new Date(),
        });

      applied++;

      // Record the receipt with before/after
      await recordDFYAction(orgId, "dfy.cro_applied", {
        page_path: rec.pageUrl,
        change_type: rec.changeType,
        before: beforeValue,
        after: rec.recommendedValue,
        trigger: rec.trigger,
        expected_impact: rec.expectedImpact,
      });

      console.log(`[DFY] CRO applied ${rec.changeType} on ${rec.pageUrl} for org ${orgId}`);
    } catch (err: any) {
      console.error(`[DFY] CRO apply failed for org ${orgId}: ${err.message}`);
      skipped++;
    }
  }

  return { applied, skipped, recommendations };
}

// =====================================================================
// 3. TARGET COMPETITOR ANALYSIS
// =====================================================================

/**
 * Analyze the gap between client and their target competitor.
 * Returns specific, actionable gaps across all dimensions.
 *
 * This powers "beat Centreville" -- not just review count,
 * but photos, posts, rating, response rate, GBP completeness.
 */
export async function analyzeTargetCompetitorGap(orgId: number): Promise<{
  gaps: CompetitorGap[];
  summary: string;
} | null> {
  const org = await db("organizations")
    .where({ id: orgId })
    .select("id", "name", "checkup_data", "target_competitor_place_id", "target_competitor_name")
    .first();

  if (!org?.target_competitor_place_id) return null;

  const cd = org.checkup_data
    ? (typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data)
    : null;

  // Get client's GBP data
  const clientPlace = cd?.place || {};
  const clientReviews = clientPlace.reviewCount || cd?.reviewCount || 0;
  const clientRating = clientPlace.rating || cd?.rating || 0;
  const clientPhotos = clientPlace.photosCount || clientPlace.photoCount || 0;

  // Get target competitor from most recent checkup/ranking data
  // First check weekly_ranking_snapshots for fresh data
  const snapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .first();

  const compReviews = snapshot?.competitor_review_count || 0;
  const compRating = snapshot?.competitor_rating || 0;

  // Check GBP post activity (last 30 days)
  let clientPostCount = 0;
  try {
    const recentPosts = await db("behavioral_events")
      .where({ org_id: orgId })
      .where("event_type", "dfy.gbp_post_published")
      .where("created_at", ">=", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .count("id as cnt")
      .first();
    clientPostCount = parseInt(String(recentPosts?.cnt || 0), 10);
  } catch {
    // behavioral_events may not exist
  }

  // Build gap analysis
  const gaps: CompetitorGap[] = [];
  const targetName = org.target_competitor_name || "your target competitor";

  // Review count gap
  const reviewGap = compReviews - clientReviews;
  if (reviewGap > 0) {
    gaps.push({
      dimension: "reviews",
      clientValue: clientReviews,
      competitorValue: compReviews,
      gap: reviewGap,
      action: `Send ${Math.min(reviewGap, 3)} review requests this week`,
      autoExecutable: false,
      priority: reviewGap > 50 ? "high" : reviewGap > 15 ? "medium" : "low",
    });
  }

  // Rating gap
  const ratingGap = compRating - clientRating;
  if (ratingGap > 0.2) {
    gaps.push({
      dimension: "rating",
      clientValue: clientRating,
      competitorValue: compRating,
      gap: parseFloat(ratingGap.toFixed(1)),
      action: "Focus on patient experience. Every 5-star review moves the average.",
      autoExecutable: false,
      priority: ratingGap > 0.5 ? "high" : "medium",
    });
  }

  // GBP post activity gap (we can fix this automatically)
  if (clientPostCount < 4) {
    gaps.push({
      dimension: "gbp_posts",
      clientValue: clientPostCount,
      competitorValue: 4, // Industry standard: weekly posts
      gap: 4 - clientPostCount,
      action: "Alloro will publish weekly GBP posts automatically",
      autoExecutable: true,
      priority: "medium",
    });
  }

  // Photo count gap
  if (clientPhotos < 10) {
    gaps.push({
      dimension: "photos",
      clientValue: clientPhotos,
      competitorValue: 10, // Threshold for "photo-rich" listing
      gap: 10 - clientPhotos,
      action: "Add 3 photos of your practice, team, or office this week",
      autoExecutable: false,
      priority: clientPhotos < 3 ? "high" : "low",
    });
  }

  // Generate summary
  const autoFixable = gaps.filter(g => g.autoExecutable).length;
  const ownerAction = gaps.filter(g => !g.autoExecutable && g.priority !== "low").length;

  const summary = gaps.length === 0
    ? `You match or lead ${targetName} across all tracked dimensions. Alloro is monitoring weekly.`
    : `${gaps.length} gap${gaps.length !== 1 ? "s" : ""} with ${targetName}. Alloro can auto-fix ${autoFixable}. ${ownerAction} need${ownerAction !== 1 ? "" : "s"} your action.`;

  return { gaps, summary };
}

export interface CompetitorGap {
  dimension: string;
  clientValue: number;
  competitorValue: number;
  gap: number;
  action: string;
  autoExecutable: boolean;
  priority: "high" | "medium" | "low";
}

// =====================================================================
// 4. PENDING ACTION INFRASTRUCTURE (draft-then-approve)
// =====================================================================

/**
 * Create a pending action for owner approval.
 * Returns the approval token for use in email links.
 *
 * At 5 clients, auto-execute is fine. At 10,000, you need this.
 */
export async function createPendingAction(params: {
  orgId: number;
  actionType: string;
  payload: Record<string, unknown>;
  previewTitle: string;
  previewBody: string;
  expiresInDays?: number;
}): Promise<{ id: string; token: string } | null> {
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (params.expiresInDays || 7));

    const [action] = await db("pending_actions")
      .insert({
        org_id: params.orgId,
        action_type: params.actionType,
        status: "draft",
        payload: JSON.stringify(params.payload),
        preview_title: params.previewTitle,
        preview_body: params.previewBody,
        approval_token: token,
        expires_at: expiresAt,
      })
      .returning(["id", "approval_token"]);

    return { id: action.id, token: action.approval_token };
  } catch (err: any) {
    console.error(`[DFY] Failed to create pending action: ${err.message}`);
    return null;
  }
}

/**
 * Execute an approved action. Called by the approval route after token validation.
 * Dispatches to the appropriate executor based on action_type.
 */
export async function executeApprovedAction(
  action: {
    id: string;
    org_id: number;
    action_type: string;
    payload: Record<string, unknown> | string;
  },
): Promise<{ success: boolean; detail?: string }> {
  const payload = typeof action.payload === "string"
    ? JSON.parse(action.payload)
    : action.payload;

  switch (action.action_type) {
    case "gbp_post":
      return executeGBPPostFromDraft(action.org_id, payload);
    case "cro_title":
    case "cro_meta":
      return executeCROFromDraft(action.org_id, payload);
    default:
      return { success: false, detail: `Unknown action type: ${action.action_type}` };
  }
}

/**
 * Execute a GBP post from a previously drafted pending action.
 * The content was already generated and stored in the payload.
 */
async function executeGBPPostFromDraft(
  orgId: number,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; detail?: string }> {
  try {
    const postContent = payload.content as string;
    if (!postContent) return { success: false, detail: "No content in payload" };

    const connection = await db("google_connections")
      .where({ organization_id: orgId })
      .whereNotNull("refresh_token")
      .first();

    if (!connection) return { success: false, detail: "No GBP connection" };

    const accountId = connection.account_id;
    const locationId = connection.location_id;
    const locationName = connection.location_name || connection.location_resource_name;

    if (!accountId || !locationId) {
      return { success: false, detail: "Missing GBP account/location IDs" };
    }

    const auth = await getValidOAuth2ClientByOrg(orgId);
    const headers = await buildAuthHeaders(auth);
    const parent = locationName || `accounts/${accountId}/locations/${locationId}`;

    const { data } = await axios.post(
      `https://mybusiness.googleapis.com/v4/${parent}/localPosts`,
      {
        languageCode: "en-US",
        summary: postContent,
        topicType: "STANDARD",
      },
      { headers, timeout: 15000 },
    );

    const postId = data?.name?.split("/").pop() || "unknown";

    await recordDFYAction(orgId, "dfy.gbp_post_published", {
      post_id: postId,
      summary: postContent.slice(0, 200),
      generated_by: "dfy_engine",
      approved: true,
    });

    return { success: true, detail: `Post ${postId} published` };
  } catch (err: any) {
    const message = err?.response?.data?.error?.message || err.message;
    return { success: false, detail: message };
  }
}

/**
 * Execute a CRO change from a previously drafted pending action.
 */
async function executeCROFromDraft(
  orgId: number,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; detail?: string }> {
  try {
    const pageId = payload.page_id as number;
    const changeType = payload.change_type as string;
    const newValue = payload.recommended_value as string;

    if (!pageId || !changeType || !newValue) {
      return { success: false, detail: "Incomplete CRO payload" };
    }

    const page = await db("website_builder.pages")
      .where({ id: pageId })
      .first();

    if (!page) return { success: false, detail: "Page not found" };

    const currentSeo = typeof page.seo_data === "string"
      ? JSON.parse(page.seo_data)
      : page.seo_data || {};

    const beforeValue = changeType === "title"
      ? currentSeo.meta_title || ""
      : currentSeo.meta_description || "";

    const updatedSeo = { ...currentSeo };
    if (changeType === "title") {
      updatedSeo.meta_title = newValue;
    } else {
      updatedSeo.meta_description = newValue;
    }

    await db("website_builder.pages")
      .where({ id: pageId })
      .update({
        seo_data: JSON.stringify(updatedSeo),
        updated_at: new Date(),
      });

    await recordDFYAction(orgId, "dfy.cro_applied", {
      page_path: payload.page_path,
      change_type: changeType,
      before: beforeValue,
      after: newValue,
      approved: true,
    });

    return { success: true, detail: `${changeType} updated on ${payload.page_path}` };
  } catch (err: any) {
    return { success: false, detail: err.message };
  }
}

// =====================================================================
// 5. DRAFT CREATORS (generate content, save as pending, don't execute)
// =====================================================================

/**
 * Draft a GBP post for owner approval.
 * Generates the content via LLM but stores it in pending_actions instead of posting.
 */
export async function draftGBPPost(orgId: number): Promise<{
  drafted: boolean;
  token?: string;
  error?: string;
}> {
  try {
    // Dedup: skip if an unexpired GBP draft already exists for this org
    const existing = await db("pending_actions")
      .where({ org_id: orgId, action_type: "gbp_post", status: "draft" })
      .where("expires_at", ">", new Date())
      .first();

    if (existing) {
      return { drafted: false, error: "Unexpired GBP draft already exists" };
    }

    const org = await db("organizations")
      .where({ id: orgId })
      .select("name", "specialty", "city", "state", "checkup_data")
      .first();

    if (!org) return { drafted: false, error: "Org not found" };

    // Check GBP connection exists (we'll need it at execution time)
    const connection = await db("google_connections")
      .where({ organization_id: orgId })
      .whereNotNull("refresh_token")
      .first();

    if (!connection) return { drafted: false, error: "No GBP connection" };

    // Generate content (same LLM call as before)
    const postContent = await generatePostContent(org);
    if (!postContent) return { drafted: false, error: "Failed to generate post content" };

    // Store as pending action instead of publishing
    const result = await createPendingAction({
      orgId,
      actionType: "gbp_post",
      payload: {
        content: postContent,
        specialty: org.specialty,
        city: org.city,
      },
      previewTitle: `GBP Post for ${org.name}`,
      previewBody: postContent,
    });

    if (!result) return { drafted: false, error: "Failed to create pending action" };

    console.log(`[DFY] Drafted GBP post for org ${orgId} (token: ${result.token.slice(0, 8)}...)`);
    return { drafted: true, token: result.token };
  } catch (err: any) {
    console.error(`[DFY] GBP draft failed for org ${orgId}: ${err.message}`);
    return { drafted: false, error: err.message };
  }
}

/**
 * Draft CRO recommendations for owner approval.
 * Runs the CRO engine but stores changes as pending actions instead of applying.
 */
export async function draftCRORecommendations(orgId: number): Promise<{
  drafted: number;
  skipped: number;
}> {
  // Dedup: count unexpired CRO drafts. Skip if 3+ already waiting.
  const existingCROCount = await db("pending_actions")
    .where({ org_id: orgId, status: "draft" })
    .whereIn("action_type", ["cro_title", "cro_meta"])
    .where("expires_at", ">", new Date())
    .count("id as cnt")
    .first();

  if (parseInt(String(existingCROCount?.cnt || 0), 10) >= 3) {
    return { drafted: 0, skipped: 0 };
  }

  const { recommendations } = await runCROEngine(orgId);

  if (recommendations.length === 0) {
    return { drafted: 0, skipped: 0 };
  }

  let drafted = 0;
  let skipped = 0;

  for (const rec of recommendations) {
    if (!rec.autoExecutable) {
      skipped++;
      continue;
    }

    if (rec.changeType !== "title" && rec.changeType !== "meta_description") {
      skipped++;
      continue;
    }

    try {
      const project = await db("website_builder.projects")
        .where({ organization_id: orgId })
        .whereIn("status", ["published", "live"])
        .first();

      if (!project) { skipped++; continue; }

      const page = await db("website_builder.pages")
        .where({ project_id: project.id })
        .where(function () {
          this.where("path", rec.pageUrl)
            .orWhere("path", rec.pageUrl.replace(/^\//, ""));
        })
        .where("status", "published")
        .first();

      if (!page) { skipped++; continue; }

      const currentSeo = typeof page.seo_data === "string"
        ? JSON.parse(page.seo_data)
        : page.seo_data || {};

      const beforeValue = rec.changeType === "title"
        ? currentSeo.meta_title || ""
        : currentSeo.meta_description || "";

      const actionType = rec.changeType === "title" ? "cro_title" : "cro_meta";

      const previewBody = `Change ${rec.changeType} on ${rec.pageUrl}\n\nCurrent: ${beforeValue}\nRecommended: ${rec.recommendedValue}\n\nExpected impact: ${rec.expectedImpact}`;

      const result = await createPendingAction({
        orgId,
        actionType,
        payload: {
          page_id: page.id,
          page_path: rec.pageUrl,
          change_type: rec.changeType,
          current_value: beforeValue,
          recommended_value: rec.recommendedValue,
          trigger: rec.trigger,
          expected_impact: rec.expectedImpact,
        },
        previewTitle: `SEO: Update ${rec.changeType} on ${rec.pageUrl}`,
        previewBody,
      });

      if (result) {
        drafted++;
        console.log(`[DFY] Drafted CRO ${rec.changeType} for org ${orgId} on ${rec.pageUrl}`);
      } else {
        skipped++;
      }
    } catch (err: any) {
      console.error(`[DFY] CRO draft failed for org ${orgId}: ${err.message}`);
      skipped++;
    }
  }

  return { drafted, skipped };
}

// =====================================================================
// 6. WEEKLY DFY RUN (all orgs)
// =====================================================================

/**
 * Run the full DFY cycle for all active orgs.
 * Runs Mon/Wed/Fri via BullMQ so drafts are always fresh on the dashboard.
 *
 * DRAFT-THEN-APPROVE: Nothing executes automatically.
 * Dedup built-in: won't create duplicates if unexpired drafts exist.
 * For each org:
 * 1. Draft a GBP post (owner approves from dashboard or Monday email)
 * 2. Draft CRO changes (owner approves from dashboard or Monday email)
 * 3. Analyze target competitor gaps (informational, no approval needed)
 */
export async function runDFYForAllOrgs(): Promise<{
  processed: number;
  gbpDrafts: number;
  croDrafts: number;
  errors: number;
}> {
  const orgs = await db("organizations")
    .where(function () {
      this.where({ subscription_status: "active" })
        .orWhereNotNull("checkup_score")
        .orWhere("onboarding_completed", true);
    })
    .select("id", "name");

  let processed = 0;
  let gbpDrafts = 0;
  let croDrafts = 0;
  let errors = 0;

  for (const org of orgs) {
    try {
      // Skip test/demo orgs
      if (/\b(test|demo|smoke|seed|example)\b/i.test(org.name)) continue;

      processed++;

      // 1. Draft GBP Post (owner approves via Monday email)
      const postResult = await draftGBPPost(org.id);
      if (postResult.drafted) gbpDrafts++;

      // 2. Draft CRO changes (owner approves via Monday email)
      try {
        const croResult = await draftCRORecommendations(org.id);
        croDrafts += croResult.drafted;
      } catch (croErr: any) {
        console.error(`[DFY] CRO draft failed for ${org.name}: ${croErr.message}`);
      }

      // 3. Target competitor gap analysis (store for Oz Engine consumption)
      try {
        const gapResult = await analyzeTargetCompetitorGap(org.id);
        if (gapResult && gapResult.gaps.length > 0) {
          await recordDFYAction(org.id, "dfy.competitor_gap_analysis", {
            target: gapResult.summary,
            gaps: gapResult.gaps.map(g => `${g.dimension}: ${g.gap} gap (${g.priority})`),
          });
        }
      } catch (gapErr: any) {
        console.error(`[DFY] Gap analysis failed for ${org.name}: ${gapErr.message}`);
      }
    } catch (err: any) {
      errors++;
      console.error(`[DFY] Error for ${org.name}: ${err.message}`);
    }
  }

  console.log(`[DFY] Complete: ${processed} orgs, ${gbpDrafts} GBP drafts, ${croDrafts} CRO drafts, ${errors} errors`);
  return { processed, gbpDrafts, croDrafts, errors };
}

/**
 * Get pending actions for an org, ready for inclusion in Monday email.
 * Returns draft actions with their approval/reject URLs.
 */
export async function getPendingActionsForEmail(orgId: number): Promise<Array<{
  previewTitle: string;
  previewBody: string;
  actionType: string;
  approveUrl: string;
  rejectUrl: string;
}>> {
  try {
    const actions = await db("pending_actions")
      .where({ org_id: orgId, status: "draft" })
      .where("expires_at", ">", new Date())
      .orderBy("created_at", "desc")
      .select("preview_title", "preview_body", "action_type", "approval_token");

    const baseUrl = process.env.API_URL || "https://api.getalloro.com";

    return actions.map((a: { preview_title: string; preview_body: string; action_type: string; approval_token: string }) => ({
      previewTitle: a.preview_title,
      previewBody: a.preview_body,
      actionType: a.action_type,
      approveUrl: `${baseUrl}/api/actions/approve/${a.approval_token}`,
      rejectUrl: `${baseUrl}/api/actions/reject/${a.approval_token}`,
    }));
  } catch {
    return [];
  }
}

// =====================================================================
// RECEIPT RECORDING
// =====================================================================

/**
 * Record a DFY action to behavioral_events.
 * This is the receipt. The Monday email reads these to show what Alloro did.
 */
async function recordDFYAction(
  orgId: number,
  eventType: string,
  properties: Record<string, unknown>,
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      org_id: orgId,
      event_type: eventType,
      properties: JSON.stringify(properties),
      created_at: new Date(),
    });
  } catch {
    // behavioral_events may not exist yet, log but don't fail
    console.warn(`[DFY] Could not record ${eventType} for org ${orgId}`);
  }
}
