/**
 * PatientPath Build Pipeline — Phase 1 (WO19)
 *
 * BullMQ job: patientpath:build:{orgId}
 * Step 1: Fetch GBP data, reviews, competitors via Places API
 * Step 2: Claude Research Agent extracts irreplaceable_thing, fears, praise
 * Step 3: Set patientpath_status = 'preview_ready'
 */

import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import { db } from "../database/connection";
import {
  getPlaceDetails,
  textSearch,
} from "../controllers/places/feature-services/GooglePlacesApiService";

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

const LLM_MODEL = "claude-sonnet-4-20250514";
const SLACK_WEBHOOK = process.env.ALLORO_BRIEF_SLACK_WEBHOOK || "";

// ─── Review field mask (includes reviews) ───────────────────────────

const REVIEW_FIELD_MASK = [
  "id", "displayName", "formattedAddress", "rating", "userRatingCount",
  "reviews", "types", "primaryType", "primaryTypeDisplayName",
  "websiteUri", "nationalPhoneNumber", "regularOpeningHours",
  "photos", "location",
].join(",");

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API;
const PLACES_API_BASE = "https://places.googleapis.com/v1";

async function fetchPlaceWithReviews(placeId: string): Promise<any> {
  if (!GOOGLE_PLACES_API_KEY) return null;
  try {
    const response = await axios.get(`${PLACES_API_BASE}/places/${placeId}`, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": REVIEW_FIELD_MASK,
      },
    });
    return response.data;
  } catch (err: any) {
    console.error(`[PatientPath] Places API error for ${placeId}:`, err.message);
    return null;
  }
}

// ─── Research Agent prompt ──────────────────────────────────────────

const RESEARCH_SYSTEM = `You are a research analyst preparing intelligence for a dental/medical practice website builder. You analyze Google reviews and competitor data to find what makes a practice irreplaceable.

Extract and return JSON with these exact keys:

{
  "irreplaceable_thing": "One sentence that captures what makes this practice irreplaceable, derived from review patterns no competitor shares. Example: 'Patients describe Dr. Kargoli as the doctor who explains the entire procedure before touching an instrument -- no other endodontist in the market gets this comment.'",
  "fear_categories": ["Top 3 patient fears BEFORE their first appointment, extracted from review language. Example: 'fear of pain during root canal', 'fear of unnecessary procedures', 'fear of high costs'"],
  "praise_patterns": ["3-5 specific phrases patients actually use in reviews. Exact quotes, not paraphrased. Example: 'gentle hands', 'explained everything', 'felt no pain'"],
  "top_competitor_name": "Name of the #1 competitor by review count",
  "practice_personality": "One word: warm | clinical | premium | family | boutique | high-tech",
  "review_themes": ["3 recurring themes across reviews"]
}

Be specific. Use actual review text. Never fabricate quotes.`;

// ─── Main build function ────────────────────────────────────────────

export async function buildPatientPathForOrg(orgId: number): Promise<boolean> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) {
    console.error(`[PatientPath] Org ${orgId} not found`);
    return false;
  }

  console.log(`[PatientPath] Starting build for ${org.name} (org ${orgId})`);

  try {
    // ── Step 1: Fetch GBP data ──

    // Find the org's place_id from various sources
    let placeId: string | null = null;

    // Check checkup_data first (most reliable for Checkup-originated accounts)
    if (org.checkup_data) {
      try {
        const cd = typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data;
        if (cd?.placeId) placeId = cd.placeId;
      } catch {}
    }
    if (!placeId && org.business_data) {
      try {
        const bd = typeof org.business_data === "string" ? JSON.parse(org.business_data) : org.business_data;
        if (bd?.checkup_place_id) placeId = bd.checkup_place_id;
      } catch {}
    }

    // Check review_requests for a stored place_id
    if (!placeId) {
      const reviewReq = await db("review_requests")
        .where({ organization_id: orgId })
        .whereNotNull("place_id")
        .first();
      if (reviewReq?.place_id) placeId = reviewReq.place_id;
    }

    // Check google_properties for external_id
    if (!placeId) {
      const location = await db("locations")
        .where({ organization_id: orgId, is_primary: true })
        .first();
      if (location) {
        const prop = await db("google_properties")
          .where({ location_id: location.id })
          .first();
        if (prop?.external_id) placeId = prop.external_id;
      }
    }

    // Fallback: search Places API by name
    if (!placeId) {
      try {
        const results = await textSearch(`${org.name} ${org.operational_jurisdiction || ""}`.trim(), 3);
        if (results.length > 0) placeId = results[0].id;
      } catch {
        console.error(`[PatientPath] Places search failed for ${org.name}`);
      }
    }

    let gbpData: any = null;
    let reviews: any[] = [];
    let competitors: any[] = [];

    if (placeId) {
      // Fetch full details with reviews
      gbpData = await fetchPlaceWithReviews(placeId);
      reviews = gbpData?.reviews?.slice(0, 5) || [];

      // Fetch competitors via nearby search
      const specialty = gbpData?.primaryTypeDisplayName?.text || gbpData?.primaryType || "dentist";
      const address = gbpData?.formattedAddress || org.operational_jurisdiction || "";
      if (address) {
        try {
          const nearbyResults = await textSearch(`${specialty} near ${address}`, 10);
          competitors = nearbyResults
            .filter((r: any) => r.id !== placeId)
            .slice(0, 5)
            .map((r: any) => ({
              name: r.displayName?.text,
              rating: r.rating,
              reviewCount: r.userRatingCount,
              placeId: r.id,
            }));
        } catch {
          console.error(`[PatientPath] Competitor search failed`);
        }
      }
    }

    // Store raw build data
    const buildData = {
      placeId,
      gbp: gbpData ? {
        name: gbpData.displayName?.text,
        address: gbpData.formattedAddress,
        phone: gbpData.nationalPhoneNumber,
        website: gbpData.websiteUri,
        rating: gbpData.rating,
        reviewCount: gbpData.userRatingCount,
        specialty: gbpData.primaryTypeDisplayName?.text,
        photoCount: gbpData.photos?.length || 0,
      } : null,
      reviews: reviews.map((r: any) => ({
        rating: r.rating,
        text: r.text?.text || "",
        author: r.authorAttribution?.displayName || "Anonymous",
        time: r.relativePublishTimeDescription,
      })),
      competitors,
      fetchedAt: new Date().toISOString(),
    };

    await db("organizations").where({ id: orgId }).update({
      patientpath_build_data: JSON.stringify(buildData),
      patientpath_status: "researching",
    });

    console.log(`[PatientPath] Step 1 complete: ${reviews.length} reviews, ${competitors.length} competitors`);

    // ── Step 2: Claude Research Agent ──

    if (reviews.length === 0) {
      console.log(`[PatientPath] No reviews found for ${org.name}, skipping research`);
      await db("organizations").where({ id: orgId }).update({
        patientpath_status: "preview_ready",
        research_brief: JSON.stringify({
          irreplaceable_thing: "This practice is building its reputation. Reviews will reveal their unique value.",
          fear_categories: [],
          praise_patterns: [],
          top_competitor_name: competitors[0]?.name || null,
          practice_personality: "warm",
          review_themes: [],
        }),
      });
      return true;
    }

    const client = getAnthropic();

    const reviewText = reviews
      .map((r: any) => `${r.rating}★: "${r.text?.text || r.text || ""}" — ${r.author || "Anonymous"}`)
      .join("\n");

    const competitorText = competitors
      .map((c: any) => `${c.name}: ${c.rating}★, ${c.reviewCount} reviews`)
      .join("\n");

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 1500,
      system: RESEARCH_SYSTEM,
      messages: [{
        role: "user",
        content: `Practice: ${org.name}
Address: ${gbpData?.formattedAddress || org.operational_jurisdiction || "Unknown"}
Rating: ${gbpData?.rating || "Unknown"}
Reviews (${reviews.length}):
${reviewText}

Competitors:
${competitorText || "None found"}`,
      }],
    });

    const aiText = response.content[0]?.type === "text" ? response.content[0].text : "";

    let researchBrief: any = {};
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) researchBrief = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("[PatientPath] Failed to parse research JSON");
      researchBrief = {
        irreplaceable_thing: aiText.slice(0, 200),
        fear_categories: [],
        praise_patterns: [],
        top_competitor_name: competitors[0]?.name || null,
        practice_personality: "warm",
        review_themes: [],
      };
    }

    // ── Step 3: Set status ──

    await db("organizations").where({ id: orgId }).update({
      research_brief: JSON.stringify(researchBrief),
      patientpath_status: "preview_ready",
    });

    console.log(`[PatientPath] Complete for ${org.name}: "${researchBrief.irreplaceable_thing?.slice(0, 80)}..."`);
    return true;

  } catch (err: any) {
    console.error(`[PatientPath] Build failed for ${org.name}:`, err.message);

    await db("organizations").where({ id: orgId }).update({
      patientpath_status: "failed",
    });

    // Log to Slack
    if (SLACK_WEBHOOK) {
      try {
        await axios.post(SLACK_WEBHOOK, {
          text: `❌ PatientPath build failed: ${org.name} — ${err.message}`,
        });
      } catch {}
    }

    return false;
  }
}
