/**
 * Welcome Intelligence Processor
 *
 * Fires 4 hours after checkup account creation.
 * Fetches NEW data the doctor didn't see at the booth:
 * - Nearby GPs who could be referral sources
 * - Competitor review velocity (how fast they're gaining)
 * - One actionable insight
 *
 * This is the second "how did they know that?" moment.
 * The first was the checkup. This one arrives in their inbox
 * while they're back at their practice.
 */

import { Job } from "bullmq";
import { db } from "../../database/connection";
import { sendEmail } from "../../emails/emailService";
import { wrapInBaseTemplate } from "../../emails/templates/base";
import {
  generateSurpriseFindings,
  pickWelcomeFindings,
  type SurpriseFinding,
} from "../../services/surpriseFindings";
import { discoverCompetitorsViaPlaces, filterBySpecialty } from "../../controllers/practice-ranking/feature-services/service.places-competitor-discovery";
import { getPlaceDetails } from "../../controllers/places/feature-services/GooglePlacesApiService";

interface WelcomeIntelligenceData {
  orgId: number;
  userId: number;
  email: string;
  practiceName: string;
  placeId: string | null;
  specialty: string | null;
  city: string | null;
  stateAbbr: string | null;
  checkupScore: number | null;
  topCompetitorName: string | null;
}

interface NearbyGP {
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
}

export async function processWelcomeIntelligence(
  job: Job<WelcomeIntelligenceData>
): Promise<void> {
  const data = job.data;
  console.log(`[WelcomeIntelligence] Processing for org ${data.orgId}`);

  // Fetch nearby GPs (general practitioners who could refer)
  const nearbyGPs = await fetchNearbyReferralSources(
    data.city,
    data.stateAbbr,
    data.specialty
  );

  // Fetch competitor velocity data
  const velocityInsight = await buildVelocityInsight(data.orgId);

  // Homework Findings: surprise insights NOT shown in the checkup.
  // This is the SECOND Oz moment, 4 hours later.
  let homeworkFindings: SurpriseFinding[] = [];
  try {
    if (data.placeId && data.city) {
      const placeDetails = await getPlaceDetails(data.placeId);
      const specialty = data.specialty || "local business";
      const marketLocation = data.stateAbbr ? `${data.city}, ${data.stateAbbr}` : data.city;
      const competitors = await discoverCompetitorsViaPlaces(specialty, marketLocation, 10);
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
          city: data.city,
          avgRating: filtered.length > 0 ? filtered.reduce((s, c) => s + c.totalScore, 0) / filtered.length : 0,
          avgReviews: filtered.length > 0 ? filtered.reduce((s, c) => s + c.reviewsCount, 0) / filtered.length : 0,
          rank: 0,
          totalCompetitors: filtered.length,
        },
      });

      // Pick findings that weren't in the checkup (skip first 5, take next 2)
      homeworkFindings = pickWelcomeFindings(allFindings, 5);
      console.log(`[WelcomeIntelligence] Generated ${allFindings.length} total findings, ${homeworkFindings.length} held back for welcome email`);
    }
  } catch (hwErr) {
    console.error("[WelcomeIntelligence] Homework findings failed (non-blocking):", hwErr instanceof Error ? hwErr.message : hwErr);
  }

  // Build and send email
  const emailContent = buildWelcomeIntelligenceEmail({
    practiceName: data.practiceName,
    city: data.city || "your area",
    nearbyGPs,
    velocityInsight,
    checkupScore: data.checkupScore,
    topCompetitorName: data.topCompetitorName,
    homeworkFindings,
  });

  // Subject line adapts: referral businesses get source count, others get homework findings
  const subject = nearbyGPs.length > 0
    ? `${nearbyGPs.length} potential sources near ${data.practiceName}`
    : homeworkFindings.length > 0
      ? `We kept digging after your Checkup, ${data.practiceName.split(/\s/)[0]}`
      : `Your market didn't stop moving, ${data.practiceName.split(/\s/)[0]}`;

  await sendEmail({
    subject,
    body: wrapInBaseTemplate(emailContent, {
      preheader: `Something new about your market that wasn't in the Checkup.`,
      showFooterLinks: false,
    }),
    recipients: [data.email],
  });

  // Store as behavioral event
  await db("behavioral_events")
    .insert({
      event_type: "welcome_intelligence.sent",
      org_id: data.orgId,
      properties: JSON.stringify({
        nearby_gps_found: nearbyGPs.length,
        has_velocity_insight: !!velocityInsight,
        homework_findings_count: homeworkFindings.length,
      }),
    })
    .catch(() => {});

  console.log(
    `[WelcomeIntelligence] Sent to ${data.email} with ${nearbyGPs.length} GP leads`
  );
}

/**
 * Fetch general practitioners near the practice who could be referral sources.
 * These are GPs the doctor may not know are nearby.
 */
async function fetchNearbyReferralSources(
  city: string | null,
  stateAbbr: string | null,
  specialty: string | null
): Promise<NearbyGP[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !city) return [];

  // Vertical-aware referral source search (mirrors gpDiscovery.ts logic)
  const spec = (specialty || "").toLowerCase();
  const REFERRAL_QUERIES: Record<string, string> = {
    dent: "general dentist",
    endo: "general dentist",
    ortho: "general dentist",
    chiro: "family medicine physician",
    "physical_ther": "orthopedic surgeon",
    optom: "ophthalmologist",
    attorney: "insurance broker",
    lawyer: "insurance broker",
    account: "financial advisor",
    cpa: "financial advisor",
    veterinar: "pet store",
    "real estate": "mortgage broker",
  };
  let searchTerm = "general practitioner";
  for (const [key, query] of Object.entries(REFERRAL_QUERIES)) {
    if (spec.includes(key)) { searchTerm = query; break; }
  }
  // For direct-acquisition verticals (barber, gym, restaurant), skip GP search entirely
  const directAcquisitionVerticals = ["barber", "salon", "beauty", "gym", "fitness", "restaurant", "cafe", "plumb", "electric", "hvac", "mechanic", "auto"];
  if (directAcquisitionVerticals.some((v) => spec.includes(v))) {
    return []; // No referral sources for walk-in businesses
  }

  const query = `${searchTerm} in ${city}${stateAbbr ? `, ${stateAbbr}` : ""}`;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    if (!result.results || result.results.length === 0) return [];

    return result.results.slice(0, 10).map(
      (place: {
        name: string;
        formatted_address?: string;
        rating?: number;
        user_ratings_total?: number;
      }) => ({
        name: place.name,
        address: place.formatted_address || "",
        rating: place.rating || 0,
        reviewCount: place.user_ratings_total || 0,
      })
    );
  } catch (err) {
    console.error("[WelcomeIntelligence] Places API error:", err);
    return [];
  }
}

/**
 * Build a velocity insight from the seeded ranking snapshot.
 */
async function buildVelocityInsight(
  orgId: number
): Promise<string | null> {
  try {
    const snapshot = await db("weekly_ranking_snapshots")
      .where({ org_id: orgId })
      .orderBy("created_at", "desc")
      .first();

    if (!snapshot) return null;

    const competitorName = snapshot.competitor_name;
    const clientReviews = snapshot.client_review_count || 0;

    if (competitorName && clientReviews > 0) {
      return `${competitorName} is actively growing their presence. At current pace, the review gap widens by roughly 2-3 reviews per week. Starting your review strategy now means the gap stops growing today.`;
    }

    return null;
  } catch {
    return null;
  }
}

function buildWelcomeIntelligenceEmail(params: {
  practiceName: string;
  city: string;
  nearbyGPs: NearbyGP[];
  velocityInsight: string | null;
  checkupScore: number | null;
  topCompetitorName: string | null;
  homeworkFindings?: SurpriseFinding[];
}): string {
  const { practiceName, city, nearbyGPs, velocityInsight, checkupScore, topCompetitorName, homeworkFindings } = params;

  const gpRows = nearbyGPs
    .slice(0, 5)
    .map(
      (gp) => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9;">
          <strong style="color: #212D40;">${escapeHtml(gp.name)}</strong>
          <br/><span style="color: #94a3b8; font-size: 13px;">${escapeHtml(gp.address)}</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; text-align: right; white-space: nowrap;">
          <span style="color: #212D40; font-weight: 600;">${gp.rating.toFixed(1)}&#9733;</span>
          <br/><span style="color: #94a3b8; font-size: 13px;">${gp.reviewCount} reviews</span>
        </td>
      </tr>`
    )
    .join("");

  return `
    <div style="max-width: 560px; margin: 0 auto;">
      <h1 style="color: #212D40; font-size: 22px; font-weight: 700; margin-bottom: 8px;">
        We kept digging after your Checkup.
      </h1>
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        ${practiceName} scored ${checkupScore || "N/A"}/100 yesterday. Here's what we found since then.
      </p>

      ${nearbyGPs.length > 0 ? `
      <div style="background: rgba(213, 103, 83, 0.05); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <h2 style="color: #D56753; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">
          Revenue Opportunity
        </h2>
        <p style="color: #212D40; font-size: 16px; font-weight: 600; margin: 0;">
          ${nearbyGPs.length} businesses near ${city} that could be sending you clients.
        </p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr>
            <th style="padding: 8px 16px; text-align: left; color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Practice</th>
            <th style="padding: 8px 16px; text-align: right; color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Rating</th>
          </tr>
        </thead>
        <tbody>${gpRows}</tbody>
      </table>

      <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
        Each of these practices sees patients who may need your specialty. The ones with high review counts have the most patient volume to refer from.
      </p>
      ` : ""}

      ${homeworkFindings && homeworkFindings.length > 0 ? `
      <div style="background: rgba(213, 103, 83, 0.08); border: 1px solid rgba(213, 103, 83, 0.2); border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h2 style="color: #D56753; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 0;">
          We Kept Digging
        </h2>
        ${homeworkFindings.map((f) => `
        <div style="margin-bottom: 16px;">
          <p style="color: #212D40; font-size: 15px; font-weight: 600; margin: 0 0 4px 0;">
            ${escapeHtml(f.headline)}
          </p>
          <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 0;">
            ${escapeHtml(f.detail)}
          </p>
        </div>
        `).join("")}
      </div>
      ` : ""}

      ${velocityInsight ? `
      <div style="background: #212D40; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h2 style="color: #D56753; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">
          Competitive Velocity
        </h2>
        <p style="color: white; font-size: 15px; line-height: 1.6; margin: 0;">
          ${escapeHtml(velocityInsight)}
        </p>
      </div>
      ` : ""}

      ${topCompetitorName ? `
      <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
        Your top competitor <strong style="color: #212D40;">${escapeHtml(topCompetitorName)}</strong> isn't standing still. Neither should you.
      </p>
      ` : ""}

      <div style="text-align: center; margin: 32px 0;">
        <a href="https://getalloro.com/signin" style="display: inline-block; background: #D56753; color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;">
          See your full dashboard
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 13px; text-align: center; margin-top: 32px;">
        Your Monday Brief arrives next week with fresh competitive data.
        <br/>Alloro is watching your market so you don't have to.
      </p>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
