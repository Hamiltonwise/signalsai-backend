/**
 * Unpollute shortcode pill wrappers from website_builder.pages.sections.
 *
 * Background: commit e1b8b043 (2026-04-21) added a frontend `renderShortcodePlaceholders`
 * that wraps `{{ post_block … }}` / `{{ review_block … }}` / `{{ menu … }}`
 * (and `[post_block …]` / `[review_block …]`) tokens in a styled "pill" div
 * for the editor preview. The wrapper used `data-alloro-shortcode="<type>"`,
 * but the save-path restorer (`restoreShortcodeTokens`) only recognized
 * `data-alloro-shortcode-original`. Result: every page saved since the
 * commit has the pill wrapper persisted into `sections[].content`, which
 * leaks onto published sites as "DOCTORS BLOCK" / "SERVICES BLOCK" labels.
 *
 * This script walks every page's sections and strips those wrappers,
 * restoring the inner `{{ … }}` or `[…]` token.
 *
 * Default is dry-run. Pass `--apply` to actually write.
 *
 * Usage:
 *   npx tsx scripts/debug-warmup/unpollute-shortcode-pills.ts            # dry-run
 *   npx tsx scripts/debug-warmup/unpollute-shortcode-pills.ts --apply    # write
 */

import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import * as cheerio from "cheerio";
import db from "../../src/database/connection";

const APPLY = process.argv.includes("--apply");

interface Section {
  name: string;
  content: string;
}

interface PageRow {
  id: string;
  project_id: string;
  path: string;
  status: string;
  sections: unknown;
  updated_at: Date | string;
}

/**
 * Decode the escaped raw token text that renderShortcodePlaceholders wrote
 * inside the pill's inner div.
 */
function decodeTokenText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Strip every `<div data-alloro-shortcode="<type>" …>…</div>` pill from an
 * HTML fragment, restoring the raw `{{ … }}` or `[…]` token preserved
 * either in the `data-alloro-shortcode-original` attribute (post-fix pills)
 * or as visible text in the inner-most div (pre-fix pills).
 *
 * Runs until fixed-point so repeated saves that produced pill-inside-pill
 * nesting are fully flattened.
 */
function cleanSectionHtml(content: string): { html: string; changed: number } {
  if (!content.includes("data-alloro-shortcode")) {
    return { html: content, changed: 0 };
  }

  let current = content;
  let totalChanged = 0;

  // Fixed-point loop: each pass removes one layer of pill nesting.
  for (let pass = 0; pass < 8; pass++) {
    const $ = cheerio.load(current, { xmlMode: false }, false);
    const pills = $("[data-alloro-shortcode]");
    if (pills.length === 0) break;

    let passChanged = 0;
    pills.each((_i, el) => {
      const $el = $(el);

      // Prefer the attribute (post-fix pills carry it).
      const encodedAttr = $el.attr("data-alloro-shortcode-original");
      let token: string | null = null;

      if (encodedAttr) {
        token = encodedAttr
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&");
      } else {
        // Pre-fix pill: raw token sits as text in the second child div.
        // Pill structure from renderShortcodePlaceholders:
        //   <div data-alloro-shortcode="TYPE">
        //     <div>LABEL</div>
        //     <div>ESCAPED_RAW</div>
        //   </div>
        const children = $el.children("div");
        if (children.length >= 2) {
          const rawText = $(children[children.length - 1]).text();
          if (/^\s*(?:\{\{|\[)/.test(rawText)) {
            token = decodeTokenText(rawText).trim();
          }
        }
      }

      if (!token) {
        console.warn(
          `[unpollute] pill with no recoverable token — left as-is:\n  ${$.html(
            $el,
          ).slice(0, 200)}`,
        );
        return;
      }

      $el.replaceWith(token);
      passChanged++;
    });

    if (passChanged === 0) break;
    totalChanged += passChanged;
    current = $.root().html() ?? current;
  }

  return { html: current, changed: totalChanged };
}

function normalizeSections(raw: unknown): Section[] {
  if (Array.isArray(raw)) return raw as Section[];
  if (
    raw &&
    typeof raw === "object" &&
    "sections" in raw &&
    Array.isArray((raw as { sections: unknown }).sections)
  ) {
    return (raw as { sections: Section[] }).sections;
  }
  return [];
}

/**
 * Re-wrap cleaned sections in whatever shape the DB row originally used, so
 * we don't flip rows from `{sections: [...]}` → `[...]` (or vice-versa) as
 * a side-effect of the cleanup.
 */
function wrapLikeOriginal(original: unknown, cleaned: Section[]): unknown {
  if (
    original &&
    typeof original === "object" &&
    !Array.isArray(original) &&
    "sections" in original
  ) {
    return { ...(original as object), sections: cleaned };
  }
  return cleaned;
}

(async () => {
  const dbHost =
    process.env.DB_HOST ||
    process.env.DATABASE_URL ||
    "(unknown — check .env)";
  console.log(`[unpollute] DB target: ${dbHost}`);
  console.log(`[unpollute] Mode: ${APPLY ? "APPLY (writing)" : "DRY-RUN"}`);

  const rows: PageRow[] = await db("website_builder.pages").select(
    "id",
    "project_id",
    "path",
    "status",
    "sections",
    "updated_at",
  );

  console.log(`[unpollute] Scanned ${rows.length} page rows`);

  let pollutedPages = 0;
  let totalPillsStripped = 0;
  const sampleProjects = new Set<string>();

  for (const row of rows) {
    const sections = normalizeSections(row.sections);
    if (sections.length === 0) continue;

    let pageChanged = 0;
    const cleaned: Section[] = sections.map((s) => {
      if (!s || typeof s.content !== "string") return s;
      const result = cleanSectionHtml(s.content);
      pageChanged += result.changed;
      return result.changed > 0 ? { ...s, content: result.html } : s;
    });

    if (pageChanged === 0) continue;

    pollutedPages++;
    totalPillsStripped += pageChanged;
    if (sampleProjects.size < 10) sampleProjects.add(row.project_id);

    console.log(
      `[unpollute] ${row.project_id}  path=${row.path}  status=${row.status}  stripped=${pageChanged}`,
    );

    if (APPLY) {
      await db("website_builder.pages")
        .where({ id: row.id })
        .update({
          sections: JSON.stringify(wrapLikeOriginal(row.sections, cleaned)),
          updated_at: db.fn.now(),
        });
    }
  }

  console.log("");
  console.log(`[unpollute] Polluted pages: ${pollutedPages}`);
  console.log(`[unpollute] Pills stripped: ${totalPillsStripped}`);
  console.log(
    `[unpollute] Sample project ids: ${Array.from(sampleProjects).join(", ") || "(none)"}`,
  );
  if (!APPLY && pollutedPages > 0) {
    console.log("");
    console.log(
      "[unpollute] Dry-run only. Re-run with --apply to write changes.",
    );
  }

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
