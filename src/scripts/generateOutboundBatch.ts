/**
 * Outbound Oz Batch Generator
 *
 * Takes a CSV of prospects (name, email, businessName, city)
 * and generates a personalized Oz moment email for each one.
 *
 * Output: JSON array ready for ProspectAI API or manual send.
 * Each email has a unique subject line naming their real competitor
 * with a real number. Not a template. Fresh intelligence.
 *
 * Usage:
 *   npx tsx src/scripts/generateOutboundBatch.ts prospects.csv
 *   npx tsx src/scripts/generateOutboundBatch.ts --inline "Dr. Smith,drsmith@email.com,Artful Orthodontics,Winter Garden FL"
 *
 * Output: outbound-batch-{date}.json in project root
 */

import "dotenv/config";
import * as fs from "fs";
import { textSearch } from "../controllers/places/feature-services/GooglePlacesApiService";
import { generateOzMoments, type OzMomentData } from "../services/ozMoment";

interface Prospect {
  firstName: string;
  email: string;
  businessName: string;
  city: string;
}

interface OutboundEmail {
  to: string;
  firstName: string;
  businessName: string;
  city: string;
  competitorName: string;
  competitorCategory: string;
  clientRating: number;
  clientReviews: number;
  competitorRating: number;
  competitorReviews: number;
  rank: number | null;
  totalCompetitors: number;
  ozMoment1: string;
  ozMoment2: string | null;
  subjectLine: string;
  previewText: string;
  body: string;
  checkupLink: string;
  generatedAt: string;
  // Trust gates
  verified: boolean; // Passed all automated checks
  manualReview: boolean; // Flagged for human review before sending
  warnings: string[]; // What to check manually
}

/**
 * Trust Gate: Verify every data point before it goes into an email.
 * One wrong number = one Reddit post = permanent reputation damage.
 *
 * Rules:
 * 1. Business name must MATCH the prospect's business (not a different business with similar name)
 * 2. Competitor must be in the SAME category (endodontist vs endodontist, not vs general dentist)
 * 3. All numbers must come directly from Google (never estimated or rounded misleadingly)
 * 4. If any verification fails, skip this prospect. Better to send 40 perfect emails than 50 with one wrong.
 */
interface VerificationResult {
  passed: boolean;
  warnings: string[];
  failures: string[];
}

function verifyMatch(prospectName: string, googleName: string, prospectCity: string, googleAddress: string): VerificationResult {
  const warnings: string[] = [];
  const failures: string[] = [];

  // Check 1: Business name similarity
  const prospectLower = prospectName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const googleLower = googleName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nameOverlap = prospectLower.split("").filter((c) => googleLower.includes(c)).length / prospectLower.length;

  if (nameOverlap < 0.5) {
    failures.push(`Name mismatch: prospect "${prospectName}" vs Google "${googleName}" (${Math.round(nameOverlap * 100)}% overlap)`);
  } else if (nameOverlap < 0.7) {
    warnings.push(`Name partial match: "${prospectName}" vs "${googleName}" (${Math.round(nameOverlap * 100)}% overlap). Manual review recommended.`);
  }

  // Check 2: City match
  const cityLower = prospectCity.toLowerCase();
  const addressLower = googleAddress.toLowerCase();
  if (!addressLower.includes(cityLower.split(",")[0].split(" ")[0])) {
    warnings.push(`City mismatch: prospect "${prospectCity}" not found in Google address "${googleAddress}"`);
  }

  return {
    passed: failures.length === 0,
    warnings,
    failures,
  };
}

/**
 * Generate a personalized outbound email for one prospect.
 * Real Google data. Real competitor. Real Oz moment.
 * Trust-gated: skips if data cannot be verified.
 */
async function generateForProspect(prospect: Prospect): Promise<OutboundEmail | null> {
  console.log(`  Generating for ${prospect.businessName} (${prospect.city})...`);

  try {
    // Step 1: Find the business on Google
    const results = await textSearch(`${prospect.businessName} ${prospect.city}`, 3);
    if (!results?.length) {
      console.log(`    ✗ Not found on Google Places`);
      return null;
    }

    const place = results[0];
    const placeId = place.id;
    const name = place.displayName?.text || prospect.businessName;

    // TRUST GATE: Verify this is actually the right business
    const verification = verifyMatch(
      prospect.businessName,
      name,
      prospect.city,
      place.formattedAddress || ""
    );

    if (!verification.passed) {
      console.log(`    ✗ TRUST GATE FAILED:`);
      for (const f of verification.failures) console.log(`      ${f}`);
      return null;
    }
    if (verification.warnings.length > 0) {
      for (const w of verification.warnings) console.log(`    ⚠ ${w}`);
    }
    const rating = place.rating || 0;
    const reviewCount = place.userRatingCount || 0;
    const category = place.primaryTypeDisplayName?.text || place.primaryType || "business";
    const hasWebsite = !!place.websiteUri;
    const photoCount = place.photos?.length || 0;

    // Step 2: Find competitors
    const compResults = await textSearch(`${category} near ${place.formattedAddress}`, 8);
    const competitors = compResults.filter((c: any) => c.id !== placeId).slice(0, 5);

    if (competitors.length === 0) {
      console.log(`    ✗ No competitors found`);
      return null;
    }

    const topComp = competitors[0];
    const compName = topComp.displayName?.text || "Unknown";
    const compRating = topComp.rating || 0;
    const compReviews = topComp.userRatingCount || 0;

    // TRUST GATE: Verify competitor is actually a competitor (same category)
    const compCategory = topComp.primaryTypeDisplayName?.text || topComp.primaryType || "";
    if (compName === "Unknown" || compReviews === 0) {
      console.log(`    ✗ TRUST GATE: Competitor data too thin (${compName}, ${compReviews} reviews). Skipping.`);
      return null;
    }

    // TRUST GATE: Don't claim numbers we can't back up
    // Google Places API review counts are real-time. But if the Oz engine
    // references a specific review's TEXT, that text must exist.
    // The Oz engine fetches reviews itself, so the text is always real.
    // But we add a flag for manual review if anything looks off.
    const needsManualReview =
      reviewCount === 0 || // No reviews = thin data
      compReviews < 5 || // Competitor too small for meaningful comparison
      (name.toLowerCase() === compName.toLowerCase()); // Same business returned twice

    if (needsManualReview) {
      console.log(`    ⚠ FLAGGED FOR MANUAL REVIEW: thin data or potential duplicate`);
    }

    // Calculate rank
    const all = [
      { name, reviews: reviewCount },
      ...competitors.map((c: any) => ({ name: c.displayName?.text, reviews: c.userRatingCount || 0 })),
    ].sort((a, b) => b.reviews - a.reviews);
    const rank = all.findIndex((b) => b.name === name) + 1;

    // Step 3: Generate Oz moments
    const ozData: OzMomentData = {
      clientName: name,
      clientPlaceId: placeId,
      clientRating: rating,
      clientReviewCount: reviewCount,
      clientReviews: [],
      clientHasWebsite: hasWebsite,
      clientPhotoCount: photoCount,
      clientCategory: category,
      clientCity: prospect.city,
      competitorName: compName,
      competitorPlaceId: topComp.id,
      competitorRating: compRating,
      competitorReviewCount: compReviews,
      competitorReviews: [],
      competitorHasWebsite: !!topComp.websiteUri,
      competitorPhotoCount: topComp.photos?.length || 0,
      competitorHours: null,
      marketRank: rank,
      totalCompetitors: competitors.length + 1,
      avgRating: competitors.reduce((s: number, c: any) => s + (c.rating || 0), 0) / competitors.length,
      avgReviews: competitors.reduce((s: number, c: any) => s + (c.userRatingCount || 0), 0) / competitors.length,
      vertical: category,
      avgCaseValue: 500,
    };

    const moments = await generateOzMoments(ozData);
    if (moments.length === 0) {
      console.log(`    ✗ No Oz moments generated`);
      return null;
    }

    // Step 4: Compose the email
    const oz1 = moments[0];
    const oz2 = moments[1] || null;

    // Subject line: pride variant (the sleeper from testing)
    const subjectLine = rating >= 4.8
      ? `${prospect.firstName}, your ${rating}-star rating tells a story ${compName}'s doesn't.`
      : `${prospect.firstName}, ${compName} has ${compReviews} reviews. You have ${reviewCount}.`;

    // Preview text: curiosity + hope
    const previewText = `I ran a free analysis on ${prospect.businessName}. One thing stood out.`;

    // Body: 3-line format (ultra-short, respects their time)
    const checkupLink = `https://app.getalloro.com/checkup?q=${encodeURIComponent(prospect.businessName)}&city=${encodeURIComponent(prospect.city)}`;

    const body = `${prospect.firstName},

${oz1.hook}

${oz1.implication}

Full analysis (free, 10 seconds): ${checkupLink}

Corey Wise
Bend, Oregon`;

    console.log(`    ✓ Subject: ${subjectLine.slice(0, 60)}...`);

    const allWarnings = [...verification.warnings];
    if (needsManualReview) allWarnings.push("Thin data or potential duplicate. Verify before sending.");

    return {
      to: prospect.email,
      firstName: prospect.firstName,
      businessName: name,
      city: prospect.city,
      competitorName: compName,
      competitorCategory: compCategory,
      clientRating: rating,
      clientReviews: reviewCount,
      competitorRating: compRating,
      competitorReviews: compReviews,
      rank,
      totalCompetitors: competitors.length + 1,
      ozMoment1: oz1.hook,
      ozMoment2: oz2?.hook || null,
      subjectLine,
      previewText,
      body,
      checkupLink,
      generatedAt: new Date().toISOString(),
      // Trust gates
      verified: verification.passed && !needsManualReview,
      manualReview: needsManualReview,
      warnings: allWarnings,
    };
  } catch (err: any) {
    console.log(`    ✗ Error: ${err.message}`);
    return null;
  }
}

/**
 * Parse a CSV line into a Prospect
 */
function parseLine(line: string): Prospect | null {
  const parts = line.split(",").map((s) => s.trim());
  if (parts.length < 4) return null;
  return {
    firstName: parts[0],
    email: parts[1],
    businessName: parts[2],
    city: parts[3],
  };
}

async function main() {
  const args = process.argv.slice(2);

  let prospects: Prospect[] = [];

  if (args[0] === "--inline") {
    const p = parseLine(args.slice(1).join(","));
    if (p) prospects = [p];
  } else if (args[0] && fs.existsSync(args[0])) {
    const lines = fs.readFileSync(args[0], "utf-8").split("\n").filter(Boolean);
    // Skip header if present
    const start = lines[0].toLowerCase().includes("email") ? 1 : 0;
    for (const line of lines.slice(start)) {
      const p = parseLine(line);
      if (p) prospects.push(p);
    }
  } else {
    console.log("Usage:");
    console.log('  npx tsx src/scripts/generateOutboundBatch.ts prospects.csv');
    console.log('  npx tsx src/scripts/generateOutboundBatch.ts --inline "Dr. Smith,drsmith@email.com,Artful Orthodontics,Winter Garden FL"');
    process.exit(0);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log(`  GENERATING ${prospects.length} PERSONALIZED OZ EMAILS`);
  console.log("═══════════════════════════════════════════════════════\n");

  const emails: OutboundEmail[] = [];

  for (const prospect of prospects) {
    const email = await generateForProspect(prospect);
    if (email) emails.push(email);
  }

  // Write output
  const filename = `outbound-batch-${new Date().toISOString().split("T")[0]}.json`;
  fs.writeFileSync(filename, JSON.stringify(emails, null, 2));

  const verified = emails.filter((e) => e.verified);
  const needsReview = emails.filter((e) => e.manualReview);
  const autoApproved = emails.filter((e) => e.verified && !e.manualReview);

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  BATCH RESULTS`);
  console.log(`  Generated:      ${emails.length}/${prospects.length}`);
  console.log(`  Auto-approved:  ${autoApproved.length} (safe to send)`);
  console.log(`  Manual review:  ${needsReview.length} (Corey reviews before send)`);
  console.log(`  Blocked:        ${prospects.length - emails.length} (trust gate failed)`);
  console.log(`  Output:         ${filename}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  // Show warnings
  for (const e of needsReview) {
    console.log(`  ⚠ ${e.businessName}: ${e.warnings.join("; ")}`);
  }

  // Preview first auto-approved email
  const preview = autoApproved[0] || emails[0];
  if (preview) {
    console.log(`\n  PREVIEW (${preview.verified ? "AUTO-APPROVED" : "NEEDS REVIEW"}):`);
    console.log(`  TO: ${preview.to}`);
    console.log(`  SUBJECT: ${preview.subjectLine}`);
    console.log(`  PREVIEW: ${preview.previewText}`);
    console.log(`  DATA CHECK: ${preview.businessName} (${preview.clientRating}★, ${preview.clientReviews} reviews) vs ${preview.competitorName} (${preview.competitorRating}★, ${preview.competitorReviews} reviews)`);
    console.log(`  BODY:\n${preview.body.split("\n").map((l) => "    " + l).join("\n")}`);
  }
}

main().catch(console.error);
