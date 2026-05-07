import type { Knex } from "knex";

/**
 * Move article and compact-review shortcodes to API-backed pagination.
 *
 * Scope:
 * - Existing draft/published article pages using the fixed `articles-grid`
 *   limit.
 * - Template article pages so future generated pages use pagination.
 * - Existing draft/published pages using `review-list-compact`.
 * - The shared `review-list-compact` block template, removing its local
 *   hide/reveal load-more script so the renderer's API pagination owns loading.
 *
 * Rollback restores exact pre-migration rows from backup tables.
 */

const BACKUP_PAGES = "website_builder.pages_backup_20260507_shortcode_pagination";
const BACKUP_TEMPLATE_PAGES =
  "website_builder.template_pages_backup_20260507_shortcode_pagination";
const BACKUP_REVIEW_BLOCKS =
  "website_builder.review_blocks_backup_20260507_shortcode_pagination";

const OLD_ARTICLE_SHORTCODE =
  "{{ post_block id='articles-grid' items='articles' limit='12' }}";
const NEW_ARTICLE_SHORTCODE =
  "{{ post_block id='articles-grid' items='articles' paginate='load-more' per_page='9' limit='0' }}";

const OLD_REVIEW_LIST_SHORTCODE =
  "{{ review_block id='review-list-compact' location='primary' limit='200'}}";
const NEW_REVIEW_LIST_SHORTCODE =
  "{{ review_block id='review-list-compact' location='primary' paginate='load-more' per_page='6' limit='0' }}";

const REVIEW_LIST_COMPACT_SECTIONS = [
  {
    name: "list",
    content: `<div class="flex flex-col divide-y divide-gray-100">
{{start_review_loop}}
  <div class="py-4 flex flex-col gap-2">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0 overflow-hidden" style="background:linear-gradient(135deg,#3b82f6,#9333ea);">
          <img src="{{review.reviewer_photo}}" alt="{{review.reviewer_name}}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
          <span style="display:none;">{{review.reviewer_name}}</span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-sm text-gray-900 font-sans">{{review.reviewer_name}}</span>
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style="background:rgba(22,163,74,0.08);color:#16a34a;">
              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
              Verified
            </span>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <div class="flex text-yellow-400 text-xs">{{review.stars_html}}</div>
            <span class="text-gray-400 text-[10px] font-sans">{{review.date}}</span>
          </div>
        </div>
      </div>
      <div class="flex-shrink-0">
        <svg viewBox="0 0 24 24" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.21-.19-.63z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      </div>
    </div>
    <p class="text-gray-600 text-xs leading-relaxed font-sans pl-12">{{review.text}}</p>
  </div>
{{end_review_loop}}
</div>`,
  },
];

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type Replacement = {
  from: string;
  to: string;
};

function replaceInJson(value: JsonValue, replacements: Replacement[]): {
  value: JsonValue;
  count: number;
} {
  if (typeof value === "string") {
    let next = value;
    let count = 0;
    for (const replacement of replacements) {
      const pieces = next.split(replacement.from);
      if (pieces.length > 1) {
        count += pieces.length - 1;
        next = pieces.join(replacement.to);
      }
    }
    return { value: next, count };
  }

  if (Array.isArray(value)) {
    let count = 0;
    const next = value.map((item) => {
      const result = replaceInJson(item, replacements);
      count += result.count;
      return result.value;
    });
    return { value: next, count };
  }

  if (value && typeof value === "object") {
    let count = 0;
    const next: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value)) {
      const result = replaceInJson(item, replacements);
      count += result.count;
      next[key] = result.value;
    }
    return { value: next, count };
  }

  return { value, count: 0 };
}

async function ensureBackupTablesDoNotExist(knex: Knex): Promise<void> {
  const guard = await knex.raw(
    `SELECT to_regclass(?) AS pages, to_regclass(?) AS template_pages, to_regclass(?) AS review_blocks`,
    [BACKUP_PAGES, BACKUP_TEMPLATE_PAGES, BACKUP_REVIEW_BLOCKS]
  );
  const row = guard.rows[0];
  if (row.pages || row.template_pages || row.review_blocks) {
    throw new Error("Shortcode pagination backup table already exists.");
  }
}

async function ensureBackupTablesExist(knex: Knex): Promise<void> {
  const guard = await knex.raw(
    `SELECT to_regclass(?) AS pages, to_regclass(?) AS template_pages, to_regclass(?) AS review_blocks`,
    [BACKUP_PAGES, BACKUP_TEMPLATE_PAGES, BACKUP_REVIEW_BLOCKS]
  );
  const row = guard.rows[0];
  if (!row.pages || !row.template_pages || !row.review_blocks) {
    throw new Error("Cannot roll back shortcode pagination migration: backup table missing.");
  }
}

async function createBackupTables(trx: Knex.Transaction): Promise<void> {
  await trx.raw(`CREATE TABLE ${BACKUP_PAGES} AS SELECT * FROM website_builder.pages WHERE false`);
  await trx.raw(
    `CREATE TABLE ${BACKUP_TEMPLATE_PAGES} AS SELECT * FROM website_builder.template_pages WHERE false`
  );
  await trx.raw(
    `CREATE TABLE ${BACKUP_REVIEW_BLOCKS} AS SELECT * FROM website_builder.review_blocks WHERE false`
  );
}

async function backupRows(
  trx: Knex.Transaction,
  table: string,
  backupTable: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  await trx.raw(`INSERT INTO ${backupTable} SELECT * FROM ${table} WHERE id = ANY(?::uuid[])`, [
    ids,
  ]);
}

async function updateJsonRows(
  trx: Knex.Transaction,
  table: string,
  rows: Array<{ id: string; sections: JsonValue }>,
  replacements: Replacement[]
): Promise<number> {
  let replacementCount = 0;

  for (const row of rows) {
    const result = replaceInJson(row.sections, replacements);
    if (result.count === 0) {
      throw new Error(`Expected shortcode replacement in ${table} row ${row.id}.`);
    }
    replacementCount += result.count;
    await trx(table).where("id", row.id).update({
      sections: JSON.stringify(result.value),
      updated_at: new Date(),
    });
  }

  return replacementCount;
}

export async function up(knex: Knex): Promise<void> {
  await ensureBackupTablesDoNotExist(knex);

  const pageRows = await knex("website_builder.pages")
    .whereIn("status", ["draft", "published"])
    .andWhere((qb) => {
      qb.whereRaw("sections::text LIKE ?", [`%${OLD_ARTICLE_SHORTCODE}%`])
        .orWhereRaw("sections::text LIKE ?", [`%${OLD_REVIEW_LIST_SHORTCODE}%`]);
    })
    .select("id", "sections");

  const templatePageRows = await knex("website_builder.template_pages")
    .whereRaw("sections::text LIKE ?", [`%${OLD_ARTICLE_SHORTCODE}%`])
    .select("id", "sections");

  const reviewBlockRows = await knex("website_builder.review_blocks")
    .where("slug", "review-list-compact")
    .andWhere((qb) => {
      qb.whereRaw("sections::text LIKE ?", ["%review-load-more%"])
        .orWhereRaw("sections::text LIKE ?", ["%review-item.visible%"]);
    })
    .select("id");

  await knex.transaction(async (trx) => {
    await createBackupTables(trx);
    await backupRows(
      trx,
      "website_builder.pages",
      BACKUP_PAGES,
      pageRows.map((row) => row.id)
    );
    await backupRows(
      trx,
      "website_builder.template_pages",
      BACKUP_TEMPLATE_PAGES,
      templatePageRows.map((row) => row.id)
    );
    await backupRows(
      trx,
      "website_builder.review_blocks",
      BACKUP_REVIEW_BLOCKS,
      reviewBlockRows.map((row) => row.id)
    );

    const pageReplacementCount = await updateJsonRows(
      trx,
      "website_builder.pages",
      pageRows,
      [
        { from: OLD_ARTICLE_SHORTCODE, to: NEW_ARTICLE_SHORTCODE },
        { from: OLD_REVIEW_LIST_SHORTCODE, to: NEW_REVIEW_LIST_SHORTCODE },
      ]
    );
    const templateReplacementCount = await updateJsonRows(
      trx,
      "website_builder.template_pages",
      templatePageRows,
      [{ from: OLD_ARTICLE_SHORTCODE, to: NEW_ARTICLE_SHORTCODE }]
    );

    for (const row of reviewBlockRows) {
      await trx("website_builder.review_blocks").where("id", row.id).update({
        sections: JSON.stringify(REVIEW_LIST_COMPACT_SECTIONS),
        updated_at: new Date(),
      });
    }

    console.log(
      `[shortcode-pagination] Updated ${pageRows.length} pages (${pageReplacementCount} shortcode replacements), ` +
        `${templatePageRows.length} template pages (${templateReplacementCount} shortcode replacements), ` +
        `${reviewBlockRows.length} review blocks.`
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await ensureBackupTablesExist(knex);

  await knex.transaction(async (trx) => {
    await trx.raw(
      `UPDATE website_builder.pages target
       SET sections = backup.sections, updated_at = backup.updated_at
       FROM ${BACKUP_PAGES} backup
       WHERE target.id = backup.id`
    );
    await trx.raw(
      `UPDATE website_builder.template_pages target
       SET sections = backup.sections, updated_at = backup.updated_at
       FROM ${BACKUP_TEMPLATE_PAGES} backup
       WHERE target.id = backup.id`
    );
    await trx.raw(
      `UPDATE website_builder.review_blocks target
       SET sections = backup.sections, updated_at = backup.updated_at
       FROM ${BACKUP_REVIEW_BLOCKS} backup
       WHERE target.id = backup.id`
    );

    await trx.raw(`DROP TABLE IF EXISTS ${BACKUP_REVIEW_BLOCKS}`);
    await trx.raw(`DROP TABLE IF EXISTS ${BACKUP_TEMPLATE_PAGES}`);
    await trx.raw(`DROP TABLE IF EXISTS ${BACKUP_PAGES}`);
  });

  console.log("[shortcode-pagination/down] Restored pages, template pages, and review blocks.");
}
