import type { Knex } from "knex";

/**
 * Affiliations gallery — fix linked-logo visibility + switch to 3-col grid.
 *
 * Problem 1 (visibility): the loop's `<a>` wrapper used
 *   class="flex items-center justify-center transition-all duration-300
 *          hover:opacity-70 hover:scale-105"
 * which, inside the outer flex-row parent, triggered a circular flex-basis
 * resolution around the img's `h-14 w-auto` (img can't resolve width without
 * a definite main-axis on the flex-container <a>, <a> can't resolve width
 * without a definite content size from the img). Browsers collapse the <a>
 * to 0px main-axis, making every linked logo invisible in flex-row viewports
 * while bare <img> items rendered fine (replaced elements don't hit the
 * nested-flex pass). Fixed by switching the <a> to `inline-block`.
 *
 * Problem 2 (layout): the responsive flex-col/row toggle was fragile at
 * breakpoints and didn't wrap when >2-3 logos were authored. Replaced with a
 * straight 3-column grid that naturally wraps onto new rows.
 *
 * Idempotent: skips if the new markup is already present; warns+skips if the
 * old subloop isn't found verbatim (template has been re-authored). Symmetric
 * `down` restores the previous subloop.
 */

const DOCTORS_POST_TYPE_ID = "f9e028e1-d753-4257-9bb6-306f50322e2b";

const OLD_SUBLOOP_AFFILIATIONS_MARKUP = `{{if post.custom.affiliations}}
      <div class="w-full pt-6 border-t border-gray-100">
        <p class="text-xs font-medium tracking-[0.18em] uppercase font-sans text-gray-400 text-center mb-5">Professional Affiliations</p>
        <div class="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center justify-center gap-5 lg:gap-4 xl:gap-8">
          {{start_gallery_loop field='affiliations'}}
            {{if item.link}}<a href="{{item.link}}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center transition-all duration-300 hover:opacity-70 hover:scale-105">{{endif}}
              <img src="{{item.url}}" alt="{{item.alt}}" class="h-14 w-auto object-contain">
            {{if item.link}}</a>{{endif}}
          {{end_gallery_loop}}
        </div>
      </div>
      {{endif}}`;

const NEW_SUBLOOP_AFFILIATIONS_MARKUP = `{{if post.custom.affiliations}}
      <div class="w-full pt-6 border-t border-gray-100">
        <p class="text-xs font-medium tracking-[0.18em] uppercase font-sans text-gray-400 text-center mb-5">Professional Affiliations</p>
        <div class="grid grid-cols-3 gap-5 lg:gap-4 xl:gap-8 place-items-center">
          {{start_gallery_loop field='affiliations'}}
            {{if item.link}}<a href="{{item.link}}" target="_blank" rel="noopener noreferrer" class="inline-block transition-all duration-300 hover:opacity-70 hover:scale-105">{{endif}}
              <img src="{{item.url}}" alt="{{item.alt}}" class="h-14 w-auto max-w-full object-contain">
            {{if item.link}}</a>{{endif}}
          {{end_gallery_loop}}
        </div>
      </div>
      {{endif}}`;

type Section = { name: string; content: string };

export async function up(knex: Knex): Promise<void> {
  const postType = await knex("website_builder.post_types")
    .where({ id: DOCTORS_POST_TYPE_ID })
    .first<{ id: string; single_template: unknown }>();

  if (!postType) {
    console.log(
      `[GALLERY-AFFILIATIONS-3COL] Doctors post type ${DOCTORS_POST_TYPE_ID} not found — skipping`,
    );
    return;
  }

  const template: Section[] = parseJsonb<Section[]>(
    postType.single_template,
    [],
  );
  const sectionIdx = template.findIndex((s) => s.name === "single-post");
  if (sectionIdx === -1) {
    console.log(
      `[GALLERY-AFFILIATIONS-3COL] No 'single-post' section in single_template — skipping`,
    );
    return;
  }

  const currentContent = template[sectionIdx].content;

  if (currentContent.includes(NEW_SUBLOOP_AFFILIATIONS_MARKUP)) {
    console.log(
      `[GALLERY-AFFILIATIONS-3COL] 3-col grid markup already present — skipping`,
    );
    return;
  }

  if (!currentContent.includes(OLD_SUBLOOP_AFFILIATIONS_MARKUP)) {
    console.warn(
      `[GALLERY-AFFILIATIONS-3COL] Old subloop markup not found in expected shape — ` +
        `template has been re-authored. Manual update required; SKIPPING.`,
    );
    return;
  }

  const nextContent = currentContent.replace(
    OLD_SUBLOOP_AFFILIATIONS_MARKUP,
    NEW_SUBLOOP_AFFILIATIONS_MARKUP,
  );
  const nextTemplate = template.map((s, i) =>
    i === sectionIdx ? { ...s, content: nextContent } : s,
  );
  await knex("website_builder.post_types")
    .where({ id: DOCTORS_POST_TYPE_ID })
    .update({ single_template: JSON.stringify(nextTemplate) });
  console.log(
    `[GALLERY-AFFILIATIONS-3COL] Replaced flex-row/col layout with 3-col grid; switched linked <a> to inline-block`,
  );
}

export async function down(knex: Knex): Promise<void> {
  const postType = await knex("website_builder.post_types")
    .where({ id: DOCTORS_POST_TYPE_ID })
    .first<{ id: string; single_template: unknown }>();
  if (!postType) return;

  const template: Section[] = parseJsonb<Section[]>(
    postType.single_template,
    [],
  );
  const sectionIdx = template.findIndex((s) => s.name === "single-post");
  if (sectionIdx === -1) return;

  const currentContent = template[sectionIdx].content;
  if (!currentContent.includes(NEW_SUBLOOP_AFFILIATIONS_MARKUP)) return;

  const nextContent = currentContent.replace(
    NEW_SUBLOOP_AFFILIATIONS_MARKUP,
    OLD_SUBLOOP_AFFILIATIONS_MARKUP,
  );
  const nextTemplate = template.map((s, i) =>
    i === sectionIdx ? { ...s, content: nextContent } : s,
  );
  await knex("website_builder.post_types")
    .where({ id: DOCTORS_POST_TYPE_ID })
    .update({ single_template: JSON.stringify(nextTemplate) });
  console.log(`[GALLERY-AFFILIATIONS-3COL] down — restored prior subloop`);
}

function parseJsonb<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}
