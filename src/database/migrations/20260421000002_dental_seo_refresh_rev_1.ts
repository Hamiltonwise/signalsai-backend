import type { Knex } from "knex";

/**
 * Dental SEO Template — Refresh Revision 1
 *
 * Post-render feedback revisions applied on top of 20260421000001:
 *  - Reduce subpage hero min-height (560/680 → 360/440) and vertical padding
 *    (py-20/24 → py-12/16).
 *  - Reduce Homepage hero min-height (600/800 → 440/560).
 *  - Ensure every subpage hero section carries `text-center` (Contact had
 *    relied on section-level text-center which the rewrite dropped).
 *  - Flip `text-accent` to `text-white` inside hero and brand-gradient
 *    sections — the accent blue was unreadable on dark overlays.
 *  - Swap "slate-deep" color family to gray-800 (#1F2937) — wrapper utility
 *    values + hero overlay gradient stops + any residual bg-[#0F172A].
 *
 * Safety: creates its own backup tables (suffix _r1) so rollback reverses
 * only this revision without disturbing the original 20260421000001 backup.
 *
 * Spec: plans/04212026-no-ticket-dental-seo-template-visual-refresh/spec.md
 * (see Revision Log → Rev 1)
 */

const TEMPLATE_ID_QUERY_NAME_LIKE = "%dental%";

const BACKUP_TEMPLATES_R1 = "website_builder.templates_backup_20260421_r1";
const BACKUP_PAGES_R1 = "website_builder.template_pages_backup_20260421_r1";

// ---------------------------------------------------------------------------
// Transformations
// ---------------------------------------------------------------------------

const OLD_SUBPAGE_HERO_SIZE = "min-h-[560px] md:min-h-[680px]";
const NEW_SUBPAGE_HERO_SIZE = "min-h-[360px] md:min-h-[440px]";

const OLD_SUBPAGE_HERO_PADDING = "py-20 md:py-24";
const NEW_SUBPAGE_HERO_PADDING = "py-12 md:py-16";

const OLD_HOMEPAGE_HERO_SIZE = "min-h-[600px] lg:min-h-[800px]";
const NEW_HOMEPAGE_HERO_SIZE = "min-h-[440px] lg:min-h-[560px]";

/**
 * Find each <section> tag in the markup. For every tag whose classList
 * indicates a hero or brand-gradient dark-surface context, apply:
 *  - text-accent → text-white (within the section's inner HTML)
 *  - ensure text-center is on the section tag (hero only)
 */
function rewriteSections(html: string): string {
  let out = html;

  // Size + padding swaps (apply globally — these tokens are unique to hero chrome)
  out = out.split(OLD_SUBPAGE_HERO_SIZE).join(NEW_SUBPAGE_HERO_SIZE);
  out = out.split(OLD_HOMEPAGE_HERO_SIZE).join(NEW_HOMEPAGE_HERO_SIZE);

  // Overlay gradient color stops — only the slate-900 base rgba triplet is
  // unique enough to swap globally.
  out = out.replace(/rgba\(15,\s*23,\s*42,/g, "rgba(31,41,55,");

  // Residual explicit-hex class references
  out = out.split("bg-[#0F172A]").join("bg-[#1F2937]");
  out = out.split("bg-[#0f172a]").join("bg-[#1F2937]");

  // Per-section rewrites for text-center + text-accent flip
  out = out.replace(
    /<section\b([^>]*?)>/gi,
    (sectionTag) => rewriteSectionTag(sectionTag)
  );

  // text-accent → text-white inside hero/brand-gradient sections
  out = flipAccentInDarkSections(out);

  // Padding swap — do AFTER text-center rewrite because padding tokens are
  // also unique to hero chrome but safer to apply last.
  out = out.split(OLD_SUBPAGE_HERO_PADDING).join(NEW_SUBPAGE_HERO_PADDING);

  return out;
}

/**
 * Given a <section ...> opening tag string, return the tag with text-center
 * added when the tag carries a hero size class (either subpage or homepage
 * sized). Safe to call multiple times — idempotent via includes-check.
 */
function rewriteSectionTag(sectionTag: string): string {
  const hasHeroSize =
    sectionTag.includes(NEW_SUBPAGE_HERO_SIZE) ||
    sectionTag.includes(NEW_HOMEPAGE_HERO_SIZE);
  if (!hasHeroSize) return sectionTag;
  if (sectionTag.includes("text-center")) return sectionTag;
  // Append text-center to the class attribute
  return sectionTag.replace(
    /class="([^"]*)"/,
    (_m, cls) => `class="${cls} text-center"`
  );
}

/**
 * Walk each <section ...>...</section> block; if the section is a hero
 * (has the new subpage hero size or homepage hero size class) or a
 * bg-gradient-brand section, replace `text-accent` → `text-white` inside
 * its inner markup.
 */
function flipAccentInDarkSections(html: string): string {
  // Since <section> tags aren't nested in our template, a simple
  // greedy-but-lazy split works: find each section open, locate its
  // matching close, process inner, reassemble.
  const segments: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const openIdx = html.indexOf("<section", cursor);
    if (openIdx === -1) {
      segments.push(html.slice(cursor));
      break;
    }
    // push up to openIdx
    segments.push(html.slice(cursor, openIdx));

    const tagEnd = html.indexOf(">", openIdx);
    if (tagEnd === -1) {
      segments.push(html.slice(openIdx));
      break;
    }
    const openTag = html.slice(openIdx, tagEnd + 1);

    const closeIdx = html.indexOf("</section>", tagEnd + 1);
    if (closeIdx === -1) {
      segments.push(html.slice(openIdx));
      break;
    }
    const innerStart = tagEnd + 1;
    const innerEnd = closeIdx;
    const inner = html.slice(innerStart, innerEnd);

    const isDarkSurface =
      openTag.includes(NEW_SUBPAGE_HERO_SIZE) ||
      openTag.includes(NEW_HOMEPAGE_HERO_SIZE) ||
      /\bbg-gradient-brand\b/.test(openTag);

    const newInner = isDarkSurface
      ? inner.replace(/\btext-accent\b/g, "text-white")
      : inner;

    segments.push(openTag);
    segments.push(newInner);
    segments.push("</section>");

    cursor = closeIdx + "</section>".length;
  }
  return segments.join("");
}

// Wrapper — swap utility colors
function rewriteWrapper(html: string): string {
  let out = html;
  // Match only within our previously-added slate-deep block
  out = out.replace(
    /\.bg-slate-deep\s*\{\s*background-color:\s*#0F172A\s*!important;\s*color:\s*#F8FAFC;\s*\}/i,
    `.bg-slate-deep {\n      background-color: #1F2937 !important;\n      color: #F8FAFC;\n    }`
  );
  out = out.replace(
    /\.text-slate-deep\s*\{\s*color:\s*#0F172A;\s*\}/i,
    `.text-slate-deep { color: #1F2937; }`
  );
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveTemplate(
  knex: Knex
): Promise<{ id: string; wrapper: string; header: string; footer: string; name: string } | null> {
  let tmpl = await knex("website_builder.templates")
    .where("is_active", true)
    .first("id", "name", "wrapper", "header", "footer");
  if (tmpl) return tmpl;
  tmpl = await knex("website_builder.templates")
    .whereRaw("LOWER(name) LIKE ?", [TEMPLATE_ID_QUERY_NAME_LIKE])
    .orWhereRaw("LOWER(name) LIKE ?", ["%seo%"])
    .orderBy("created_at", "asc")
    .first("id", "name", "wrapper", "header", "footer");
  return tmpl ?? null;
}

interface Section {
  name: string;
  content: string;
}

function rewritePageSections(raw: unknown): Section[] {
  let sections: Section[];
  if (Array.isArray(raw)) sections = raw as Section[];
  else if (raw && typeof raw === "object" && Array.isArray((raw as { sections?: unknown }).sections))
    sections = (raw as { sections: Section[] }).sections;
  else throw new Error(`Unexpected sections shape: ${typeof raw}`);

  return sections.map((s) => ({
    name: s.name,
    content: rewriteSections(s.content),
  }));
}

// ---------------------------------------------------------------------------
// Migration up/down
// ---------------------------------------------------------------------------

export async function up(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES_R1,
    BACKUP_PAGES_R1,
  ]);
  if (guard.rows[0].t1 !== null || guard.rows[0].t2 !== null) {
    throw new Error(
      `Backup tables ${BACKUP_TEMPLATES_R1} / ${BACKUP_PAGES_R1} already exist. Drop them to re-run.`
    );
  }

  const template = await resolveTemplate(knex);
  if (!template) {
    console.log("[migration:dental_seo_refresh_rev_1] No dental template — skipping");
    return;
  }
  console.log(`[migration:dental_seo_refresh_rev_1] Target: "${template.name}" (${template.id})`);

  await knex.raw(
    `CREATE TABLE ${BACKUP_TEMPLATES_R1} AS SELECT * FROM website_builder.templates WHERE id = ?`,
    [template.id]
  );
  await knex.raw(
    `CREATE TABLE ${BACKUP_PAGES_R1} AS SELECT * FROM website_builder.template_pages WHERE template_id = ?`,
    [template.id]
  );
  console.log(`[migration:dental_seo_refresh_rev_1] Backups created`);

  const newWrapper = rewriteWrapper(template.wrapper);
  const newHeader = rewriteSections(template.header);
  const newFooter = rewriteSections(template.footer);

  const pages = await knex("website_builder.template_pages")
    .where("template_id", template.id)
    .select("id", "name", "sections");

  const pageUpdates: { id: string; name: string; newSections: Section[] }[] = [];
  for (const p of pages) {
    const newSections = rewritePageSections(p.sections);
    pageUpdates.push({ id: p.id, name: p.name, newSections });
    console.log(`[migration:dental_seo_refresh_rev_1] Transformed "${p.name}"`);
  }

  await knex.transaction(async (trx) => {
    await trx("website_builder.templates").where("id", template.id).update({
      wrapper: newWrapper,
      header: newHeader,
      footer: newFooter,
      updated_at: new Date(),
    });
    for (const u of pageUpdates) {
      await trx("website_builder.template_pages").where("id", u.id).update({
        sections: JSON.stringify(u.newSections),
        updated_at: new Date(),
      });
    }
  });

  console.log("[migration:dental_seo_refresh_rev_1] Complete");
}

export async function down(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES_R1,
    BACKUP_PAGES_R1,
  ]);
  if (guard.rows[0].t1 === null || guard.rows[0].t2 === null) {
    throw new Error(`Cannot rollback rev_1: backup tables missing.`);
  }

  await knex.transaction(async (trx) => {
    await trx.raw(
      `UPDATE website_builder.templates tgt
       SET wrapper = src.wrapper, header = src.header, footer = src.footer, updated_at = src.updated_at
       FROM ${BACKUP_TEMPLATES_R1} src
       WHERE tgt.id = src.id`
    );
    await trx.raw(
      `UPDATE website_builder.template_pages tgt
       SET sections = src.sections, updated_at = src.updated_at
       FROM ${BACKUP_PAGES_R1} src
       WHERE tgt.id = src.id`
    );
  });

  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_PAGES_R1}`);
  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_TEMPLATES_R1}`);

  console.log("[migration:dental_seo_refresh_rev_1/down] Restored from backup; backup tables dropped");
}
