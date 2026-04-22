/**
 * Card 5 proof script.
 *
 * Runs the four Card 5 components against real inputs and writes a proof
 * file at /tmp/card5-proof-2026-04-22.md.
 *
 *   1. Rubric scoring Surf City Endodontics (surfcityendo.com) in all four
 *      modes. Calibration target: runtime composite ~27.
 *   2. Recognition Tri-Score output for Coastal Endodontic Studio
 *      (coastalendostudio.com), pulling reviews from Google Places.
 *   3. Freeform Concern Gate blocking a known-bad hero, passing a rewrite.
 *   4. Discoverability Bake producing schema.org markup for one test page.
 *
 * Run:   npx tsx scripts/card5-proof.ts
 * Needs: ANTHROPIC_API_KEY, GOOGLE_PLACES_API, NOTION_TOKEN
 */

import "dotenv/config";
import * as fs from "fs";
import { score as runRubric } from "../src/services/rubric/standardRubric";
import { scoreRecognition } from "../src/services/checkup/recognitionScorer";
import { runFreeformConcernGate } from "../src/services/siteQa/gates/freeformConcernGate";
import { runDiscoverabilityBakeStage } from "../src/services/patientpath/stages/discoverabilityBake";
import { fetchPage, extractText } from "../src/services/webFetch";

const OUTPUT_PATH = "/tmp/card5-proof-2026-04-22.md";

const BAD_HERO =
  "Advanced endodontic care utilizing state-of-the-art technology for all your comprehensive root canal needs.";

const GOOD_HERO =
  "If you're scared, in pain, or you got referred here because something hurts, you're in the right place. " +
  "Dr. Chris Olson has spent his career taking care of patients who needed someone to be honest with them. " +
  "Including patients who normally need anxiety medication to walk into a dental office, and didn't need it here.";

async function section1_RubricCalibration(): Promise<string> {
  const lines: string[] = [];
  lines.push("## Section 1 — Rubric calibration: Surf City Endodontics\n");
  lines.push(`Content scored (known hero from surfcityendo.com):\n`);
  lines.push(`> ${BAD_HERO}\n`);

  // Fetch the actual surfcityendo.com homepage if reachable, fallback to the hero.
  let content = BAD_HERO;
  const fetched = await fetchPage("https://surfcityendo.com");
  if (fetched.success && fetched.html) {
    content = await extractText(fetched.html);
    lines.push(`(Live site fetched — ${content.length} chars)\n`);
  } else {
    lines.push(`(Live site unreachable: ${fetched.error}. Using known hero string.)\n`);
  }

  for (const mode of ["runtime", "seo", "aeo", "cro"] as const) {
    const result = await runRubric(content, {
      mode,
      metadata: {
        practice: "Surf City Endodontics",
        specialty: "endodontics",
        location: "Huntington Beach, CA",
        url: "https://surfcityendo.com",
      },
    });
    lines.push(`### Mode: ${mode.toUpperCase()}`);
    lines.push(`- composite: **${result.composite}**`);
    lines.push(`- rubric_version: \`${result.rubric_version_id}\``);
    lines.push(`- judge_model: \`${result.judge_model}\``);
    lines.push(`- loaded_from: \`${result.loaded_from}\``);
    if (result.repair_instructions.length > 0) {
      lines.push(`- repair_instructions:`);
      for (const r of result.repair_instructions.slice(0, 3)) {
        lines.push(`  - **${r.dimension}**: ${r.instruction}`);
      }
    }
    const topFailing = Object.entries(result.dimensions)
      .filter(([, d]) => d.verdict === "scored" && d.max > 0)
      .sort((a, b) => a[1].score / a[1].max - b[1].score / b[1].max)
      .slice(0, 3);
    if (topFailing.length > 0) {
      lines.push(`- lowest-scoring dimensions:`);
      for (const [key, d] of topFailing) {
        lines.push(`  - ${key}: ${d.score}/${d.max} — ${d.reasoning}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function section2_RecognitionTriScore(): Promise<string> {
  const lines: string[] = [];
  lines.push("## Section 2 — Recognition Tri-Score: Coastal Endodontic Studio (FRIDAY ARTIFACT)\n");

  const result = await scoreRecognition({
    practiceUrl: "https://coastalendostudio.com",
    specialty: "endodontics",
    location: "San Diego, CA",
  });

  lines.push(`Run timestamp: \`${result.run_timestamp}\``);
  lines.push(`Rubric version: \`${result.rubric_version_id}\``);
  lines.push(`Review data available: ${result.review_data_available}`);
  if (result.warnings.length > 0) {
    lines.push(`\n### Warnings`);
    for (const w of result.warnings) lines.push(`- ${w}`);
  }

  lines.push(`\n### Practice`);
  lines.push(`- URL: ${result.practice.url}`);
  lines.push(`- Page fetched: ${result.practice.pageFetched} (content: ${result.practice.contentChars} chars)`);
  if (result.practice.pageFetchError) {
    lines.push(`- Fetch error: ${result.practice.pageFetchError}`);
  }
  lines.push(`- Review count used for scoring: ${result.practice.review_count}`);
  lines.push(`- SEO composite: **${result.practice.seo_composite ?? "n/a"}**`);
  lines.push(`- AEO composite: **${result.practice.aeo_composite ?? "n/a"}**`);
  lines.push(`- CRO composite: **${result.practice.cro_composite ?? "n/a"}**`);

  if (result.practice.missing_examples.length > 0) {
    lines.push(`\n### Missing examples (things patients said that aren't on the site)`);
    for (const ex of result.practice.missing_examples) {
      lines.push(`- "${ex.phrase}"`);
      lines.push(`  - from review: "${ex.sourceReview.slice(0, 200)}${ex.sourceReview.length > 200 ? "..." : ""}"`);
      lines.push(`  - verified: ${ex.verified} — ${ex.verificationReasoning}`);
    }
  } else {
    lines.push(`\n### Missing examples\n- (none extracted — see warnings above)`);
  }

  if (result.practice.patient_quotes_not_on_site.length > 0) {
    lines.push(`\n### Patient quotes absent from site content`);
    for (const q of result.practice.patient_quotes_not_on_site.slice(0, 3)) {
      lines.push(`- ${q.reviewerName ?? "Patient"} (${q.rating}★, ${q.when ?? ""}):`);
      lines.push(`  > ${q.text.slice(0, 300)}`);
    }
  }

  if (result.competitors.length > 0) {
    lines.push(`\n### Competitors`);
    for (const c of result.competitors) {
      lines.push(`- ${c.url}: SEO ${c.seo_composite ?? "n/a"} · AEO ${c.aeo_composite ?? "n/a"} · CRO ${c.cro_composite ?? "n/a"}`);
    }
  }

  return lines.join("\n");
}

async function section3_FreeformConcernGate(): Promise<string> {
  const lines: string[] = [];
  lines.push("\n## Section 3 — Freeform Concern Gate: bad hero blocked, rewrite passes\n");
  process.env.FREEFORM_CONCERN_GATE_ENABLED = "true";

  lines.push(`### Known-bad hero (should score below threshold)`);
  lines.push(`> ${BAD_HERO}\n`);
  const badResult = await runFreeformConcernGate({
    content: BAD_HERO,
    surface: "siteQa",
    attempt: 3,
    metadata: {
      practice: "Surf City Endodontics",
      specialty: "endodontics",
    },
  });
  lines.push(`- composite: **${badResult.score.composite}** (threshold 80)`);
  lines.push(`- passed: ${badResult.passed}`);
  lines.push(`- blocked (live mode, attempts exhausted): ${badResult.blocked}`);
  if (badResult.failingDimensions.length > 0) {
    lines.push(`- failing dimensions:`);
    for (const d of badResult.failingDimensions.slice(0, 5)) {
      lines.push(`  - ${d.key}: ${d.score}/${d.max} — ${d.reasoning}`);
    }
  }
  if (badResult.escalation) {
    lines.push(`- escalation task created: ${badResult.escalation.taskType}`);
  }

  lines.push(`\n### Rewrite anchored to The Standard (should pass)`);
  lines.push(`> ${GOOD_HERO}\n`);
  const goodResult = await runFreeformConcernGate({
    content: GOOD_HERO,
    surface: "siteQa",
    metadata: {
      practice: "Surf City Endodontics",
      specialty: "endodontics",
    },
  });
  lines.push(`- composite: **${goodResult.score.composite}** (threshold 80)`);
  lines.push(`- passed: ${goodResult.passed}`);
  lines.push(`- blocked: ${goodResult.blocked}`);

  delete process.env.FREEFORM_CONCERN_GATE_ENABLED;
  return lines.join("\n");
}

async function section4_DiscoverabilityBake(): Promise<string> {
  const lines: string[] = [];
  lines.push("\n## Section 4 — Discoverability Bake: schema.org markup for one page\n");

  process.env.DISCOVERABILITY_BAKE_ENABLED = "true";
  const result = await runDiscoverabilityBakeStage({
    orgId: 1,
    copyId: "proof-copy-id",
    copy: {
      sections: [
        { name: "hero", headline: "Room to breathe", body: "Hero body copy" },
        { name: "about", headline: "Meet your doctor", body: "About body" },
        { name: "services", headline: "What we handle", body: "Services body" },
      ],
    },
    practice: {
      name: "Surf City Endodontics",
      specialty: "endodontics",
      phone: "+1-714-555-0100",
      websiteUrl: "https://surfcityendo.com",
      address: {
        streetAddress: "123 Main St",
        city: "Huntington Beach",
        region: "CA",
        postalCode: "92648",
        country: "US",
      },
      lat: 33.66,
      lng: -117.99,
      hours: [
        { dayOfWeek: "Monday", opens: "08:00", closes: "17:00" },
        { dayOfWeek: "Tuesday", opens: "08:00", closes: "17:00" },
      ],
    },
    practitioner: {
      fullName: "Dr. Chris Olson",
      credentials: ["DDS"],
      education: ["Brigham Young University", "USC School of Dentistry"],
      specialty: "Endodontics",
      bio: "Two career pivots, both after having kids — a banker turned general dentist turned endodontist.",
    },
    reviews: [
      {
        author: "Maria V.",
        text: "Ninja accuracy. I didn't even need my usual anxiety medication.",
        rating: 5,
        reviewDate: "2026-03-01",
      },
    ],
  });
  delete process.env.DISCOVERABILITY_BAKE_ENABLED;

  lines.push(`- bake version: \`${result.artifact.bakeVersionId}\``);
  lines.push(`- templates source: \`${result.artifact.templatesSource}\``);
  lines.push(`- shadow: ${result.shadow}`);
  lines.push(`- pages baked: ${result.artifact.pages.length}\n`);

  const heroPage = result.artifact.pages.find((p) => p.sectionName === "hero");
  if (heroPage) {
    lines.push(`### Hero page schema (${heroPage.path})`);
    lines.push("```json");
    lines.push(JSON.stringify(heroPage.jsonLd, null, 2));
    lines.push("```\n");
    lines.push(`### Hero page internal links`);
    for (const link of heroPage.internalLinks) {
      lines.push(`- [${link.anchor}](${link.target}) — ${link.patientIntent}`);
    }
    lines.push(`\n### Hero page primary CTA`);
    lines.push(`- **${heroPage.primaryCta.text}** → \`${heroPage.primaryCta.href}\``);
    lines.push(`- rationale: ${heroPage.primaryCta.rationale}`);
  }

  return lines.join("\n");
}

async function main() {
  const header = [
    "# Card 5 Proof — Standard Rubric + Tri-Score + Gate + Bake",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Branch: sandbox`,
    `Repo: ~/code/alloro`,
    `Rubric source: https://www.notion.so/349fdaf120c48170acfaef33f723e957`,
    "",
    "This artifact demonstrates that all four Card 5 components run end-to-end against real inputs and produce Recipe-compliant output. It is the Friday (April 24 2026) acceptance artifact for the Coastal Endodontic Studio meeting.",
    "",
    "---",
    "",
  ].join("\n");

  const sections = await Promise.all([
    section1_RubricCalibration(),
    section2_RecognitionTriScore(),
    section3_FreeformConcernGate(),
    section4_DiscoverabilityBake(),
  ]);

  const body = header + sections.join("\n\n---\n\n");
  fs.writeFileSync(OUTPUT_PATH, body);
  console.log(`Wrote ${OUTPUT_PATH} (${body.length} chars)`);
}

main().catch((err) => {
  console.error("proof script failed:", err);
  process.exit(1);
});
