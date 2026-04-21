import type { Knex } from "knex";

/**
 * Dental SEO Template — Refresh Revision 4
 *
 * Third dark-text brand token surfaced: `text-primary` and `hover:text-primary`
 * used on highlighted words inside hero + bg-gradient-brand sections. Dark
 * navy (#273A84) on dark brand gradient = unreadable. Flip to text-white /
 * hover:text-white within those sections only; leave light-surface usages
 * untouched.
 *
 * Spec: plans/04212026-no-ticket-dental-seo-template-visual-refresh/spec.md
 * (see Revision Log → Rev 4)
 */

const BACKUP_TEMPLATES_R4 = "website_builder.templates_backup_20260421_r4";
const BACKUP_PAGES_R4 = "website_builder.template_pages_backup_20260421_r4";

const SUBPAGE_HERO_SIZE = "min-h-[360px] md:min-h-[440px]";
const HOMEPAGE_HERO_SIZE = "min-h-[440px] lg:min-h-[560px]";

function flipPrimaryTextInDarkSections(html: string): string {
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
      // Order matters: hover:text-primary first so we don't leave a dangling
      // hover: prefix. Also use negative lookahead so we don't touch
      // text-primary-subtle (different utility).
      newInner = newInner.replace(/\bhover:text-primary(?!-subtle)\b/g, "hover:text-white");
      newInner = newInner.replace(/\btext-primary(?!-subtle)\b/g, "text-white");
    }

    segments.push(openTag);
    segments.push(newInner);
    segments.push("</section>");
    cursor = closeIdx + "</section>".length;
  }
  return segments.join("");
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

  return sections.map((s) => ({
    name: s.name,
    content: flipPrimaryTextInDarkSections(s.content),
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
    BACKUP_TEMPLATES_R4,
    BACKUP_PAGES_R4,
  ]);
  if (guard.rows[0].t1 !== null || guard.rows[0].t2 !== null) {
    throw new Error(
      `Backup tables ${BACKUP_TEMPLATES_R4} / ${BACKUP_PAGES_R4} already exist. Drop them to re-run.`
    );
  }

  const template = await resolveTemplate(knex);
  if (!template) {
    console.log("[migration:dental_seo_refresh_rev_4] No dental template — skipping");
    return;
  }
  console.log(`[migration:dental_seo_refresh_rev_4] Target: "${template.name}" (${template.id})`);

  await knex.raw(
    `CREATE TABLE ${BACKUP_TEMPLATES_R4} AS SELECT * FROM website_builder.templates WHERE id = ?`,
    [template.id]
  );
  await knex.raw(
    `CREATE TABLE ${BACKUP_PAGES_R4} AS SELECT * FROM website_builder.template_pages WHERE template_id = ?`,
    [template.id]
  );

  const newHeader = flipPrimaryTextInDarkSections(template.header);
  const newFooter = flipPrimaryTextInDarkSections(template.footer);

  const pages = await knex("website_builder.template_pages")
    .where("template_id", template.id)
    .select("id", "name", "sections");

  const pageUpdates: { id: string; name: string; newSections: Section[] }[] = [];
  for (const p of pages) {
    const newSections = rewritePageSections(p.name, p.sections);
    pageUpdates.push({ id: p.id, name: p.name, newSections });
    console.log(`[migration:dental_seo_refresh_rev_4] Transformed "${p.name}"`);
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

  console.log("[migration:dental_seo_refresh_rev_4] Complete");
}

export async function down(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES_R4,
    BACKUP_PAGES_R4,
  ]);
  if (guard.rows[0].t1 === null || guard.rows[0].t2 === null) {
    throw new Error(`Cannot rollback rev_4: backup tables missing.`);
  }

  await knex.transaction(async (trx) => {
    await trx.raw(
      `UPDATE website_builder.templates tgt
       SET header = src.header, footer = src.footer, updated_at = src.updated_at
       FROM ${BACKUP_TEMPLATES_R4} src
       WHERE tgt.id = src.id`
    );
    await trx.raw(
      `UPDATE website_builder.template_pages tgt
       SET sections = src.sections, updated_at = src.updated_at
       FROM ${BACKUP_PAGES_R4} src
       WHERE tgt.id = src.id`
    );
  });

  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_PAGES_R4}`);
  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_TEMPLATES_R4}`);

  console.log("[migration:dental_seo_refresh_rev_4/down] Restored from backup; backup tables dropped");
}
