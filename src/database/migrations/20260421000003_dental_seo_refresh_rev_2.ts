import type { Knex } from "knex";

/**
 * Dental SEO Template — Refresh Revision 2
 *
 * Post-render feedback on top of rev_1:
 *  - Flip `text-gradient-brand` (gradient-painted highlight text) to
 *    `text-white` inside hero sections and `.bg-gradient-brand` sections —
 *    still unreadable on dark surfaces after rev_1's text-accent flip.
 *  - Darken the hero overlay from 0.75/0.55/0.85 → 0.88/0.78/0.95 for
 *    confident white-on-dark contrast.
 *  - Rewrite the Success page hero to a light surface (bg-white, dark text).
 *    Strips the background image + AI-IMAGE directive; flips text-white*
 *    classes inside back to text-gray-* equivalents.
 *
 * Safety: creates its own backup tables (suffix _r2) so rollback reverses
 * only this revision without disturbing rev_0 or rev_1 backups.
 *
 * Spec: plans/04212026-no-ticket-dental-seo-template-visual-refresh/spec.md
 * (see Revision Log → Rev 2)
 */

const BACKUP_TEMPLATES_R2 = "website_builder.templates_backup_20260421_r2";
const BACKUP_PAGES_R2 = "website_builder.template_pages_backup_20260421_r2";

const OLD_OVERLAY = "rgba(31,41,55,0.75), rgba(31,41,55,0.55), rgba(31,41,55,0.85)";
const NEW_OVERLAY = "rgba(31,41,55,0.88), rgba(31,41,55,0.78), rgba(31,41,55,0.95)";

const SUBPAGE_HERO_SIZE = "min-h-[360px] md:min-h-[440px]";
const HOMEPAGE_HERO_SIZE = "min-h-[440px] lg:min-h-[560px]";

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

/**
 * Flip `text-gradient-brand` to `text-white` inside any <section> that is
 * either a hero (identified by its new min-height class) or a
 * bg-gradient-brand section. Section tags are not nested in this template.
 */
function flipGradientTextInDarkSections(html: string): string {
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

    const newInner = isDark
      ? inner.replace(/\btext-gradient-brand\b/g, "text-white")
      : inner;

    segments.push(openTag);
    segments.push(newInner);
    segments.push("</section>");
    cursor = closeIdx + "</section>".length;
  }
  return segments.join("");
}

function darkenHeroOverlay(html: string): string {
  return html.split(OLD_OVERLAY).join(NEW_OVERLAY);
}

/**
 * Rewrite the Success page's section-success-hero from dark image surface
 * to a light surface:
 *  - Strip the leading AI-IMAGE comment
 *  - Replace the <section> opening tag: drop image-related classes + inline
 *    background-image style; add bg-white
 *  - Flip text-white(/X0) and text-ivory inside back to text-gray-*
 */
function rewriteSuccessHero(content: string): string {
  // 1. Strip AI-IMAGE comment at top (if any)
  let out = content.replace(/^\s*<!--\s*AI-IMAGE[\s\S]*?-->\s*/i, "");

  // 2. Rewrite the section opening tag
  //    Pattern: <section class="alloro-tpl-v1-release-section-success-hero ..." style="background-image:...">
  out = out.replace(
    /<section\s+class="(alloro-tpl-v1-release-section-success-hero[^"]*)"\s+style="background-image:[^"]*">/,
    () =>
      `<section class="alloro-tpl-v1-release-section-success-hero relative w-full min-h-[360px] md:min-h-[440px] flex items-center justify-center overflow-hidden py-12 md:py-16 bg-white text-center">`
  );

  // 3. Flip text colors inside (order matters: specific /X0 variants first,
  //    then base text-white and text-ivory).
  const flips: Array<[RegExp, string]> = [
    [/\btext-white\/95\b/g, "text-gray-800"],
    [/\btext-white\/90\b/g, "text-gray-800"],
    [/\btext-white\/80\b/g, "text-gray-700"],
    [/\btext-white\/70\b/g, "text-gray-600"],
    [/\btext-white\/60\b/g, "text-gray-500"],
    // After the /X0 variants are gone, base text-white is safe.
    [/\btext-white\b/g, "text-gray-900"],
    [/\btext-ivory\b/g, "text-gray-900"],
  ];
  for (const [find, repl] of flips) out = out.replace(find, repl);

  return out;
}

// ---------------------------------------------------------------------------
// Orchestration per markup chunk
// ---------------------------------------------------------------------------

function rewriteMarkup(html: string): string {
  let out = html;
  out = darkenHeroOverlay(out);
  out = flipGradientTextInDarkSections(out);
  return out;
}

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

  return sections.map((s) => {
    let content = rewriteMarkup(s.content);
    if (pageName === "Success" && s.name === "section-success-hero") {
      content = rewriteSuccessHero(content);
    }
    return { name: s.name, content };
  });
}

// ---------------------------------------------------------------------------
// Migration up/down
// ---------------------------------------------------------------------------

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
    BACKUP_TEMPLATES_R2,
    BACKUP_PAGES_R2,
  ]);
  if (guard.rows[0].t1 !== null || guard.rows[0].t2 !== null) {
    throw new Error(
      `Backup tables ${BACKUP_TEMPLATES_R2} / ${BACKUP_PAGES_R2} already exist. Drop them to re-run.`
    );
  }

  const template = await resolveTemplate(knex);
  if (!template) {
    console.log("[migration:dental_seo_refresh_rev_2] No dental template — skipping");
    return;
  }
  console.log(`[migration:dental_seo_refresh_rev_2] Target: "${template.name}" (${template.id})`);

  await knex.raw(
    `CREATE TABLE ${BACKUP_TEMPLATES_R2} AS SELECT * FROM website_builder.templates WHERE id = ?`,
    [template.id]
  );
  await knex.raw(
    `CREATE TABLE ${BACKUP_PAGES_R2} AS SELECT * FROM website_builder.template_pages WHERE template_id = ?`,
    [template.id]
  );
  console.log(`[migration:dental_seo_refresh_rev_2] Backups created`);

  // Template parts — no header/wrapper changes expected in rev 2,
  // but footer still gets the overlay/gradient-text pass for safety.
  const newWrapper = template.wrapper; // no-op
  const newHeader = rewriteMarkup(template.header);
  const newFooter = rewriteMarkup(template.footer);

  const pages = await knex("website_builder.template_pages")
    .where("template_id", template.id)
    .select("id", "name", "sections");

  const pageUpdates: { id: string; name: string; newSections: Section[] }[] = [];
  for (const p of pages) {
    const newSections = rewritePageSections(p.name, p.sections);
    pageUpdates.push({ id: p.id, name: p.name, newSections });
    console.log(`[migration:dental_seo_refresh_rev_2] Transformed "${p.name}"`);
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

  console.log("[migration:dental_seo_refresh_rev_2] Complete");
}

export async function down(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES_R2,
    BACKUP_PAGES_R2,
  ]);
  if (guard.rows[0].t1 === null || guard.rows[0].t2 === null) {
    throw new Error(`Cannot rollback rev_2: backup tables missing.`);
  }

  await knex.transaction(async (trx) => {
    await trx.raw(
      `UPDATE website_builder.templates tgt
       SET wrapper = src.wrapper, header = src.header, footer = src.footer, updated_at = src.updated_at
       FROM ${BACKUP_TEMPLATES_R2} src
       WHERE tgt.id = src.id`
    );
    await trx.raw(
      `UPDATE website_builder.template_pages tgt
       SET sections = src.sections, updated_at = src.updated_at
       FROM ${BACKUP_PAGES_R2} src
       WHERE tgt.id = src.id`
    );
  });

  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_PAGES_R2}`);
  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_TEMPLATES_R2}`);

  console.log("[migration:dental_seo_refresh_rev_2/down] Restored from backup; backup tables dropped");
}
