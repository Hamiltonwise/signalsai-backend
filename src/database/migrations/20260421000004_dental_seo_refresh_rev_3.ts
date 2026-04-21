import type { Knex } from "knex";

/**
 * Dental SEO Template — Refresh Revision 3
 *
 * Two gaps from rev_2:
 *  - Homepage hero still had the original black rgba overlay
 *    (rgba(0,0,0,0.5)/0.3/0.6). Bump it to match the subpage heroes'
 *    gray-800 rgba at the new darker opacities.
 *  - Success hero checkmark SVG is nested inside a bg-primary circle; the
 *    Rev 2 light-mode flip turned its `text-white` into `text-gray-900`
 *    (gray checkmark on dark-brand circle = invisible). Restore text-white
 *    for that SVG specifically.
 *
 * Safety: own backup tables, suffix `_r3`.
 *
 * Spec: plans/04212026-no-ticket-dental-seo-template-visual-refresh/spec.md
 * (see Revision Log → Rev 3)
 */

const BACKUP_TEMPLATES_R3 = "website_builder.templates_backup_20260421_r3";
const BACKUP_PAGES_R3 = "website_builder.template_pages_backup_20260421_r3";

const HOMEPAGE_OLD_OVERLAY =
  "rgba(0,0,0,0.5), rgba(0,0,0,0.3), rgba(0,0,0,0.6)";
const HOMEPAGE_NEW_OVERLAY =
  "rgba(31,41,55,0.88), rgba(31,41,55,0.78), rgba(31,41,55,0.95)";

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

function darkenHomepageHero(content: string): string {
  return content.split(HOMEPAGE_OLD_OVERLAY).join(HOMEPAGE_NEW_OVERLAY);
}

/**
 * Restore `text-white` on the SVG inside the Success hero's bg-primary
 * icon circle. The pattern is:
 *   <div class="...alloro-tpl-v1-release-section-success-hero-component-icon...bg-primary...">
 *     <svg class="... text-gray-900 ...">
 * We surgically flip the SVG's text-gray-900 back to text-white.
 */
function fixSuccessIconContrast(content: string): string {
  return content.replace(
    /(<div\s+class="[^"]*alloro-tpl-v1-release-section-success-hero-component-icon[^"]*bg-primary[^"]*">\s*<svg\s+class="[^"]*)text-gray-900([^"]*")/,
    "$1text-white$2"
  );
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
    let content = s.content;
    if (pageName === "Homepage" && /hero/i.test(s.name)) {
      content = darkenHomepageHero(content);
    }
    if (pageName === "Success" && s.name === "section-success-hero") {
      content = fixSuccessIconContrast(content);
    }
    return { name: s.name, content };
  });
}

// ---------------------------------------------------------------------------
// Migration up/down
// ---------------------------------------------------------------------------

async function resolveTemplate(
  knex: Knex
): Promise<{ id: string; name: string } | null> {
  let tmpl = await knex("website_builder.templates").where("is_active", true).first("id", "name");
  if (tmpl) return tmpl;
  tmpl = await knex("website_builder.templates")
    .whereRaw("LOWER(name) LIKE ?", ["%dental%"])
    .orWhereRaw("LOWER(name) LIKE ?", ["%seo%"])
    .orderBy("created_at", "asc")
    .first("id", "name");
  return tmpl ?? null;
}

export async function up(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES_R3,
    BACKUP_PAGES_R3,
  ]);
  if (guard.rows[0].t1 !== null || guard.rows[0].t2 !== null) {
    throw new Error(
      `Backup tables ${BACKUP_TEMPLATES_R3} / ${BACKUP_PAGES_R3} already exist. Drop them to re-run.`
    );
  }

  const template = await resolveTemplate(knex);
  if (!template) {
    console.log("[migration:dental_seo_refresh_rev_3] No dental template — skipping");
    return;
  }
  console.log(`[migration:dental_seo_refresh_rev_3] Target: "${template.name}" (${template.id})`);

  await knex.raw(
    `CREATE TABLE ${BACKUP_TEMPLATES_R3} AS SELECT * FROM website_builder.templates WHERE id = ?`,
    [template.id]
  );
  await knex.raw(
    `CREATE TABLE ${BACKUP_PAGES_R3} AS SELECT * FROM website_builder.template_pages WHERE template_id = ?`,
    [template.id]
  );

  const pages = await knex("website_builder.template_pages")
    .where("template_id", template.id)
    .select("id", "name", "sections");

  const pageUpdates: { id: string; newSections: Section[] }[] = [];
  for (const p of pages) {
    if (p.name !== "Homepage" && p.name !== "Success") continue;
    const newSections = rewritePageSections(p.name, p.sections);
    pageUpdates.push({ id: p.id, newSections });
    console.log(`[migration:dental_seo_refresh_rev_3] Transformed "${p.name}"`);
  }

  await knex.transaction(async (trx) => {
    for (const u of pageUpdates) {
      await trx("website_builder.template_pages").where("id", u.id).update({
        sections: JSON.stringify(u.newSections),
        updated_at: new Date(),
      });
    }
  });

  console.log("[migration:dental_seo_refresh_rev_3] Complete");
}

export async function down(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES_R3,
    BACKUP_PAGES_R3,
  ]);
  if (guard.rows[0].t1 === null || guard.rows[0].t2 === null) {
    throw new Error(`Cannot rollback rev_3: backup tables missing.`);
  }

  await knex.transaction(async (trx) => {
    await trx.raw(
      `UPDATE website_builder.template_pages tgt
       SET sections = src.sections, updated_at = src.updated_at
       FROM ${BACKUP_PAGES_R3} src
       WHERE tgt.id = src.id`
    );
  });

  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_PAGES_R3}`);
  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_TEMPLATES_R3}`);

  console.log("[migration:dental_seo_refresh_rev_3/down] Restored from backup; backup tables dropped");
}
