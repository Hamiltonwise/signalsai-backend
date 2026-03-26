/**
 * PatientPath Keyword Tracking (WO-8)
 *
 * Schedule: Monday 2am PT
 * Tracks 10-15 keywords per practice. Stores position with delta.
 * Monday email integration: ranking moves feed into findings.
 */

import { db } from "../database/connection";

interface KeywordResult {
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  delta: number | null;
  url: string | null;
}

/**
 * Generate keyword list for a practice based on specialty and location
 */
function generateKeywords(specialty: string, city: string, practiceName: string): string[] {
  const keywords: string[] = [];
  const normalizedSpecialty = specialty.toLowerCase();
  const normalizedCity = city.toLowerCase();

  // Core keywords (always included)
  keywords.push(`${normalizedSpecialty} ${normalizedCity}`);
  keywords.push(`${normalizedSpecialty} near me`);
  keywords.push(`best ${normalizedSpecialty} ${normalizedCity}`);
  keywords.push(`${normalizedSpecialty} reviews ${normalizedCity}`);
  keywords.push(`${practiceName.toLowerCase()}`);

  // Service-specific keywords
  keywords.push(`${normalizedSpecialty} open today ${normalizedCity}`);
  keywords.push(`emergency ${normalizedSpecialty} ${normalizedCity}`);
  keywords.push(`${normalizedSpecialty} accepting new patients ${normalizedCity}`);
  keywords.push(`top rated ${normalizedSpecialty} ${normalizedCity}`);
  keywords.push(`${normalizedSpecialty} ${normalizedCity} cost`);

  // Long-tail
  keywords.push(`how to find a good ${normalizedSpecialty} in ${normalizedCity}`);
  keywords.push(`${normalizedSpecialty} ${normalizedCity} google reviews`);

  return keywords.slice(0, 15);
}

/**
 * Track keyword positions for all organizations with PatientPath sites
 */
export async function trackKeywords(): Promise<void> {
  console.log("[Keyword Tracker] Starting Monday keyword check...");

  const orgs = await db("organizations")
    .leftJoin("websites", "organizations.id", "websites.organization_id")
    .select(
      "organizations.id",
      "organizations.name",
      "organizations.specialty",
      "organizations.city",
      "websites.domain"
    )
    .whereNotNull("websites.domain");

  for (const org of orgs) {
    if (!org.specialty || !org.city) continue;

    const keywords = generateKeywords(org.specialty, org.city, org.name);

    for (const keyword of keywords) {
      // Get previous position
      const previous = await db("patientpath_keywords")
        .where({ organization_id: org.id, keyword })
        .orderBy("checked_at", "desc")
        .first();

      // Position would come from a rank tracking API (SerpAPI, DataForSEO, etc.)
      // For now: store the keyword with null position until API is wired
      const position: number | null = null;
      const previousPosition = previous?.position ?? null;
      const delta = position !== null && previousPosition !== null
        ? previousPosition - position // positive = improved
        : null;

      await db("patientpath_keywords").insert({
        organization_id: org.id,
        keyword,
        position,
        previous_position: previousPosition,
        position_delta: delta,
        tracked_url: org.domain ? `https://${org.domain}` : null,
      });
    }

    console.log(`[Keyword Tracker] Tracked ${keywords.length} keywords for ${org.name}`);
  }

  console.log("[Keyword Tracker] Monday keyword check complete.");
}

/**
 * Get latest keyword positions for an org (for Monday email integration)
 */
export async function getKeywordMovers(orgId: number): Promise<KeywordResult[]> {
  const latest = await db("patientpath_keywords")
    .where({ organization_id: orgId })
    .whereNotNull("position_delta")
    .where("position_delta", "!=", 0)
    .orderBy("checked_at", "desc")
    .limit(5);

  return latest.map((row: any) => ({
    keyword: row.keyword,
    position: row.position,
    previousPosition: row.previous_position,
    delta: row.position_delta,
    url: row.tracked_url,
  }));
}
