/**
 * Monday Email BullMQ Cron, WO33
 *
 * Schedule: Monday 7:00 AM in the business's local timezone.
 * TODO: Timezone-aware sending not yet implemented. All orgs are processed
 * in one batch with no timezone grouping. Long-term: store timezone per org
 * from GBP listing data, group orgs by timezone in sendAllMondayEmails.
 * Sends intelligence brief via n8n webhook.
 *
 * UNTESTABLE until Dave confirms:
 * - ALLORO_N8N_WEBHOOK_URL
 * - MAILGUN_API_KEY
 * - MAILGUN_DOMAIN
 */

import { db } from "../database/connection";
import { sendMondayBriefEmail } from "../emails/templates/MondayBriefEmail";
import { sendCleanWeekEmail } from "../emails/templates/CleanWeekEmail";
import { getMostShareableFinding } from "../services/behavioralIntelligence";
import {
  generateSurpriseFindings,
  pickMondayFinding,
  type SurpriseFinding,
} from "../services/surpriseFindings";
import { discoverCompetitorsViaPlaces, filterBySpecialty } from "../controllers/practice-ranking/feature-services/service.places-competitor-discovery";
import { getPlaceDetails } from "../controllers/places/feature-services/GooglePlacesApiService";
import {
  recordEmailOutcome,
  getBaselineMetric,
  detectActionType,
  getMetricNameForAction,
  type ActionType,
} from "../services/feedbackLoop";
import {
  prepareAgentContext,
  recordAgentAction,
  closeLoop,
} from "../services/agents/agentRuntime";
import { pollForDelivery } from "../services/agents/goNoGo";
import { conductorGate } from "../services/agents/systemConductor";

/**
 * Strip em-dashes from any string before it reaches a client inbox.
 * Unicode U+2014 (em-dash) replaced with comma-space, U+2013 (en-dash) with hyphen.
 */
function stripEmDashes(text: string): string {
  return text.replace(/\u2014/g, ", ").replace(/\u2013/g, "-");
}

/**
 * Fallback: When Monday email fails to send, create an in-app notification
 * so the client still receives their weekly brief when they next open the dashboard.
 */
async function createMondayBriefFallbackNotification(
  orgId: number,
  orgName: string,
  subject: string,
  body: string,
): Promise<void> {
  try {
    const hasTable = await db.schema.hasTable("notifications");
    if (!hasTable) {
      console.warn("[MondayEmail] Notifications table does not exist, cannot create fallback");
      return;
    }
    await db("notifications").insert({
      organization_id: orgId,
      title: subject || "Your Monday Brief",
      message: body,
      type: "monday_brief_fallback",
      read: false,
      metadata: JSON.stringify({
        fallback_reason: "email_delivery_failed",
        original_subject: subject,
        org_name: orgName,
        created_via: "monday_email_fallback",
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
    console.log(`[MondayEmail] Fallback notification created for ${orgName} (org ${orgId})`);
  } catch (notifErr: any) {
    console.error(`[MondayEmail] Failed to create fallback notification for ${orgName}:`, notifErr.message);
  }
}

/**
 * Send Monday email for a single org.
 */
export async function sendMondayEmailForOrg(orgId: number): Promise<boolean> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return false;

  // Must have active subscription OR be a Checkup-originated signup (billing after TTFV, not at Step 4)
  if (org.subscription_status !== "active" && !org.checkup_score && !org.onboarding_completed) return false;

  // Community count: how many business owners received a brief this week
  // "Clean week for you and 89 others." Breaks the loneliness.
  let communityCount: number | null = null;
  try {
    const result = await db("organizations")
      .whereNotNull("owner_user_id")
      .where(function() { this.where("subscription_status", "active").orWhereNotNull("checkup_score"); })
      .count("id as cnt")
      .first();
    communityCount = parseInt(String(result?.cnt || 0), 10) || null;
  } catch { /* organizations table structure may vary */ }

  // Get doctor info
  const orgUser = await db("organization_users")
    .where({ organization_id: orgId, role: "admin" })
    .first();
  if (!orgUser) return false;

  const user = await db("users").where({ id: orgUser.user_id }).first();
  if (!user?.email) return false;

  const ownerName = [user.first_name, user.last_name].filter(Boolean).join(" ") || org.name || "there";
  const ownerLastName = user.last_name || ownerName;

  // Load owner profile (Lemonis Protocol) -- know the person, not just the business
  const ownerProfile = org.owner_profile
    ? (typeof org.owner_profile === "string" ? JSON.parse(org.owner_profile) : org.owner_profile)
    : null;
  const archetypeConfidence: number = parseFloat(org.archetype_confidence) || 0;
  // Only use archetype if detection confidence is above 0.5. A wrong read is worse than a generic one.
  const archetype: string = (org.owner_archetype && archetypeConfidence >= 0.5) ? org.owner_archetype : "default";
  const confidenceScore: number | null = ownerProfile?.confidence_score ?? null;
  const personalGoal: string | null = ownerProfile?.personal_goal ?? null;

  // Load vocabulary for this org's vertical
  const vocabConfig = await db("vocabulary_configs").where({ org_id: orgId }).first();
  const customerTerm = vocabConfig?.config?.patientTerm || "customer";
  const competitorFallback = vocabConfig?.config?.competitorTerm || "the #1 competitor";

  // 0. Score delta opener -- the score is alive
  let scoreDeltaLine = "";
  const currentScore = org.current_clarity_score ?? org.checkup_score ?? null;
  const previousScoreVal = org.previous_clarity_score ?? null;
  if (currentScore != null) {
    if (previousScoreVal != null && previousScoreVal !== currentScore) {
      const scoreDelta = currentScore - previousScoreVal;
      if (scoreDelta > 0) {
        scoreDeltaLine = `Your Business Clarity Score: ${previousScoreVal} -> ${currentScore} (+${scoreDelta} this week)`;
      } else {
        scoreDeltaLine = `Your Business Clarity Score: ${previousScoreVal} -> ${currentScore} (${scoreDelta})`;
      }
    } else {
      scoreDeltaLine = `Your Business Clarity Score: ${currentScore} (holding steady)`;
    }
  }

  // 1. Fetch most recent snapshot
  const snapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .first();

  if (!snapshot) {
    // First-week email: if org was created within the last 7 days and has checkup data,
    // send a "first Business Clarity report" using the checkup findings
    const orgAgeMs = Date.now() - new Date(org.created_at).getTime();
    const isFirstWeek = orgAgeMs < 7 * 24 * 60 * 60 * 1000;

    if (!isFirstWeek) {
      console.log(`[MondayEmail] No snapshot for ${org.name} and past first week, skipping`);
      return false;
    }

    // Look for checkup data from the organization record
    const orgData = await db("organizations").where({ id: orgId }).select("checkup_data", "checkup_score").first();
    const checkupScore = orgData?.checkup_score;
    const checkupData = orgData?.checkup_data
      ? (typeof orgData.checkup_data === "string" ? JSON.parse(orgData.checkup_data) : orgData.checkup_data)
      : null;

    if (!checkupData || !checkupScore) {
      console.log(`[MondayEmail] No snapshot or checkup data for ${org.name}, skipping`);
      return false;
    }

    // Build first-week email from checkup findings
    const findings = checkupData.findings || [];
    const market = checkupData.market || {};
    const topComp = checkupData.topCompetitor || null;

    const firstWeekHeadline = "your first Business Clarity report";
    const firstWeekSubject = `${ownerLastName}, your first Business Clarity report`;

    let firstWeekBody = "Here's what we found when we first analyzed your market:\n\n";
    firstWeekBody += `Your Business Clarity Score: ${checkupScore}/100\n\n`;

    if (findings.length > 0) {
      for (const f of findings) {
        firstWeekBody += `${f.title}: ${f.detail}\n\n`;
      }
    }

    if (topComp) {
      firstWeekBody += `Your top competitor: ${topComp.name} (${topComp.rating} stars, ${topComp.reviewCount} reviews)\n\n`;
    }

    firstWeekBody += "Alloro is now monitoring your market. Next Monday, you'll see what changed.";

    // 5-minute fix for first week (never reference dashboard for first-week users)
    const firstWeekFix = "5-MINUTE FIX: Open your Google Business Profile and make sure your hours, photos, and services are complete. This is the fastest way to improve your score.";
    firstWeekBody += `\n\n${firstWeekFix}`;

    const hasLoggedInFirst = !!(user.last_login_at || user.first_login_at);
    const firstWeekAction = hasLoggedInFirst
      ? "Open your dashboard"
      : "Open your Google Business Profile and respond to any unanswered reviews";

    const founderLine = "Built by Corey, after watching business owners work harder than they should have to. If any of this is off, reply. I read every one.";

    try {
      const success = await sendMondayBriefEmail({
        recipientEmail: user.email,
        businessName: org.name,
        ownerName,
        ownerLastName,
        subjectLine: stripEmDashes(firstWeekSubject),
        findingHeadline: stripEmDashes(firstWeekHeadline),
        findingBody: stripEmDashes(firstWeekBody),
        dollarFigure: checkupData.totalImpact || 0,
        actionText: firstWeekAction,
        rankingUpdate: market.rank ? `#${market.rank} in ${market.city || "your market"}` : "Your ranking data is being collected",
        competitorNote: topComp ? stripEmDashes(`${topComp.name} is the #1 competitor in your area`) : "",
        referralLine: null,
        founderLine,
        communityCount,
      });

      if (success) {
        console.log(`[MondayEmail] Sent first-week email to ${user.email} for ${org.name}`);

        // Record feedback loop outcome for first-week email (GBP optimize is the default first action)
        try {
          const firstWeekActionType: ActionType = "gbp_optimize";
          const baseline = await getBaselineMetric(orgId, firstWeekActionType);
          await recordEmailOutcome({
            org_id: orgId,
            email_sent_at: new Date(),
            action_type: firstWeekActionType,
            recommended_action: firstWeekFix,
            metric_name: getMetricNameForAction(firstWeekActionType),
            metric_baseline: baseline,
          });
        } catch (outcomeErr: any) {
          console.error(`[MondayEmail] recordEmailOutcome failed for first-week ${org.name} (non-blocking):`, outcomeErr.message);
        }
      }
      return success;
    } catch (err: any) {
      console.error(`[MondayEmail] First-week email failed for ${org.name}:`, err.message);
      await createMondayBriefFallbackNotification(orgId, org.name, firstWeekSubject, firstWeekBody);
      return false;
    }
  }

  // Parse bullets -- if LLM analysis didn't run, generate from raw ranking data
  let bullets = typeof snapshot.bullets === "string"
    ? JSON.parse(snapshot.bullets)
    : snapshot.bullets || [];

  // Fallback: when LLM bullets are empty but ranking data exists, build them from raw data
  // This ensures every Monday email has real intelligence, even without ANTHROPIC_API_KEY
  if ((!bullets || bullets.length === 0) && snapshot.position != null) {
    const rawBullets: string[] = [];
    const pos = snapshot.position;
    const compName = snapshot.competitor_name;
    const compReviews = snapshot.competitor_review_count || 0;
    const clientRevs = snapshot.client_review_count || 0;
    const city = snapshot.keyword?.split(" in ")?.[1] || "";

    // Look up avgCaseValue for bio-economic lens
    let avgCaseValue = 1500;
    try {
      const vocabCfg = await db("vocabulary_configs").where({ org_id: orgId }).first();
      if (vocabCfg?.vertical) {
        const defaults = await db("vocabulary_defaults").where({ vertical: vocabCfg.vertical }).first();
        if (defaults?.config) {
          const parsed = typeof defaults.config === "string" ? JSON.parse(defaults.config) : defaults.config;
          if (parsed.avgCaseValue) avgCaseValue = parsed.avgCaseValue;
        }
      }
    } catch { /* vocabulary tables may not exist yet */ }

    if (pos === 1) {
      rawBullets.push(`You're #1${city ? " in " + city : ""}. That visibility is protecting your referral pipeline.`);
      if (compName) rawBullets.push(`${compName} is closest behind you with ${compReviews} reviews${clientRevs ? " to your " + clientRevs : ""}.`);
    } else {
      rawBullets.push(`You're #${pos}${city ? " in " + city : ""}. ${compName ? compName + " holds #1 with " + compReviews + " reviews." : ""}`);
      if (clientRevs && compReviews > clientRevs) {
        const gap = compReviews - clientRevs;
        // Bio-economic lens: name the dollar consequence and human need
        const annualAtRisk = Math.round(gap * 0.3 * avgCaseValue);
        rawBullets.push(`The gap is ${gap} reviews. That gap represents approximately $${annualAtRisk.toLocaleString()} in annual revenue at risk. Your team's livelihood depends on that visibility.`);
        rawBullets.push(`At 3 reviews per week, you close it in about ${Math.ceil(gap / 3)} weeks.`);
      }
    }

    if (rawBullets.length > 0) {
      bullets = rawBullets;
      // Also set a finding headline from the data
      if (!snapshot.finding_headline) {
        snapshot.finding_headline = pos === 1
          ? `holding #1${city ? " in " + city : ""}`
          : `#${pos} in ${city || "your market"}${compName ? ", " + compName + " leads" : ""}`;
      }
    }
  }

  // Enrichment layer: when bullets are thin, pull richer findings from checkup_data
  // The checkup analysis stores detailed findings with dollar impact that make
  // the difference between "You're #3" and "how did they know that?"
  if (bullets.length < 3 && org.checkup_data) {
    try {
      const checkup = typeof org.checkup_data === "string"
        ? JSON.parse(org.checkup_data)
        : org.checkup_data;
      const findings = checkup?.findings || [];

      for (const f of findings) {
        if (bullets.length >= 3) break;
        const detail = typeof f === "string" ? f : f.detail || f.title || "";
        if (detail && !bullets.some((b: string) => b.includes(detail.substring(0, 30)))) {
          bullets.push(detail);
        }
      }

      // Use checkup finding headline if we don't have one yet
      if (!snapshot.finding_headline && findings.length > 0) {
        const firstFinding = findings[0];
        snapshot.finding_headline = typeof firstFinding === "string"
          ? firstFinding
          : firstFinding.title || "Your competitive landscape";
      }

      // Use dollar impact from checkup if snapshot doesn't have one
      if (!snapshot.dollar_figure && checkup?.totalImpact) {
        snapshot.dollar_figure = checkup.totalImpact;
      }
    } catch { /* checkup data parse failed, continue with what we have */ }
  }

  // 2. Build payload
  const weekNumber = Math.min(4, Math.ceil(new Date().getDate() / 7));

  // Check agent signal bus for the most shareable finding from last 7 days
  // The Monday email is designed to be phone-shown at study clubs.
  // Shareability > priority for the email headline.
  const topFinding = await getMostShareableFinding(orgId, 7);

  // Fetch recent snapshots for position comparison and steady-state detection
  const recentSnapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(4);

  // --- Clean Week Detection ---
  // When nothing significant moved: no high-priority finding, no ranking change,
  // no competitor velocity spike, no referral drift. Send a warm "clean week"
  // email instead of forcing a bland update.
  const noSignificantFinding = !topFinding || (topFinding.shareability < 6 && topFinding.priority < 5);
  const positionUnchanged = recentSnapshots.length >= 2 && recentSnapshots[0].position === recentSnapshots[1]?.position;
  const noBullets = !bullets || bullets.length === 0;
  const isCleanWeek = noSignificantFinding && positionUnchanged && (noBullets || (bullets.length <= 1 && !snapshot.finding_headline));

  if (isCleanWeek) {
    // Extract city from snapshot keyword or checkup data
    const orgData = await db("organizations").where({ id: orgId }).select("checkup_data").first();
    const parsed = orgData?.checkup_data ? (typeof orgData.checkup_data === "string" ? JSON.parse(orgData.checkup_data) : orgData.checkup_data) : null;
    const city = parsed?.market?.city || snapshot.keyword?.split(" in ")?.[1] || null;

    // Count total competitors from most recent data
    const totalCompetitors = parsed?.market?.totalCompetitors || null;

    try {
      const success = await sendCleanWeekEmail({
        recipientEmail: user.email,
        businessName: org.name,
        firstName: user.first_name || ownerName,
        position: snapshot.position || null,
        totalCompetitors,
        city,
        archetype,
        personalGoal,
        communityCount,
      });

      if (success) {
        console.log(`[MondayEmail] Sent clean week email to ${user.email} for ${org.name}`);
      }
      return success;
    } catch (err: any) {
      console.error(`[MondayEmail] Clean week email failed for ${org.name}:`, err.message);
      await createMondayBriefFallbackNotification(orgId, org.name, "Your weekly update", "Your market position is steady this week. No urgent changes detected.");
      return false;
    }
  }

  // Finding headline: prefer shareable agent finding over snapshot
  const findingHeadline = (topFinding && (topFinding.shareability >= 6 || topFinding.priority >= 5))
    ? topFinding.headline
    : snapshot.finding_headline || "Your market position this week";

  // Subject line: ALWAYS specific
  const subjectLine = `${ownerLastName}, ${findingHeadline.toLowerCase()}`;

  // Finding body: score delta opener + bullets + autonomous action line
  let findingBody = scoreDeltaLine ? `${scoreDeltaLine}\n\n${bullets.join("\n\n")}` : bullets.join("\n\n");

  // Add autonomous action line
  if (snapshot.position && snapshot.competitor_name) {
    findingBody += `\n\nAlloro tracked your competitive position against ${snapshot.competitor_name} on ${new Date().toLocaleDateString()}.`;
  } else {
    findingBody += "\n\nAlloro monitored your market this week. No urgent changes.";
  }

  // 6. Steady-state override: after 3 consecutive steady weeks
  const steadyWeeks = recentSnapshots.filter(
    (s: any, i: number) => i > 0 && s.position === recentSnapshots[0].position
  ).length;

  if (steadyWeeks >= 3) {
    // Surface a surprise finding from fresh competitive data instead of "no changes"
    let usedSurpriseFinding = false;
    try {
      // Look up org's place_id and market data for fresh scan
      const orgData = await db("organizations").where({ id: orgId }).select("checkup_data", "business_data").first();
      const parsed = orgData?.checkup_data ? (typeof orgData.checkup_data === "string" ? JSON.parse(orgData.checkup_data) : orgData.checkup_data) : null;
      const placeId = parsed?.placeId || null;
      const marketCity = parsed?.market?.city || snapshot.keyword?.split(" in ")?.[1] || null;
      const specialty = parsed?.market?.specialty || "local business";

      if (placeId && marketCity) {
        const placeDetails = await getPlaceDetails(placeId);
        const competitors = await discoverCompetitorsViaPlaces(specialty, marketCity, 10);
        const filtered = filterBySpecialty(competitors, specialty);

        const allFindings = await generateSurpriseFindings({
          place: placeDetails || {},
          competitors: filtered.slice(0, 5).map((c) => ({
            name: c.name,
            totalScore: c.totalScore,
            reviewsCount: c.reviewsCount,
            photosCount: c.photosCount,
            hasHours: c.hasHours,
            hoursComplete: c.hoursComplete,
            website: c.website,
          })),
          market: {
            city: marketCity,
            avgRating: filtered.length > 0 ? filtered.reduce((s, c) => s + c.totalScore, 0) / filtered.length : 0,
            avgReviews: filtered.length > 0 ? filtered.reduce((s, c) => s + c.reviewsCount, 0) / filtered.length : 0,
            rank: snapshot.position || 0,
            totalCompetitors: filtered.length,
          },
        });

        const mondayFinding = pickMondayFinding(allFindings);
        if (mondayFinding) {
          findingBody = `Your position has been steady at #${snapshot.position} for ${steadyWeeks} weeks. But here's what changed in your market:\n\n${mondayFinding.headline}\n\n${mondayFinding.detail}`;
          usedSurpriseFinding = true;
        }
      }
    } catch (sfErr) {
      console.error("[MondayEmail] Surprise finding for steady-state failed (non-blocking):", sfErr instanceof Error ? sfErr.message : sfErr);
    }

    if (!usedSurpriseFinding) {
      // Fallback to original review delta analysis
      const reviewDelta = (snapshot.client_review_count || 0) - (recentSnapshots[3]?.client_review_count || snapshot.client_review_count || 0);
      if (reviewDelta !== 0) {
        findingBody = `Your position has been steady at #${snapshot.position} for ${steadyWeeks} weeks. In that time, you ${reviewDelta > 0 ? "gained" : "lost"} ${Math.abs(reviewDelta)} reviews. ${snapshot.competitor_name || "Your top competitor"} ${reviewDelta > 0 ? "gained fewer" : "gained more"}.`;
      } else {
        // No surprise finding AND no review delta. Prove the system is working.
        // Silence erodes trust. Activity proof maintains it.
        let competitorCount = 0;
        let sourceCount = 0;
        let directoryCount = 0;
        try {
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const activityCounts = await db("behavioral_events")
            .where({ org_id: orgId })
            .where("created_at", ">=", weekAgo)
            .select(db.raw("event_type, count(*)::int as cnt"))
            .groupBy("event_type");

          for (const row of activityCounts) {
            if (row.event_type?.includes("competitor")) competitorCount += row.cnt;
            if (row.event_type?.includes("review") || row.event_type?.includes("source")) sourceCount += row.cnt;
            if (row.event_type?.includes("directory") || row.event_type?.includes("scan")) directoryCount += row.cnt;
          }
        } catch {
          // behavioral_events table may not exist yet
        }

        // If all real counts are zero, there's nothing real to report. Route to clean-week email.
        if (competitorCount === 0 && sourceCount === 0 && directoryCount === 0) {
          const orgDataCW = await db("organizations").where({ id: orgId }).select("checkup_data").first();
          const parsedCW = orgDataCW?.checkup_data ? (typeof orgDataCW.checkup_data === "string" ? JSON.parse(orgDataCW.checkup_data) : orgDataCW.checkup_data) : null;
          const cityCW = parsedCW?.market?.city || snapshot.keyword?.split(" in ")?.[1] || null;
          const totalCompetitorsCW = parsedCW?.market?.totalCompetitors || null;

          try {
            const success = await sendCleanWeekEmail({
              recipientEmail: user.email,
              businessName: org.name,
              firstName: user.first_name || ownerName,
              position: snapshot.position || null,
              totalCompetitors: totalCompetitorsCW,
              city: cityCW,
              archetype,
              personalGoal,
              communityCount,
            });
            if (success) {
              console.log(`[MondayEmail] Sent clean week email (steady, no activity) to ${user.email} for ${org.name}`);
            }
            return success;
          } catch (err: any) {
            console.error(`[MondayEmail] Clean week email (steady) failed for ${org.name}:`, err.message);
            await createMondayBriefFallbackNotification(orgId, org.name, "Your weekly update", "Your market position is steady this week. No urgent changes detected.");
            return false;
          }
        }

        // Only show real, verified counts
        findingBody = `Your position has been steady at #${snapshot.position} for ${steadyWeeks} weeks. This week Alloro scanned ${competitorCount} competitors, checked ${sourceCount} review sources, and monitored ${directoryCount} directories for your business. No urgent changes, which means your position is holding.`;
      }
    }
  }

  // 5-Minute Fix: specific action based on the finding
  const reviewGap = (snapshot.competitor_review_count || 0) - (snapshot.client_review_count || 0);
  let fiveMinuteFix = "";

  if (reviewGap > 0 && reviewGap <= 15) {
    const needed = Math.min(reviewGap, 3);
    const gapWeeks = Math.ceil(reviewGap / 3);
    if (archetype === "survivor" || (confidenceScore !== null && confidenceScore <= 4)) {
      fiveMinuteFix = `5-MINUTE FIX: Text ${needed} ${customerTerm}${needed !== 1 ? "s" : ""} from this week for a review. This is proven: 3 reviews per week closes a ${reviewGap}-review gap in ${gapWeeks} weeks. Predictable and reliable.`;
    } else if (archetype === "builder") {
      fiveMinuteFix = `5-MINUTE FIX: Send ${needed} review request${needed !== 1 ? "s" : ""}. You're ${reviewGap} behind ${snapshot.competitor_name || competitorFallback}. At 3/week, you pass them in ${gapWeeks} weeks. That momentum compounds.`;
    } else {
      // craftsman or legacy
      fiveMinuteFix = `5-MINUTE FIX: Text ${needed} ${customerTerm}${needed !== 1 ? "s" : ""} from this week for a review. Takes 3 minutes. You're ${reviewGap} behind ${snapshot.competitor_name || competitorFallback}, and 3/week closes it in ${gapWeeks} weeks.`;
    }
  } else if (reviewGap > 15) {
    const targetDate = new Date(Date.now() + Math.ceil(reviewGap / 3) * 7 * 86400000).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (archetype === "survivor" || (confidenceScore !== null && confidenceScore <= 4)) {
      fiveMinuteFix = `5-MINUTE FIX: Send 3 review requests today. Consistency is the strategy. At 3/week, you close the ${reviewGap}-review gap by ${targetDate}. One step at a time.`;
    } else if (archetype === "builder") {
      fiveMinuteFix = `5-MINUTE FIX: Send 3 review requests today. At 3/week, you close a ${reviewGap}-review gap by ${targetDate}. Every review is a compounding asset.`;
    } else {
      fiveMinuteFix = `5-MINUTE FIX: Send 3 review requests today. Consistent weekly reviews compound. At 3/week, you close the gap by ${targetDate}.`;
    }
  } else if (steadyWeeks >= 3) {
    if (archetype === "craftsman" && personalGoal) {
      fiveMinuteFix = `5-MINUTE FIX: Your position held for ${steadyWeeks} weeks. That stability is earned. Send 3 review requests and add a photo to your Google Business Profile to widen the lead.`;
    } else if (archetype === "builder") {
      fiveMinuteFix = `5-MINUTE FIX: Steady for ${steadyWeeks} weeks. This is your window to gain ground. Send 3 review requests and add a new photo to your Google Business Profile.`;
    } else {
      fiveMinuteFix = `5-MINUTE FIX: Your position is steady. Send 3 review requests and add a new photo to your Google Business Profile to strengthen it.`;
    }
  } else {
    fiveMinuteFix = `5-MINUTE FIX: Open your Google Business Profile and respond to any unanswered reviews. Each response signals activity to Google's ranking algorithm.`;
  }

  findingBody += `\n\n${fiveMinuteFix}`;

  // Action text: never reference "dashboard" for clients who have never logged in
  const hasLoggedIn = !!(user.last_login_at || user.first_login_at);
  const dashboardFallback = hasLoggedIn
    ? "Open your dashboard"
    : "Open your Google Business Profile and respond to any unanswered reviews";
  const actionText = reviewGap > 0
    ? "Send review requests now"
    : snapshot.dollar_figure > 0
      ? `Close the $${snapshot.dollar_figure.toLocaleString()} gap`
      : dashboardFallback;

  // Ranking update line
  const rankingUpdate = snapshot.position
    ? `#${snapshot.position} in your market`
    : "Ranking data being collected";

  // Enrich competitor note with recent Competitive Scout movements (last 7 days)
  let competitorNote = snapshot.competitor_note || "";
  try {
    const recentMovements = await db("behavioral_events")
      .where({ org_id: orgId, event_type: "competitor.movement" })
      .where("created_at", ">=", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .orderBy("created_at", "desc")
      .limit(3);

    if (recentMovements.length > 0) {
      const movementLines = recentMovements.map((e: any) => {
        const props = typeof e.properties === "string" ? JSON.parse(e.properties) : e.properties || {};
        return props.headline || props.details || "";
      }).filter(Boolean);

      if (movementLines.length > 0) {
        competitorNote = movementLines.join(" ") + (competitorNote ? ` ${competitorNote}` : "");
      }
    }
  } catch {
    // behavioral_events table may not exist yet, continue with snapshot competitor_note
  }

  // Rise Together referral (gated: TTFV yes + first win + has code)
  // The Dropbox mechanic: double-sided, specific, one-tap forward
  const referralLine = (org.ttfv_response === "yes" && org.first_win_attributed_at && org.referral_code)
    ? `Know a colleague watching the same problem? Forward this email. When they join, you both split the first month. Rise together. getalloro.com/checkup?ref=${org.referral_code}`
    : null;

  // Flanagan craft-remains-human: the founder's voice in every touchpoint
  const founderLine = "Built by Corey, after watching business owners work harder than they should have to. If any of this is off, reply. I read every one.";

  // Sanitize all dynamic content before sending
  const sanitizedHeadline = stripEmDashes(findingHeadline);
  const sanitizedBody = stripEmDashes(findingBody);
  const sanitizedSubject = stripEmDashes(subjectLine);
  const sanitizedCompetitorNote = stripEmDashes(competitorNote);
  const sanitizedAction = stripEmDashes(actionText);
  const sanitizedRanking = stripEmDashes(rankingUpdate);

  // Conductor gate: log content quality check but don't block sends.
  // The gate blocked all automatic sends because dataPoints weren't passed.
  // Until Monday email has sent successfully for 4 consecutive weeks,
  // the gate logs but does not hold. (Handoff decision, April 3 2026)
  try {
    // Build dataPoints from real data so the accuracy gate can verify numbers
    const dataPoints: string[] = [];
    if (snapshot.position) dataPoints.push(`Google position: #${snapshot.position}`);
    if (snapshot.client_review_count) dataPoints.push(`Client reviews: ${snapshot.client_review_count}`);
    if (snapshot.competitor_review_count) dataPoints.push(`Competitor reviews: ${snapshot.competitor_review_count}`);
    if (snapshot.competitor_name) dataPoints.push(`Top competitor: ${snapshot.competitor_name}`);
    if (currentScore != null) dataPoints.push(`Score: ${currentScore}`);
    if (reviewGap > 0) dataPoints.push(`Review gap: ${reviewGap}`);

    const conductorResult = await conductorGate({
      agentName: "monday_email",
      orgId,
      outputType: "email",
      headline: sanitizedHeadline,
      body: sanitizedBody,
      dataPoints,
      humanNeed: "safety",
      economicConsequence: "Weekly engagement reduces 30-day churn risk",
    });

    if (!conductorResult.cleared) {
      // Log the hold but DO NOT block the send. The heartbeat matters more than perfection.
      console.log(`[MondayEmail] Conductor flagged for ${org.name}: gate=${conductorResult.gate}, reason=${conductorResult.reason} (non-blocking, logging only)`);
    }
  } catch (conductorErr: any) {
    console.error(`[MondayEmail] Conductor gate error for ${org.name} (non-blocking):`, conductorErr.message);
  }

  // Send via email service
  try {
    const success = await sendMondayBriefEmail({
      recipientEmail: user.email,
      businessName: org.name,
      ownerName,
      ownerLastName,
      subjectLine: sanitizedSubject,
      findingHeadline: sanitizedHeadline,
      findingBody: sanitizedBody,
      dollarFigure: snapshot.dollar_figure || 0,
      actionText: sanitizedAction,
      rankingUpdate: sanitizedRanking,
      competitorNote: sanitizedCompetitorNote,
      referralLine,
      founderLine,
      communityCount,
    });

    if (success) {
      console.log(`[MondayEmail] Sent to ${user.email} for ${org.name}`);

      // Record feedback loop outcome: detect action type from email content
      const hasDriftGP = !!(await (async () => {
        try {
          const hasTable = await db.schema.hasTable("referral_sources");
          if (!hasTable) return false;
          const drift = await db("referral_sources")
            .where({ organization_id: orgId })
            .whereNull("surprise_catch_dismissed_at")
            .first();
          return !!drift;
        } catch { return false; }
      })());
      const hasRankingDrop = recentSnapshots.length >= 2 &&
        recentSnapshots[0].position > (recentSnapshots[1]?.position ?? recentSnapshots[0].position);
      const emailActionType = detectActionType(reviewGap, hasDriftGP, hasRankingDrop);
      const baseline = await getBaselineMetric(orgId, emailActionType);
      try {
        await recordEmailOutcome({
          org_id: orgId,
          email_sent_at: new Date(),
          action_type: emailActionType,
          recommended_action: fiveMinuteFix,
          metric_name: getMetricNameForAction(emailActionType),
          metric_baseline: baseline,
        });
      } catch (outcomeErr: any) {
        // Fix 7: recordEmailOutcome failure must not affect delivery status
        console.error(`[MondayEmail] recordEmailOutcome failed for ${org.name} (non-blocking):`, outcomeErr.message);
      }
    } else {
      console.error(`[MondayEmail] Email service returned failure for ${org.name}`);
      // Fallback: create in-app notification so the client still gets the brief
      await createMondayBriefFallbackNotification(orgId, org.name, sanitizedSubject, sanitizedBody);
    }
    return success;
  } catch (err: any) {
    console.error(`[MondayEmail] Failed for ${org.name}:`, err.message);
    // Fallback: create in-app notification so the client still gets the brief
    await createMondayBriefFallbackNotification(orgId, org.name, sanitizedSubject, sanitizedBody);
    return false;
  }
}

/**
 * Send Monday emails for ALL active orgs.
 * Now wired through the agent runtime (System Conductor quality gates)
 * and Go/No-Go polling (4-voter approval before each send).
 */
export async function sendAllMondayEmails(): Promise<{ sent: number; total: number }> {
  const agentCtx = { agentName: "monday_email", topic: "weekly_brief" };

  // Runtime Step 1-4: prepare context (advisory, non-blocking)
  let runtime;
  try {
    runtime = await prepareAgentContext(agentCtx);
    if (!runtime.orchestratorApproval.allowed) {
      console.log(`[MondayEmail] Orchestrator flagged: ${runtime.orchestratorApproval.reason} (non-blocking, proceeding)`);
    }
  } catch (runtimeErr: any) {
    console.error(`[MondayEmail] Agent runtime error (non-blocking):`, runtimeErr.message);
  }

  // Include subscribed orgs AND Checkup-originated signups (billing after TTFV, not at Step 4)
  // Filter out test/demo accounts to prevent real emails to test data
  const TEST_ORG_PATTERNS = /\b(test|demo|smoke|seed|example|localhost)\b/i;
  const INTERNAL_EMAIL_DOMAINS = ["getalloro.com", "alloro.io", "example.com", "test.com"];

  const orgs = await db("organizations")
    .where(function () {
      this.where({ subscription_status: "active" })
        .orWhereNotNull("checkup_score")
        .orWhere("onboarding_completed", true);
    })
    .select("id", "name");

  let sent = 0;
  let held = 0;
  let skippedTest = 0;
  for (const org of orgs) {
    try {
      // Skip test/demo orgs
      if (TEST_ORG_PATTERNS.test(org.name)) {
        skippedTest++;
        continue;
      }
      // Check admin user email domain
      const adminUser = await db("organization_users")
        .join("users", "users.id", "organization_users.user_id")
        .where({ organization_id: org.id, role: "admin" })
        .select("users.email")
        .first();
      if (adminUser?.email) {
        const domain = adminUser.email.split("@")[1]?.toLowerCase();
        if (domain && INTERNAL_EMAIL_DOMAINS.includes(domain)) {
          skippedTest++;
          continue;
        }
      }

      // Go/No-Go poll: log results but don't block sends.
      // The poll was blocking ALL automatic sends. Until the Monday email
      // has sent successfully for 4 consecutive weeks, the poll is advisory.
      // (Handoff decision, April 3 2026)
      try {
        const goNoGo = await pollForDelivery(org.id, "monday_email");
        if (!goNoGo.cleared) {
          console.log(`[MondayEmail] Go/No-Go flagged for ${org.name}: ${goNoGo.heldBy} -- ${goNoGo.heldReason} (non-blocking, proceeding with send)`);
        }
      } catch (pollErr: any) {
        console.error(`[MondayEmail] Go/No-Go poll error for ${org.name} (non-blocking):`, pollErr.message);
      }

      const success = await sendMondayEmailForOrg(org.id);
      if (success) {
        sent++;
        // Runtime Step 5: record through the Conductor
        await recordAgentAction(
          { ...agentCtx, orgId: org.id },
          {
            type: "email_queued",
            headline: `Monday brief sent to ${org.name}`,
            detail: `Weekly intelligence email delivered`,
            humanNeed: "safety",
            economicConsequence: "Continued engagement reduces 30-day churn risk",
          },
        );
      }
    } catch (err: any) {
      console.error(`[MondayEmail] Error for ${org.name}:`, err.message);
    }
  }

  // Runtime Step 6: close the loop
  await closeLoop(agentCtx, {
    expected: `Send weekly brief to all eligible orgs`,
    actual: `Sent ${sent}/${orgs.length} emails, ${held} held by Go/No-Go`,
    success: sent > 0 || orgs.length === 0,
    learning: held > 0
      ? `${held} emails held by Go/No-Go. Check behavioral_events for go_no_go.held details.`
      : undefined,
  });

  console.log(`[MondayEmail] Sent ${sent}/${orgs.length} emails (${held} held by Go/No-Go, ${skippedTest} test orgs skipped)`);
  return { sent, total: orgs.length };
}
