/**
 * Real Business Oz Moment Test
 *
 * Takes real business names, searches Google Places API, fetches
 * competitor data, and runs the Oz engine with REAL data.
 *
 * This is the true test: does the Oz moment land with real businesses?
 *
 * Usage: npx tsx src/scripts/testOzReal.ts "Business Name, City"
 * Or edit the BUSINESSES array below and run: npx tsx src/scripts/testOzReal.ts
 */

import "dotenv/config";
import { textSearch, getPlaceDetails } from "../controllers/places/feature-services/GooglePlacesApiService";
import { generateOzMoments, type OzMomentData } from "../services/ozMoment";

// ═══ EDIT THESE: Real businesses to test ═══
const BUSINESSES: string[] = [
  "Artful Orthodontics, Florida",
  "Caswell Orthodontics, Hawaii",
  "Garrison Orthodontics",
  "1Endodontics, Virginia",
  "San Diego Center for Endodontics",
  "Surf City Endo",
  "DentalEMR",
  "Ray's Place Barbershop",
  "Evergreen Oculofacial Plastic Surgery, Bend OR",
  "Grove & Kane, Washington",
];

async function testBusiness(query: string) {
  console.log(`\n▸ ${query}`);
  console.log("─".repeat(60));

  try {
    // Step 1: Find the business on Google Places
    const results = await textSearch(query, 5);
    if (!results || results.length === 0) {
      console.log("  ✗ Not found on Google Places");
      return;
    }

    const place = results[0];
    const placeId = place.id;
    const name = place.displayName?.text || query;
    const rating = place.rating || 0;
    const reviewCount = place.userRatingCount || 0;
    const category = place.primaryTypeDisplayName?.text || place.primaryType || "business";
    const city = place.formattedAddress?.split(",")[1]?.trim() || "";
    const hasWebsite = !!place.websiteUri;
    const photoCount = place.photos?.length || 0;

    console.log(`  Found: ${name} (${rating}★, ${reviewCount} reviews, ${category})`);
    console.log(`  Location: ${place.formattedAddress}`);
    console.log(`  Website: ${hasWebsite ? "Yes" : "No"} | Photos: ${photoCount}`);

    // Step 2: Find competitors
    const competitorQuery = `${category} near ${place.formattedAddress}`;
    const competitors = await textSearch(competitorQuery, 10);
    const filtered = competitors
      .filter((c: any) => c.id !== placeId)
      .slice(0, 5);

    if (filtered.length === 0) {
      console.log("  ✗ No competitors found");
      return;
    }

    const topComp = filtered[0];
    const compName = topComp.displayName?.text || "Unknown";
    const compRating = topComp.rating || 0;
    const compReviews = topComp.userRatingCount || 0;
    const compHasWebsite = !!topComp.websiteUri;
    const compPhotoCount = topComp.photos?.length || 0;

    console.log(`  Top competitor: ${compName} (${compRating}★, ${compReviews} reviews)`);

    // Step 3: Build Oz moment data
    const ozData: OzMomentData = {
      clientName: name,
      clientPlaceId: placeId,
      clientRating: rating,
      clientReviewCount: reviewCount,
      clientReviews: [], // Will be fetched by ozMoment.ts
      clientHasWebsite: hasWebsite,
      clientPhotoCount: photoCount,
      clientCategory: category,
      clientCity: city,
      competitorName: compName,
      competitorPlaceId: topComp.id,
      competitorRating: compRating,
      competitorReviewCount: compReviews,
      competitorReviews: [], // Will be fetched by ozMoment.ts
      competitorHasWebsite: compHasWebsite,
      competitorPhotoCount: compPhotoCount,
      competitorHours: null,
      marketRank: 0, // Will calculate below
      totalCompetitors: filtered.length,
      avgRating: filtered.reduce((s: number, c: any) => s + (c.rating || 0), 0) / filtered.length,
      avgReviews: filtered.reduce((s: number, c: any) => s + (c.userRatingCount || 0), 0) / filtered.length,
      vertical: category,
      avgCaseValue: 500, // Default
    };

    // Calculate rank
    const allByReviews = [
      { name, reviews: reviewCount },
      ...filtered.map((c: any) => ({ name: c.displayName?.text, reviews: c.userRatingCount || 0 })),
    ].sort((a, b) => b.reviews - a.reviews);
    ozData.marketRank = allByReviews.findIndex((b) => b.name === name) + 1;

    console.log(`  Market rank: #${ozData.marketRank} of ${filtered.length + 1}`);

    // Step 4: Generate Oz moments
    const start = Date.now();
    const moments = await generateOzMoments(ozData);
    const elapsed = Date.now() - start;

    if (moments.length === 0) {
      console.log("  ✗ No Oz moments generated (insufficient data)");
      return;
    }

    for (const [i, m] of moments.entries()) {
      console.log(`\n  Moment ${i + 1} (shareability: ${m.shareability}/10):`);
      console.log(`  HOOK: ${m.hook}`);
      console.log(`  IMPL: ${m.implication}`);
      console.log(`  ACT:  ${m.action}`);
    }

    console.log(`\n  ⏱ ${elapsed}ms (including review fetch)`);
  } catch (err: any) {
    console.log(`  ✗ Error: ${err.message}`);
  }
}

async function main() {
  // Check for command line argument
  const cliQuery = process.argv.slice(2).join(" ");
  const businesses = cliQuery ? [cliQuery] : BUSINESSES;

  if (businesses.length === 0) {
    console.log("No businesses to test.");
    console.log("Usage: npx tsx src/scripts/testOzReal.ts \"Business Name, City\"");
    console.log("Or edit the BUSINESSES array in the script.");
    process.exit(0);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  OZ MOMENT TEST -- REAL BUSINESSES");
  console.log("═══════════════════════════════════════════════════════");

  for (const biz of businesses) {
    await testBusiness(biz);
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  EVALUATION:");
  console.log("  - Does each HOOK reveal something the owner doesn't know?");
  console.log("  - Is it specific enough to screenshot and text?");
  console.log("  - Would you stop scrolling?");
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch(console.error);
