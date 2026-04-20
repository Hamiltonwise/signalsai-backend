/**
 * Audit Template Shortcodes
 *
 * Scans every row in `website_builder.templates` + `website_builder.template_pages`
 * and reports regions that look like they should be owned by a shortcode
 * but are missing both a shortcode token (`{{ post_block ... }}` etc.) and
 * an `<!-- ALLORO_SHORTCODE: <type> -->` marker.
 *
 * Heuristic only — output is a reviewable report, NOT applied changes.
 * Reviewer decides which candidates to accept.
 *
 * Usage:
 *   npx tsx scripts/debug-warmup/audit-template-shortcodes.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import * as cheerio from "cheerio";
import db from "../../src/database/connection";

const SHORTCODE_TYPES = [
  {
    type: "doctors",
    headingPattern: /doctors|meet the team|our team|providers|our specialists|staff/i,
    token: /\{\{\s*post_block\s+[^}]*items=['"][^'"]*['"]\s*\}\}/,
  },
  {
    type: "services",
    headingPattern: /services|treatments|procedures|what we offer|our care/i,
    token: /\{\{\s*post_block\s+[^}]*items=['"][^'"]*['"]\s*\}\}/,
  },
  {
    type: "reviews",
    headingPattern: /reviews|testimonials|what patients say|patient stories/i,
    token: /\{\{\s*review_block\s+[^}]*\}\}/,
  },
  {
    type: "locations",
    headingPattern: /locations|our offices|visit us/i,
    token: /\{\{\s*post_block\s+[^}]*items=['"][^'"]*['"]\s*\}\}/,
  },
];

const MARKER_RE = /<!--\s*ALLORO_SHORTCODE\s*:\s*[a-z_]+\s*-->/i;

interface Finding {
  source: string; // "template/<id>/<field>" or "template_page/<id>/sections[<idx>]"
  type: string;
  headingText: string;
  snippet: string;
}

function analyzeHtml(html: string, source: string): Finding[] {
  if (!html || typeof html !== "string") return [];
  const $ = cheerio.load(html, { xml: false }, false);
  const findings: Finding[] = [];

  $("section, div").each((_, el) => {
    const $el = $(el);
    const heading = $el.find("h1, h2, h3").first();
    if (!heading.length) return;
    const headingText = heading.text().trim();
    if (!headingText) return;

    // Only consider "thin" regions: heading + (optional subheading + CTA),
    // nothing card-shaped. Rough proxy: fewer than 3 grandchildren.
    const directChildren = $el.children();
    if (directChildren.length > 6) return;

    const inner = $el.html() || "";
    if (MARKER_RE.test(inner)) return; // already marked

    for (const rule of SHORTCODE_TYPES) {
      if (!rule.headingPattern.test(headingText)) continue;
      if (rule.token.test(inner)) return; // already has a shortcode
      findings.push({
        source,
        type: rule.type,
        headingText,
        snippet: inner.slice(0, 200).replace(/\s+/g, " ").trim(),
      });
      break;
    }
  });

  return findings;
}

(async () => {
  const templates = await db("website_builder.templates")
    .select("id", "name", "wrapper", "header", "footer");
  const templatePages = await db("website_builder.template_pages")
    .select("id", "template_id", "name", "sections");

  const findings: Finding[] = [];

  for (const t of templates) {
    for (const field of ["wrapper", "header", "footer"] as const) {
      const html = (t as any)[field];
      if (!html) continue;
      findings.push(
        ...analyzeHtml(html, `template[${t.name || t.id}]/${field}`),
      );
    }
  }

  for (const tp of templatePages) {
    const raw = tp.sections;
    const sections = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return [];
            }
          })()
        : Array.isArray(raw?.sections)
          ? raw.sections
          : [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const content = typeof s?.content === "string" ? s.content : "";
      if (!content) continue;
      findings.push(
        ...analyzeHtml(
          content,
          `template_page[${tp.name || tp.id}]/sections[${i}]:${s?.name || ""}`,
        ),
      );
    }
  }

  console.log(`\n# Template Shortcode Audit\n`);
  console.log(`templates scanned:      ${templates.length}`);
  console.log(`template_pages scanned: ${templatePages.length}`);
  console.log(`findings:               ${findings.length}\n`);

  if (findings.length === 0) {
    console.log("No missing markers detected. ✓");
  } else {
    console.log("Candidate regions (review and annotate by hand):\n");
    for (const f of findings) {
      console.log(`- [${f.type}] ${f.source}`);
      console.log(`    heading: "${f.headingText}"`);
      console.log(`    snippet: ${f.snippet}\n`);
    }
    console.log(
      "For each accepted candidate, insert `<!-- ALLORO_SHORTCODE: <type> -->` inside the region's body (directly under the heading/subheading, replacing any empty body or fabricated cards). Keep the heading and subheading intact.",
    );
  }

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
