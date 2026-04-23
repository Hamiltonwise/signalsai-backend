// -----------------------------------------------------------------------------
// Scaffold for: add_affiliations_gallery_field_and_prefill_one_endo
//
// This is a DATA migration (JSONB content updates). No DDL.
//
// The final committed file lives at:
//   src/database/migrations/<timestamp>_add_affiliations_gallery_field_and_prefill_one_endo.ts
// following the precedent of src/database/migrations/20260319000001_seed_dental_review_blocks.ts.
//
// DO NOT RUN this scaffold directly — it is a planning artifact only.
// Implementation is filled in during execution. See spec.md Task T8.
// -----------------------------------------------------------------------------

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
};

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

// TODO: fill during execution
exports.up = async function up(/* knex */) {
  // Step 1: add 'affiliations' gallery field to doctors post-type schema
  //   - idempotent: skip if slug 'affiliations' already exists in the schema array
  //
  // Step 2: rewrite single_template content for the 'single-post' section
  //   - locate the hardcoded <div class="w-full pt-6 border-t border-gray-100"> affiliations block
  //   - replace with the subloop shape documented in spec.md (Task T8, Step 2)
  //   - idempotent: skip if markup already contains "{{start_gallery_loop field='affiliations'}}"
  //
  // Step 3: prefill custom_fields.affiliations for the 8 One Endodontics doctors
  //   - UPDATE website_builder.posts SET custom_fields = custom_fields || jsonb_build_object('affiliations', $seed)
  //     WHERE id = ANY($ids) AND project_id = $one_endo AND NOT (custom_fields ? 'affiliations')
};

// TODO: fill during execution
exports.down = async function down(/* knex */) {
  // Reverse of up:
  //   - remove 'affiliations' key from the 8 One Endo doctors' custom_fields
  //   - restore the original hardcoded affiliations markup in single_template
  //   - remove the 'affiliations' schema entry from the doctors post-type schema
  //
  // If other posts on this template (or other templates that share this post type — none today)
  // have authored 'affiliations' values since the up ran, the down must refuse and log,
  // to avoid losing authored content.
};

// Exported constants so tests or other migrations can reference them without re-typing
module.exports.TEMPLATE_ID = TEMPLATE_ID;
module.exports.DOCTORS_POST_TYPE_ID = DOCTORS_POST_TYPE_ID;
module.exports.ONE_ENDO_PROJECT_ID = ONE_ENDO_PROJECT_ID;
module.exports.ONE_ENDO_DOCTOR_IDS = ONE_ENDO_DOCTOR_IDS;
module.exports.AFFILIATIONS_SCHEMA_FIELD = AFFILIATIONS_SCHEMA_FIELD;
module.exports.AFFILIATIONS_SEED_VALUE = AFFILIATIONS_SEED_VALUE;
