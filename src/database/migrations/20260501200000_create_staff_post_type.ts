import type { Knex } from "knex";

/**
 * Create "Staff" post type on the dental SEO template.
 *
 * Seeds:
 *  1. post_types row with a 5-field schema (role, years_at_practice,
 *     certifications, fun_fact, education) and a single_template for
 *     individual /staff/<slug> detail pages.
 *  2. post_blocks row "staff-grid" with a responsive card grid layout.
 *
 * Idempotent: skips if a post type with slug "staff" already exists on
 * the target template.
 */

const TEMPLATE_ID = "2d325d15-bcdb-4157-b983-3d7b21f72b82";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const STAFF_SCHEMA = [
  {
    name: "Role",
    slug: "role",
    type: "text",
    required: true,
    default_value: null,
  },
  {
    name: "Years at Practice",
    slug: "years_at_practice",
    type: "text",
    required: false,
    default_value: null,
  },
  {
    name: "Certifications",
    slug: "certifications",
    type: "text",
    required: false,
    default_value: null,
  },
  {
    name: "Fun Fact",
    slug: "fun_fact",
    type: "textarea",
    required: false,
    default_value: null,
  },
  {
    name: "Education",
    slug: "education",
    type: "text",
    required: false,
    default_value: null,
  },
];

// ---------------------------------------------------------------------------
// Single template — /staff/<slug> detail page
// ---------------------------------------------------------------------------

const SINGLE_TEMPLATE_HTML = `<!-- AI-IMAGE: staff-hero-bg | Staff detail page hero. Warm, approachable office or team setting.
       SEARCH KEYWORDS: dental office team, friendly dental staff, welcoming reception area, clinical team setting.
       REQUIREMENTS: Landscape, minimum 1920x800, professional quality, warm lighting.
       FALLBACK: Any welcoming dental office interior or team interaction photo.
       INSTRUCTION: Replace ONLY the url() value inside the section's background-image style; keep the linear-gradient overlay intact. Do not render this as an <img> element. -->
<section class="alloro-tpl-v1-release-section-hero relative w-full min-h-[400px] md:min-h-[480px] flex items-center justify-center overflow-hidden py-16 md:py-20 bg-center bg-cover bg-no-repeat text-ivory" style="background-image:linear-gradient(to bottom, rgba(15,23,42,0.75), rgba(15,23,42,0.55), rgba(15,23,42,0.85)), url('https://picsum.photos/1920/800?random=staff');">
  <div class="relative z-10 max-w-4xl mx-auto px-6 text-center">
    <h1 class="text-4xl md:text-5xl font-bold mb-3">{{post.title}}</h1>
    {{if post.custom.role}}
    <p class="text-lg md:text-xl text-white/80 font-medium">{{post.custom.role}}</p>
    {{endif}}
  </div>
</section>

<section class="alloro-tpl-v1-release-section-bio py-16 md:py-20 bg-white">
  <div class="max-w-5xl mx-auto px-6">
    <div class="flex flex-col lg:flex-row gap-10 lg:gap-14">
      {{if post.featured_image}}
      <div class="flex-shrink-0 w-full lg:w-[320px]">
        <img src="{{post.featured_image}}" alt="{{post.title}}" class="w-full h-auto rounded-2xl shadow-lg object-cover aspect-[3/4]">
        {{if post.custom.years_at_practice}}
        <div class="mt-4 text-center">
          <span class="inline-block px-4 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full">{{post.custom.years_at_practice}}</span>
        </div>
        {{endif}}
      </div>
      {{endif}}

      <div class="flex-1 min-w-0">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">About {{post.title}}</h2>
        {{if post.custom.role}}
        <p class="text-primary font-semibold text-lg mb-6">{{post.custom.role}}</p>
        {{endif}}

        <div class="prose prose-lg max-w-none text-gray-700 leading-relaxed">
          {{post.content}}
        </div>

        {{if post.custom.education}}
        <div class="mt-8 pt-6 border-t border-gray-100">
          <h3 class="text-sm font-semibold tracking-widest uppercase text-gray-400 mb-2">Education</h3>
          <p class="text-gray-700">{{post.custom.education}}</p>
        </div>
        {{endif}}

        {{if post.custom.certifications}}
        <div class="mt-6 pt-6 border-t border-gray-100">
          <h3 class="text-sm font-semibold tracking-widest uppercase text-gray-400 mb-2">Certifications</h3>
          <p class="text-gray-700">{{post.custom.certifications}}</p>
        </div>
        {{endif}}

        {{if post.custom.fun_fact}}
        <div class="mt-6 p-5 bg-gray-50 rounded-xl">
          <h3 class="text-sm font-semibold tracking-widest uppercase text-gray-400 mb-2">Fun Fact</h3>
          <p class="text-gray-700 italic">{{post.custom.fun_fact}}</p>
        </div>
        {{endif}}
      </div>
    </div>
  </div>
</section>

<!-- AI-CONTENT: cta-label | Choose label by business.category:
       - Endodontist / Endodontics → "Book Appointment"
       - Orthodontist / Orthodontics → "Schedule a Consultation"
       - Default / other dental → "Request a Consultation"
       Apply the same label consistently across header, body, and footer CTAs for this site. -->
<section class="alloro-tpl-v1-release-section-consultation bg-gradient-brand text-ivory py-16 md:py-20">
  <div class="max-w-3xl mx-auto px-6 text-center">
    <h2 class="text-3xl md:text-4xl font-bold mb-4">Ready to Meet Our Team?</h2>
    <p class="text-lg text-white/80 mb-8">We'd love to welcome you to our practice. Schedule a visit and experience the difference a great team makes.</p>
    <a href="/consultation" class="inline-block px-8 py-3.5 bg-white text-gray-900 font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">Request a Consultation</a>
  </div>
</section>`;

// ---------------------------------------------------------------------------
// Grid post block — staff card listing
// ---------------------------------------------------------------------------

const STAFF_GRID_HTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
  {{start_post_loop}}
  <a href="{{post.url}}" class="group block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
    {{if post.featured_image}}
    <div class="aspect-[3/4] overflow-hidden">
      <img src="{{post.featured_image}}" alt="{{post.title}}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy">
    </div>
    {{endif}}
    {{if_not post.featured_image}}
    <div class="aspect-[3/4] bg-gray-100 flex items-center justify-center">
      <svg class="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
    </div>
    {{endif}}
    <div class="p-5">
      <h3 class="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors duration-200">{{post.title}}</h3>
      {{if post.custom.role}}
      <p class="text-sm font-medium text-primary mt-1">{{post.custom.role}}</p>
      {{endif}}
      {{if post.excerpt}}
      <p class="text-sm text-gray-600 mt-3 line-clamp-2">{{post.excerpt}}</p>
      {{endif}}
    </div>
  </a>
  {{end_post_loop}}
</div>`;

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export async function up(knex: Knex): Promise<void> {
  const template = await knex("website_builder.templates")
    .where("id", TEMPLATE_ID)
    .first("id");

  if (!template) {
    console.log(
      `[STAFF-POST-TYPE] Template ${TEMPLATE_ID} not found — skipping`
    );
    return;
  }

  // Idempotent guard
  const existing = await knex("website_builder.post_types")
    .where({ template_id: TEMPLATE_ID, slug: "staff" })
    .first();
  if (existing) {
    console.log(
      `[STAFF-POST-TYPE] Post type "staff" already exists (${existing.id}) — skipping`
    );
    return;
  }

  // 1. Create the post type
  const singleTemplate = [{ name: "single-post", content: SINGLE_TEMPLATE_HTML }];

  const [postType] = await knex("website_builder.post_types")
    .insert({
      template_id: TEMPLATE_ID,
      name: "Staff",
      slug: "staff",
      description: "Non-clinical and support staff members — hygienists, coordinators, office managers, dental assistants.",
      schema: JSON.stringify(STAFF_SCHEMA),
      single_template: JSON.stringify(singleTemplate),
    })
    .returning("*");

  console.log(`[STAFF-POST-TYPE] Created post type "staff" (${postType.id})`);

  // 2. Create the grid post block
  const gridSections = [{ name: "grid", content: STAFF_GRID_HTML }];

  const [postBlock] = await knex("website_builder.post_blocks")
    .insert({
      template_id: TEMPLATE_ID,
      post_type_id: postType.id,
      name: "Staff Grid",
      slug: "staff-grid",
      description: "Responsive card grid for staff member listings.",
      sections: JSON.stringify(gridSections),
    })
    .returning("*");

  console.log(`[STAFF-POST-TYPE] Created post block "staff-grid" (${postBlock.id})`);
}

export async function down(knex: Knex): Promise<void> {
  // Delete post block first (FK on post_type_id)
  const deleted = await knex("website_builder.post_blocks")
    .where({ template_id: TEMPLATE_ID, slug: "staff-grid" })
    .del();
  console.log(`[STAFF-POST-TYPE] down — deleted ${deleted} post block(s)`);

  const deletedPt = await knex("website_builder.post_types")
    .where({ template_id: TEMPLATE_ID, slug: "staff" })
    .del();
  console.log(`[STAFF-POST-TYPE] down — deleted ${deletedPt} post type(s)`);
}
