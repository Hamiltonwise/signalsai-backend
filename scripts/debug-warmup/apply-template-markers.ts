/**
 * Apply ALLORO_SHORTCODE markers to the 5 reviewed target sections.
 *
 * Usage:
 *   Inspect only (default):
 *     npx tsx scripts/debug-warmup/apply-template-markers.ts
 *   Apply to DB:
 *     npx tsx scripts/debug-warmup/apply-template-markers.ts --apply
 *
 * Idempotent — re-running detects existing markers and skips.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import * as cheerio from "cheerio";
import db from "../../src/database/connection";

interface Target {
  templatePageName: string;
  sectionName: string;
  markerType: "doctors" | "services" | "reviews" | "locations" | "posts";
}

const TARGETS: Target[] = [
  { templatePageName: "Homepage", sectionName: "section-meet-our-team", markerType: "doctors" },
  { templatePageName: "Homepage", sectionName: "section-google-reviews", markerType: "reviews" },
  { templatePageName: "Homepage", sectionName: "section-testimonials", markerType: "reviews" },
  { templatePageName: "Testimonials", sectionName: "section-testimonials-grid", markerType: "reviews" },
  { templatePageName: "Single Location", sectionName: "section-location-services", markerType: "services" },
];

const MARKER_RE = /ALLORO_SHORTCODE\s*:\s*[a-z_]+/i;

/**
 * Place the marker at the most useful spot: as the last direct child of the
 * `<section>` root (if present) or of the outermost wrapper. Simple,
 * predictable, and survives all the current template variations. The LLM
 * reads this comment and knows the section is a shortcode region; the
 * normalizer sees it on the section root at page-gen time.
 */
function injectMarker(html: string, markerType: Target["markerType"]): string {
  if (!html || typeof html !== "string") return html;
  if (MARKER_RE.test(html)) return html; // already marked

  const $ = cheerio.load(html, { xml: false }, false);
  const marker = `<!-- ALLORO_SHORTCODE: ${markerType} -->`;

  const section = $("section").first();
  if (section.length > 0) {
    section.append(`\n  ${marker}\n`);
  } else {
    // No <section> — place at end of root
    const root = $.root().children().first();
    if (root.length > 0) {
      root.append(`\n  ${marker}\n`);
    } else {
      return `${html}\n${marker}`;
    }
  }

  return $.html() || html;
}

function normalizeSections(raw: unknown): Array<{ name: string; content: string }> {
  if (Array.isArray(raw)) return raw as any;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.sections)) return parsed.sections;
    } catch {
      return [];
    }
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as any).sections)) {
    return (raw as any).sections;
  }
  return [];
}

(async () => {
  const apply = process.argv.includes("--apply");
  console.log(`Mode: ${apply ? "APPLY (writes to DB)" : "INSPECT (dry run)"}\n`);

  let anyChanged = false;

  for (const target of TARGETS) {
    const pages = await db("website_builder.template_pages")
      .where("name", target.templatePageName)
      .select("id", "template_id", "name", "sections");

    if (pages.length === 0) {
      console.log(`✗ template_page "${target.templatePageName}" NOT FOUND`);
      continue;
    }

    for (const tp of pages) {
    const sections = normalizeSections(tp.sections);
    const idx = sections.findIndex((s) => s.name === target.sectionName);
    if (idx < 0) {
      console.log(
        `✗ ${target.templatePageName} (tpl ${tp.template_id.slice(0, 8)}) / ${target.sectionName} NOT FOUND in sections`,
      );
      continue;
    }

    const before = sections[idx].content || "";
    const alreadyMarked = MARKER_RE.test(before);
    const after = alreadyMarked ? before : injectMarker(before, target.markerType);
    const willChange = !alreadyMarked && after !== before;

    console.log(
      `${willChange ? "→" : alreadyMarked ? "✓" : "—"} ${target.templatePageName} (tpl ${tp.template_id.slice(0, 8)}) / ${target.sectionName}  (marker=${target.markerType})`,
    );
    if (alreadyMarked) {
      console.log(`    already marked, skipping`);
      continue;
    }
    if (!willChange) {
      console.log(`    injection produced identical output — skipping`);
      continue;
    }

    // Preview the injection (last 200 chars so you can see the comment landed)
    const tail = after.slice(Math.max(0, after.length - 260));
    console.log(`    tail preview:\n${tail.replace(/^/gm, "      ")}\n`);

    if (apply) {
      const updated = [...sections];
      updated[idx] = { ...sections[idx], content: after };
      const payload = { sections: updated };
      await db("website_builder.template_pages")
        .where("id", tp.id)
        .update({
          sections: JSON.stringify(payload),
          updated_at: db.fn.now(),
        });
      anyChanged = true;
      console.log(`    ✓ written to DB\n`);
    }
    }
  }

  console.log(
    apply
      ? anyChanged
        ? "\nDone. Re-run without --apply to verify idempotency."
        : "\nNo changes applied (all targets already marked)."
      : "\nDry run complete. Re-run with --apply to write changes.",
  );

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
