import type { Knex } from "knex";

/**
 * Clean up honeypot inputs, Alloro Protect badges, and form-handler scripts
 * that were accidentally baked into page section content and project wrappers
 * by the N8N headless rendering pipeline.
 *
 * Sections in the DB may be stored as either:
 *   - Bare array:   [{content: "..."}, ...]
 *   - Wrapped:      {"sections": [{content: "..."}, ...]}
 * This migration handles both formats.
 */

// ---------------------------------------------------------------------------
// Helper: builds SQL that cleans a regex pattern from every section's content
// field, handling both bare-array and wrapped-object JSONB formats.
// ---------------------------------------------------------------------------
function cleanSectionsSQL(pattern: string, likeFilter: string): string {
  return `
    UPDATE website_builder.pages
    SET sections = CASE
      -- Bare array format: [{content: "..."}, ...]
      WHEN jsonb_typeof(sections) = 'array' THEN (
        SELECT jsonb_agg(
          CASE
            WHEN elem->>'content' IS NOT NULL THEN
              jsonb_set(elem, '{content}', to_jsonb(
                regexp_replace(elem->>'content', '${pattern}', '', 'gi')
              ))
            ELSE elem
          END
        )
        FROM jsonb_array_elements(sections) AS elem
      )
      -- Wrapped object format: {"sections": [{content: "..."}, ...]}
      WHEN jsonb_typeof(sections) = 'object'
        AND jsonb_typeof(sections->'sections') = 'array' THEN
        jsonb_set(sections, '{sections}', (
          SELECT jsonb_agg(
            CASE
              WHEN elem->>'content' IS NOT NULL THEN
                jsonb_set(elem, '{content}', to_jsonb(
                  regexp_replace(elem->>'content', '${pattern}', '', 'gi')
                ))
              ELSE elem
            END
          )
          FROM jsonb_array_elements(sections->'sections') AS elem
        ))
      ELSE sections
    END
    WHERE sections IS NOT NULL
      AND sections::text LIKE '${likeFilter}';
  `;
}

export async function up(knex: Knex): Promise<void> {
  // 1. Clean baked-in honeypot inputs from page sections
  //    These are hidden inputs added by the form script at runtime,
  //    captured by N8N's headless browser and persisted into section HTML.
  await knex.raw(
    cleanSectionsSQL(
      '<input[^>]*name="website_url"[^>]*tabindex="-1"[^>]*>',
      '%website_url%tabindex%',
    ),
  );

  // 2. Clean baked-in Alloro Protect badge links from page sections
  await knex.raw(
    cleanSectionsSQL(
      '<a[^>]*href="https://getalloro\\.com/alloro-protect"[^>]*>[\\s\\S]*?</a>',
      '%getalloro.com/alloro-protect%',
    ),
  );

  // 3. Clean baked-in form-handler scripts from project wrappers
  await knex.raw(`
    UPDATE website_builder.projects
    SET wrapper = regexp_replace(
      wrapper,
      '<script data-alloro-form-handler>[\\s\\S]*?</script>',
      '',
      'gi'
    )
    WHERE wrapper IS NOT NULL
      AND wrapper LIKE '%data-alloro-form-handler%';
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // No rollback — this is a data cleanup migration.
  // The cleaned artifacts were junk accumulated by a bug.
}
