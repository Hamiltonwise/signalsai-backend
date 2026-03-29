/**
 * Real Estate Agent -- Execution Service
 *
 * Runs monthly (1st Monday 8:30 AM PT) + quarterly.
 * Uses webFetch to check public listing sites for Wyoming properties
 * in Teton, Sublette, and Fremont counties.
 * Filters by: acreage, price range, water rights, accessibility.
 *
 * Writes "personal.property_scan" event with findings.
 * Creates dream_team_task for Corey when matching properties found.
 */

import { db } from "../../database/connection";
import { fetchPage, extractText } from "../webFetch";

// ── Types ───────────────────────────────────────────────────────────

interface PropertyListing {
  source: string;
  title: string;
  county: string;
  acreage: number | null;
  price: number | null;
  pricePerAcre: number | null;
  link: string;
  hasWaterRights: boolean | null;
  yearRoundAccess: boolean | null;
  strCapable: boolean | null;
  snippet?: string;
  matchScore: number; // 0-5 based on criteria met
}

interface PropertyScanSummary {
  scannedAt: string;
  countiesScanned: number;
  listingsFound: number;
  qualifyingProperties: number;
  listings: PropertyListing[];
}

// ── Target Counties ─────────────────────────────────────────────────

interface CountyTarget {
  name: string;
  state: string;
  fips?: string;
  strOccupancyEstimate: number; // conservative annual estimate
  searchTerms: string[];
}

const TARGET_COUNTIES: CountyTarget[] = [
  {
    name: "Teton",
    state: "WY",
    strOccupancyEstimate: 0.50, // 50% annual occupancy
    searchTerms: [
      "Teton County Wyoming land",
      "Jackson Hole acreage for sale",
      "land for sale near Grand Teton",
    ],
  },
  {
    name: "Sublette",
    state: "WY",
    strOccupancyEstimate: 0.35,
    searchTerms: [
      "Sublette County Wyoming land",
      "Pinedale Wyoming property",
      "land for sale near Wind River Range",
    ],
  },
  {
    name: "Fremont",
    state: "WY",
    strOccupancyEstimate: 0.35,
    searchTerms: [
      "Fremont County Wyoming land",
      "Lander Wyoming property",
      "Dubois Wyoming land for sale",
    ],
  },
];

// ── Criteria Thresholds ─────────────────────────────────────────────

const MIN_ACREAGE = 5;
const MAX_PRICE = 5_000_000; // $5M upper bound for scan
const MIN_MATCH_SCORE = 3; // out of 5 criteria to qualify for task

// ── Public Listing Sources ──────────────────────────────────────────

const LISTING_SOURCES = [
  {
    name: "Zillow",
    urlTemplate: (county: string) =>
      `https://www.zillow.com/homes/${county}-County,-WY/land_type/`,
  },
  {
    name: "LandWatch",
    urlTemplate: (county: string) =>
      `https://www.landwatch.com/wyoming-land-for-sale/${county.toLowerCase()}-county`,
  },
  {
    name: "Realtor.com",
    urlTemplate: (county: string) =>
      `https://www.realtor.com/realestateandhomes-search/${county}-County_WY/type-land`,
  },
];

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run the Real Estate Agent monthly property scan.
 * Scans all target counties across public listing sites.
 */
export async function runPropertyScan(): Promise<PropertyScanSummary> {
  const allListings: PropertyListing[] = [];

  for (const county of TARGET_COUNTIES) {
    for (const source of LISTING_SOURCES) {
      try {
        const listings = await scanSource(source, county);
        allListings.push(...listings);
        await delay(3000); // Rate limiting between requests
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[RealEstate] Error scanning ${source.name} for ${county.name}:`,
          message,
        );
      }
    }
  }

  // Filter qualifying properties
  const qualifying = allListings.filter((l) => l.matchScore >= MIN_MATCH_SCORE);

  const summary: PropertyScanSummary = {
    scannedAt: new Date().toISOString(),
    countiesScanned: TARGET_COUNTIES.length,
    listingsFound: allListings.length,
    qualifyingProperties: qualifying.length,
    listings: qualifying, // Only store qualifying listings
  };

  // Write scan event
  await writeScanEvent(summary);

  // Create task for Corey if matching properties found
  if (qualifying.length > 0) {
    await createPropertyTask(qualifying);
  }

  console.log(
    `[RealEstate] Scan complete: ${allListings.length} found, ${qualifying.length} qualifying across ${TARGET_COUNTIES.length} counties`,
  );

  return summary;
}

// ── Source Scanning ─────────────────────────────────────────────────

async function scanSource(
  source: { name: string; urlTemplate: (county: string) => string },
  county: CountyTarget,
): Promise<PropertyListing[]> {
  const url = source.urlTemplate(county.name);
  const page = await fetchPage(url);

  if (!page.success || !page.html) {
    console.log(
      `[RealEstate] ${source.name}/${county.name}: ${page.error || "No response"}`,
    );
    return [];
  }

  const text = await extractText(page.html);
  const listings = extractListingsFromText(text, source.name, county, url);

  return listings;
}

function extractListingsFromText(
  text: string,
  sourceName: string,
  county: CountyTarget,
  sourceUrl: string,
): PropertyListing[] {
  const listings: PropertyListing[] = [];
  const textLower = text.toLowerCase();

  // Extract price mentions (pattern: $XXX,XXX or $X.XM)
  const priceRegex = /\$[\d,]+(?:\.\d+)?(?:\s*[mM](?:illion)?)?/g;
  const priceMatches = text.match(priceRegex) || [];

  // Extract acreage mentions
  const acreRegex = /([\d,.]+)\s*(?:acres?|ac\b)/gi;
  const acreMatches = text.match(acreRegex) || [];

  // If we found price + acreage combinations, create listing entries
  // This is heuristic extraction from unstructured text
  if (priceMatches.length > 0 && acreMatches.length > 0) {
    const maxListings = Math.min(priceMatches.length, acreMatches.length, 5);

    for (let i = 0; i < maxListings; i++) {
      const price = parsePrice(priceMatches[i]);
      const acreage = parseAcreage(acreMatches[i]);

      if (price === null || acreage === null) continue;
      if (price > MAX_PRICE) continue;

      const listing = buildListing(
        sourceName,
        county,
        price,
        acreage,
        textLower,
        sourceUrl,
      );
      listings.push(listing);
    }
  }

  return listings;
}

function buildListing(
  sourceName: string,
  county: CountyTarget,
  price: number,
  acreage: number,
  textLower: string,
  sourceUrl: string,
): PropertyListing {
  // Score against 5 criteria
  let matchScore = 0;

  // 1. Acreage >= 5
  if (acreage >= MIN_ACREAGE) matchScore++;

  // 2. Views (check for keywords)
  const hasViews =
    textLower.includes("mountain view") ||
    textLower.includes("lake view") ||
    textLower.includes("teton view") ||
    textLower.includes("panoramic") ||
    textLower.includes("scenic");
  if (hasViews) matchScore++;

  // 3. STR capable (check county allows it and proximity to recreation)
  const strCapable =
    textLower.includes("short-term") ||
    textLower.includes("rental") ||
    textLower.includes("vrbo") ||
    textLower.includes("airbnb") ||
    textLower.includes("national park") ||
    textLower.includes("yellowstone") ||
    textLower.includes("ski");
  if (strCapable) matchScore++;

  // 4. Year-round access
  const yearRoundAccess =
    textLower.includes("year-round") ||
    textLower.includes("year round") ||
    textLower.includes("all-season") ||
    textLower.includes("paved road") ||
    textLower.includes("county road");
  if (yearRoundAccess) matchScore++;

  // 5. Infrastructure (water, power, internet)
  const hasInfra =
    (textLower.includes("well") || textLower.includes("water rights")) &&
    (textLower.includes("electric") ||
      textLower.includes("power") ||
      textLower.includes("grid"));
  if (hasInfra) matchScore++;

  return {
    source: sourceName,
    title: `${county.name} County, ${county.state} - ${acreage} acres`,
    county: county.name,
    acreage,
    price,
    pricePerAcre: acreage > 0 ? Math.round(price / acreage) : null,
    link: sourceUrl,
    hasWaterRights: textLower.includes("water rights") ? true : null,
    yearRoundAccess: yearRoundAccess || null,
    strCapable: strCapable || null,
    matchScore,
  };
}

// ── Parsers ─────────────────────────────────────────────────────────

function parsePrice(priceStr: string): number | null {
  try {
    const cleaned = priceStr.replace(/[$,]/g, "").trim();
    if (cleaned.toLowerCase().includes("m")) {
      const num = parseFloat(cleaned.replace(/[mM](?:illion)?/, ""));
      return isNaN(num) ? null : num * 1_000_000;
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

function parseAcreage(acreStr: string): number | null {
  try {
    const cleaned = acreStr.replace(/[^\d.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

// ── Writers ─────────────────────────────────────────────────────────

async function writeScanEvent(summary: PropertyScanSummary): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "personal.property_scan",
      org_id: null,
      properties: JSON.stringify({
        scanned_at: summary.scannedAt,
        counties_scanned: summary.countiesScanned,
        listings_found: summary.listingsFound,
        qualifying_properties: summary.qualifyingProperties,
        listings: summary.listings.map((l) => ({
          source: l.source,
          county: l.county,
          acreage: l.acreage,
          price: l.price,
          price_per_acre: l.pricePerAcre,
          match_score: l.matchScore,
          has_water_rights: l.hasWaterRights,
          year_round_access: l.yearRoundAccess,
          str_capable: l.strCapable,
        })),
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[RealEstate] Failed to write scan event:`, message);
  }
}

async function createPropertyTask(
  listings: PropertyListing[],
): Promise<void> {
  const listingDetails = listings
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5) // Top 5 matches
    .map((l) => {
      const price = l.price ? `$${(l.price / 1000).toFixed(0)}K` : "Price TBD";
      const ppa = l.pricePerAcre ? `$${l.pricePerAcre.toLocaleString()}/acre` : "";
      return `- ${l.county} County: ${l.acreage} acres, ${price} ${ppa ? `(${ppa})` : ""} [Score: ${l.matchScore}/5] via ${l.source}${l.hasWaterRights ? " (water rights noted)" : ""}`;
    })
    .join("\n");

  try {
    await db("dream_team_tasks").insert({
      title: `Real Estate: ${listings.length} qualifying Wyoming propert${listings.length === 1 ? "y" : "ies"} found`,
      description: `Monthly property scan found ${listings.length} propert${listings.length === 1 ? "y" : "ies"} matching 3+ of 5 criteria (acreage, views, STR capable, year-round access, infrastructure).\n\nTop matches:\n${listingDetails}\n\nNext step: Review listings and verify criteria that could not be confirmed from listing text (water rights documentation, county STR regulations, winter road access).`,
      assigned_to: "corey",
      status: "open",
      priority: "medium",
      metadata: JSON.stringify({
        source: "real_estate_agent",
        scan_type: "monthly_property_scan",
        qualifying_count: listings.length,
        counties: [...new Set(listings.map((l) => l.county))],
      }),
    });
    console.log(
      `[RealEstate] Created task for ${listings.length} qualifying properties`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[RealEstate] Failed to create property task:`, message);
  }
}

// ── Utilities ───────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
