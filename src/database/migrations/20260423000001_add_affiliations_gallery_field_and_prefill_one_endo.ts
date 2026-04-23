import type { Knex } from "knex";

/**
 * Three linked data changes on the dental SEO template:
 *
 *   1. Add an `affiliations` gallery field to the "Doctors" post-type schema
 *      on template 2d325d15-bcdb-4157-b983-3d7b21f72b82.
 *   2. Replace the hardcoded AAE + VDA affiliation block inside the doctors
 *      `single_template` with a gallery subloop that reads the new field.
 *   3. Prefill the `affiliations` value on the 8 One Endodontics doctor posts
 *      (project 0dcad678-...) so they continue to render both logos after
 *      the template swap.
 *
 * All three are idempotent and guarded by live-DB presence checks. The `down`
 * reverses each step.
 *
 * DEPLOY ORDER (required): the shortcode-resolver changes in both alloro and
 * website-builder-rebuild must be live BEFORE this migration runs. Otherwise
 * every rendered /doctors/<slug> page on the 7 projects using this template
 * will display `{{start_gallery_loop field='affiliations'}}` as literal text.
 */

const TEMPLATE_ID = "2d325d15-bcdb-4157-b983-3d7b21f72b82";
const DOCTORS_POST_TYPE_ID = "f9e028e1-d753-4257-9bb6-306f50322e2b";
const ONE_ENDO_PROJECT_ID = "0dcad678-2845-4c20-a298-e9c62aed9ebc";

const ONE_ENDO_DOCTOR_IDS = [
  "d9ebfc01-2698-43c1-85f3-805e9e22b273", // Dr. Ali Adil
  "3e7605ca-b4be-48de-8522-b142171042bf", // Dr. Eiman Khalili
  "f3f35bfa-a1c3-4554-b166-be139638a741", // Dr. Hashim Al-Hassany
  "7337246c-0390-4919-b016-2f5b5adad0bd", // Dr. James Lee
  "9635ce07-c599-4dcf-8b3d-96c1873d6589", // Dr. Maan Zuaitar
  "4681d152-a438-4413-b24b-9eedf5f87290", // Dr. Pei Wang
  "25ab7a3a-f9c4-4031-a279-3128174d6593", // Dr. Saif Kargoli
  "edfd3e5b-9dc6-4a79-bbe2-186e5e5a76a8", // Dr. Zied Diab
];

const AFFILIATIONS_SCHEMA_FIELD = {
  name: "Professional Affiliations",
  slug: "affiliations",
  type: "gallery",
  required: false,
  default_value: null,
} as const;

const AFFILIATIONS_SEED_VALUE = [
  {
    url: "https://alloro-main-bucket.s3.us-east-1.amazonaws.com/uploads/0dcad678-2845-4c20-a298-e9c62aed9ebc/7fb760c0-ABE_BoardCertifiedLogo_HIGH_RGB.webp.webp",
    link: "https://www.aae.org/board/about-the-abe/",
    alt: "American Board of Endodontics",
    caption: "",
  },
  {
    url: "https://alloro-main-bucket.s3.us-east-1.amazonaws.com/uploads/0dcad678-2845-4c20-a298-e9c62aed9ebc/88125724-VDA.webp.webp",
    link: "https://www.vadental.org/",
    alt: "Virginia Dental Association",
    caption: "",
  },
];

// Matches the outer affiliations wrapper div from open tag through its matching
// close. Relies on the current structure: one <p> label + one <div class="flex…">
// containing the two <a><img></a> items. Non-greedy; if the markup has been
// re-authored in a non-matching shape, the regex won't match and we'll log+skip
// rather than mangle.
const HARDCODED_AFFILIATIONS_RE =
  /<div class="w-full pt-6 border-t border-gray-100">[\s\S]*?<div class="flex[^"]*">[\s\S]*?<\/div>\s*<\/div>/;

const SUBLOOP_AFFILIATIONS_MARKUP = `{{if post.custom.affiliations}}
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

// The exact hardcoded markup we're replacing, captured verbatim from the live
// template at planning time. Used only by `down` to restore prior state.
const ORIGINAL_HARDCODED_AFFILIATIONS_MARKUP = `<div class="w-full pt-6 border-t border-gray-100">
        <p class="text-xs font-medium tracking-[0.18em] uppercase font-sans text-gray-400 text-center mb-5">Professional Affiliations</p>
        <div class="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center justify-center gap-5 lg:gap-4 xl:gap-8">
          <a href="https://www.aae.org/board/about-the-abe/" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center transition-all duration-300 hover:opacity-70 hover:scale-105">
            <img src="https://alloro-main-bucket.s3.us-east-1.amazonaws.com/uploads/0dcad678-2845-4c20-a298-e9c62aed9ebc/7fb760c0-ABE_BoardCertifiedLogo_HIGH_RGB.webp.webp" alt="American Board of Endodontics" class="h-14 w-auto object-contain">
          </a>
          <a href="https://www.vadental.org/" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center transition-all duration-300 hover:opacity-70 hover:scale-105">
            <img src="https://alloro-main-bucket.s3.us-east-1.amazonaws.com/uploads/0dcad678-2845-4c20-a298-e9c62aed9ebc/88125724-VDA.webp.webp" alt="Virginia Dental Association" class="h-14 w-auto object-contain">
          </a>
        </div>
      </div>`;

type SchemaField = {
  name: string;
  slug: string;
  type: string;
  required?: boolean;
  default_value?: unknown;
  options?: unknown;
};

type Section = { name: string; content: string };

export async function up(knex: Knex): Promise<void> {
  const postType = await knex("website_builder.post_types")
    .where({ id: DOCTORS_POST_TYPE_ID })
    .first<{ id: string; schema: unknown; single_template: unknown }>();

  if (!postType) {
    console.log(
      `[GALLERY-AFFILIATIONS] Doctors post type ${DOCTORS_POST_TYPE_ID} not found — skipping`
    );
    return;
  }

  // Step 1 — schema field
  const schema: SchemaField[] = parseJsonb<SchemaField[]>(postType.schema, []);
  if (schema.some((f) => f.slug === AFFILIATIONS_SCHEMA_FIELD.slug)) {
    console.log(`[GALLERY-AFFILIATIONS] Schema already has 'affiliations' — skipping Step 1`);
  } else {
    const nextSchema: SchemaField[] = [...schema, { ...AFFILIATIONS_SCHEMA_FIELD }];
    await knex("website_builder.post_types")
      .where({ id: DOCTORS_POST_TYPE_ID })
      .update({ schema: JSON.stringify(nextSchema) });
    console.log(`[GALLERY-AFFILIATIONS] Step 1 — added 'affiliations' gallery field to schema`);
  }

  // Step 2 — single_template markup rewrite
  const template: Section[] = parseJsonb<Section[]>(postType.single_template, []);
  const sectionIdx = template.findIndex((s) => s.name === "single-post");
  if (sectionIdx === -1) {
    console.log(
      `[GALLERY-AFFILIATIONS] No 'single-post' section in single_template — skipping Step 2`
    );
  } else {
    const currentContent = template[sectionIdx].content;
    if (currentContent.includes("{{start_gallery_loop field='affiliations'}}")) {
      console.log(`[GALLERY-AFFILIATIONS] Subloop already present in single_template — skipping Step 2`);
    } else if (!HARDCODED_AFFILIATIONS_RE.test(currentContent)) {
      console.warn(
        `[GALLERY-AFFILIATIONS] Hardcoded affiliations block not found in expected shape — Step 2 SKIPPED. ` +
          `Template has been re-authored; manual update required.`
      );
    } else {
      const nextContent = currentContent.replace(
        HARDCODED_AFFILIATIONS_RE,
        SUBLOOP_AFFILIATIONS_MARKUP
      );
      const nextTemplate = template.map((s, i) =>
        i === sectionIdx ? { ...s, content: nextContent } : s
      );
      await knex("website_builder.post_types")
        .where({ id: DOCTORS_POST_TYPE_ID })
        .update({ single_template: JSON.stringify(nextTemplate) });
      console.log(`[GALLERY-AFFILIATIONS] Step 2 — rewrote single_template to use gallery subloop`);
    }
  }

  // Step 3 — prefill 8 One Endodontics doctors
  let prefilled = 0;
  let skippedExisting = 0;
  let skippedMissing = 0;

  for (const doctorId of ONE_ENDO_DOCTOR_IDS) {
    const post = await knex("website_builder.posts")
      .where({
        id: doctorId,
        project_id: ONE_ENDO_PROJECT_ID,
        post_type_id: DOCTORS_POST_TYPE_ID,
      })
      .first<{ id: string; custom_fields: unknown }>();

    if (!post) {
      skippedMissing++;
      console.warn(`[GALLERY-AFFILIATIONS] Doctor ${doctorId} not found or moved — skipping`);
      continue;
    }

    const customFields = parseJsonb<Record<string, unknown>>(post.custom_fields, {});
    if ("affiliations" in customFields) {
      skippedExisting++;
      continue;
    }

    const nextCustomFields = {
      ...customFields,
      affiliations: AFFILIATIONS_SEED_VALUE,
    };
    await knex("website_builder.posts")
      .where({ id: doctorId })
      .update({ custom_fields: JSON.stringify(nextCustomFields) });
    prefilled++;
  }

  console.log(
    `[GALLERY-AFFILIATIONS] Step 3 — prefilled ${prefilled} doctor(s); ` +
      `${skippedExisting} already had affiliations; ${skippedMissing} missing`
  );
}

export async function down(knex: Knex): Promise<void> {
  // Step 3 reverse — remove `affiliations` from the 8 One Endo doctors' custom_fields
  for (const doctorId of ONE_ENDO_DOCTOR_IDS) {
    const post = await knex("website_builder.posts")
      .where({ id: doctorId })
      .first<{ id: string; custom_fields: unknown }>();
    if (!post) continue;
    const customFields = parseJsonb<Record<string, unknown>>(post.custom_fields, {});
    if (!("affiliations" in customFields)) continue;
    const { affiliations: _drop, ...rest } = customFields;
    await knex("website_builder.posts")
      .where({ id: doctorId })
      .update({ custom_fields: JSON.stringify(rest) });
  }

  // Step 2 reverse — restore the hardcoded affiliations block
  const postType = await knex("website_builder.post_types")
    .where({ id: DOCTORS_POST_TYPE_ID })
    .first<{ id: string; schema: unknown; single_template: unknown }>();
  if (!postType) return;

  const template: Section[] = parseJsonb<Section[]>(postType.single_template, []);
  const sectionIdx = template.findIndex((s) => s.name === "single-post");
  if (sectionIdx !== -1) {
    const currentContent = template[sectionIdx].content;
    if (currentContent.includes("{{start_gallery_loop field='affiliations'}}")) {
      const nextContent = currentContent.replace(
        SUBLOOP_AFFILIATIONS_MARKUP,
        ORIGINAL_HARDCODED_AFFILIATIONS_MARKUP
      );
      const nextTemplate = template.map((s, i) =>
        i === sectionIdx ? { ...s, content: nextContent } : s
      );
      await knex("website_builder.post_types")
        .where({ id: DOCTORS_POST_TYPE_ID })
        .update({ single_template: JSON.stringify(nextTemplate) });
    }
  }

  // Step 1 reverse — drop the `affiliations` schema field
  // Warn if any non-One-Endo posts on this template have authored `affiliations`
  // values — those values will be orphaned (still in JSONB, no admin UI surface).
  const authoredElsewhere = await knex("website_builder.posts")
    .where({ post_type_id: DOCTORS_POST_TYPE_ID })
    .whereNotIn("id", ONE_ENDO_DOCTOR_IDS)
    .whereRaw("custom_fields ? 'affiliations'")
    .count<{ count: string }[]>("* as count");
  const orphanCount = Number(authoredElsewhere[0]?.count ?? 0);
  if (orphanCount > 0) {
    console.warn(
      `[GALLERY-AFFILIATIONS] down() — ${orphanCount} non-One-Endo doctor post(s) have authored ` +
        `affiliations values. Those JSONB values are preserved but will no longer surface in the ` +
        `admin UI after the schema field is removed.`
    );
  }

  const schema: SchemaField[] = parseJsonb<SchemaField[]>(postType.schema, []);
  const nextSchema = schema.filter((f) => f.slug !== AFFILIATIONS_SCHEMA_FIELD.slug);
  if (nextSchema.length !== schema.length) {
    await knex("website_builder.post_types")
      .where({ id: DOCTORS_POST_TYPE_ID })
      .update({ schema: JSON.stringify(nextSchema) });
  }
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
