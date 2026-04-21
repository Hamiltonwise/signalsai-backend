import type { Knex } from "knex";

/**
 * Dental SEO Template — Refresh Revision 5
 *
 * Comprehensive sweep closing out remaining dark-on-dark pairs. Prior revs
 * tackled one class at a time (text-accent, text-gradient-brand, text-primary);
 * this rev covers the last three cohorts together:
 *
 *   1. Arbitrary hex-value text/border classes inside hero + bg-gradient-brand
 *      sections (e.g. text-[#0d2d4a], border-[#0d2d4a], text-[#1a4a6e]).
 *   2. Matching border tokens (border-primary, border-accent, and their
 *      hover variants) inside the same dark sections — a text flip without
 *      the border flip leaves outline buttons dark-on-dark.
 *   3. Any element template-wide whose class combines bg-primary / bg-accent /
 *      bg-gradient-brand with a text-gray-* token — catches the Success
 *      "Back to Homepage" button (same root bug as the Rev 3 icon fix on
 *      a different element) and generalizes the fix.
 *
 * Spec: plans/04212026-no-ticket-dental-seo-template-visual-refresh/spec.md
 * (see Revision Log → Rev 5)
 */

const BACKUP_TEMPLATES_R5 = "website_builder.templates_backup_20260421_r5";
const BACKUP_PAGES_R5 = "website_builder.template_pages_backup_20260421_r5";

const SUBPAGE_HERO_SIZE = "min-h-[360px] md:min-h-[440px]";
const HOMEPAGE_HERO_SIZE = "min-h-[440px] lg:min-h-[560px]";

// Hex values known to be dark brand text/border colors in the template
const DARK_HEXES = [
  "0d2d4a",
  "1a4a6e",
  "1e4d6b",
  "2d4a5e",
  "232323",
  "273A84",
  "2675BF",
  "273a84",
  "2675bf",
];

// ---------------------------------------------------------------------------
// Section-scoped flips: inside hero + bg-gradient-brand sections
// ---------------------------------------------------------------------------

function flipDarkTokensInDarkSections(html: string): string {
  const segments: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const openIdx = html.indexOf("<section", cursor);
    if (openIdx === -1) {
      segments.push(html.slice(cursor));
      break;
    }
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
    const inner = html.slice(tagEnd + 1, closeIdx);

    const isDark =
      openTag.includes(SUBPAGE_HERO_SIZE) ||
      openTag.includes(HOMEPAGE_HERO_SIZE) ||
      /\bbg-gradient-brand\b/.test(openTag);

    let newInner = inner;
    if (isDark) {
      // Arbitrary hex variants — text-[#HEX] → text-white; border-[#HEX] → border-white/40
      for (const hex of DARK_HEXES) {
        newInner = newInner.replace(
          new RegExp(`\\btext-\\[#${hex}\\]`, "g"),
          "text-white"
        );
        newInner = newInner.replace(
          new RegExp(`\\bborder-\\[#${hex}\\]`, "g"),
          "border-white/40"
        );
      }

      // Bare border-primary / border-accent (and hover variants). Preserve
      // -subtle variants (they are light, not dark).
      newInner = newInner.replace(/\bhover:border-primary(?!-subtle)\b/g, "hover:border-white");
      newInner = newInner.replace(/\bborder-primary(?!-subtle)\b/g, "border-white/40");
      newInner = newInner.replace(/\bhover:border-accent(?!-subtle)\b/g, "hover:border-white");
      newInner = newInner.replace(/\bborder-accent(?!-subtle)\b/g, "border-white/40");
    }

    segments.push(openTag);
    segments.push(newInner);
    segments.push("</section>");
    cursor = closeIdx + "</section>".length;
  }
  return segments.join("");
}

// ---------------------------------------------------------------------------
// Template-wide rule: element with bg-primary/accent/gradient-brand + text-gray-*
// → flip its text-gray-* to text-white.
// ---------------------------------------------------------------------------

function restoreWhiteOnColoredBgElements(html: string): string {
  return html.replace(/class="([^"]*)"/g, (_m, cls) => {
    const hasColoredBg =
      /\bbg-primary(?!-subtle)\b/.test(cls) ||
      /\bbg-accent(?!-subtle)\b/.test(cls) ||
      /\bbg-gradient-brand\b/.test(cls);
    if (!hasColoredBg) return `class="${cls}"`;
    if (!/\btext-gray-\d+\b/.test(cls)) return `class="${cls}"`;
    const newCls = cls.replace(/\btext-gray-\d+\b/g, "text-white");
    return `class="${newCls}"`;
  });
}

function rewriteMarkup(html: string): string {
  let out = html;
  out = flipDarkTokensInDarkSections(out);
  out = restoreWhiteOnColoredBgElements(out);
  return out;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

interface Section {
  name: string;
  content: string;
}

function rewritePageSections(pageName: string, raw: unknown): Section[] {
  let sections: Section[];
  if (Array.isArray(raw)) sections = raw as Section[];
  else if (raw && typeof raw === "object" && Array.isArray((raw as { sections?: unknown }).sections))
    sections = (raw as { sections: Section[] }).sections;
  else throw new Error(`Unexpected sections shape for ${pageName}: ${typeof raw}`);

  return sections.map((s) => ({
    name: s.name,
    content: rewriteMarkup(s.content),
  }));
}

async function resolveTemplate(
  knex: Knex
): Promise<{ id: string; name: string; wrapper: string; header: string; footer: string } | null> {
  let tmpl = await knex("website_builder.templates")
    .where("is_active", true)
    .first("id", "name", "wrapper", "header", "footer");
  if (tmpl) return tmpl;
  tmpl = await knex("website_builder.templates")
    .whereRaw("LOWER(name) LIKE ?", ["%dental%"])
    .orWhereRaw("LOWER(name) LIKE ?", ["%seo%"])
    .orderBy("created_at", "asc")
    .first("id", "name", "wrapper", "header", "footer");
  return tmpl ?? null;
}

export async function up(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES_R5,
    BACKUP_PAGES_R5,
  ]);
  if (guard.rows[0].t1 !== null || guard.rows[0].t2 !== null) {
    throw new Error(
      `Backup tables ${BACKUP_TEMPLATES_R5} / ${BACKUP_PAGES_R5} already exist. Drop them to re-run.`
    );
  }

  const template = await resolveTemplate(knex);
  if (!template) {
    console.log("[migration:dental_seo_refresh_rev_5] No dental template — skipping");
    return;
  }
  console.log(`[migration:dental_seo_refresh_rev_5] Target: "${template.name}" (${template.id})`);

  await knex.raw(
    `CREATE TABLE ${BACKUP_TEMPLATES_R5} AS SELECT * FROM website_builder.templates WHERE id = ?`,
    [template.id]
  );
  await knex.raw(
    `CREATE TABLE ${BACKUP_PAGES_R5} AS SELECT * FROM website_builder.template_pages WHERE template_id = ?`,
    [template.id]
  );

  const newHeader = rewriteMarkup(template.header);
  const newFooter = rewriteMarkup(template.footer);

  const pages = await knex("website_builder.template_pages")
    .where("template_id", template.id)
    .select("id", "name", "sections");

  const pageUpdates: { id: string; name: string; newSections: Section[] }[] = [];
  for (const p of pages) {
    const newSections = rewritePageSections(p.name, p.sections);
    pageUpdates.push({ id: p.id, name: p.name, newSections });
    console.log(`[migration:dental_seo_refresh_rev_5] Transformed "${p.name}"`);
  }

  await knex.transaction(async (trx) => {
    await trx("website_builder.templates").where("id", template.id).update({
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

  console.log("[migration:dental_seo_refresh_rev_5] Complete");
}

export async function down(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES_R5,
    BACKUP_PAGES_R5,
  ]);
  if (guard.rows[0].t1 === null || guard.rows[0].t2 === null) {
    throw new Error(`Cannot rollback rev_5: backup tables missing.`);
  }

  await knex.transaction(async (trx) => {
    await trx.raw(
      `UPDATE website_builder.templates tgt
       SET header = src.header, footer = src.footer, updated_at = src.updated_at
       FROM ${BACKUP_TEMPLATES_R5} src
       WHERE tgt.id = src.id`
    );
    await trx.raw(
      `UPDATE website_builder.template_pages tgt
       SET sections = src.sections, updated_at = src.updated_at
       FROM ${BACKUP_PAGES_R5} src
       WHERE tgt.id = src.id`
    );
  });

  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_PAGES_R5}`);
  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_TEMPLATES_R5}`);

  console.log("[migration:dental_seo_refresh_rev_5/down] Restored from backup; backup tables dropped");
}
