import type { Knex } from "knex";

/**
 * Simplify staff single_template to match stripped schema (role only).
 *
 * Removes references to years_at_practice, certifications, education,
 * and fun_fact from the single-post section.
 */

const TEMPLATE_ID = "2d325d15-bcdb-4157-b983-3d7b21f72b82";

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

type Section = { name: string; content: string };

export async function up(knex: Knex): Promise<void> {
  const postType = await knex("website_builder.post_types")
    .where({ template_id: TEMPLATE_ID, slug: "staff" })
    .first<{ id: string; single_template: unknown }>();

  if (!postType) {
    console.log("[STAFF-SIMPLIFY] Staff post type not found — skipping");
    return;
  }

  const singleTemplate: Section[] = [
    { name: "single-post", content: SINGLE_TEMPLATE_HTML },
  ];

  await knex("website_builder.post_types")
    .where({ id: postType.id })
    .update({ single_template: JSON.stringify(singleTemplate) });

  console.log(`[STAFF-SIMPLIFY] Updated single_template for staff (${postType.id})`);
}

export async function down(_knex: Knex): Promise<void> {
  // No-op — the prior version is in migration 20260501200000
}
