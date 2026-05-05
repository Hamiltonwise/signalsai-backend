import type { Knex } from "knex";

/**
 * Replace staff single_template with a layout mirroring the doctors
 * single page, adapted for staff's schema (only `role` custom field).
 *
 * Differences from doctors:
 *  - {{post.custom.title}} → {{post.custom.role}}
 *  - {{post.custom.alt_photo}} → {{post.featured_image}} (staff uses the
 *    standard featured image, not a separate alt_photo field)
 *  - Affiliations gallery block removed entirely
 *  - CTA text: "Meet Our Team" flavor instead of "Request an Appointment"
 */

const TEMPLATE_ID = "2d325d15-bcdb-4157-b983-3d7b21f72b82";

const SINGLE_TEMPLATE_HTML = `<article class="bg-white py-16 md:py-24 px-6 md:px-12 lg:px-20">
  <div class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[0.3fr_0.7fr] gap-12 lg:gap-20 items-start">

    <!-- Left: Photo -->
    <div class="flex flex-col items-center gap-8">
      {{if post.featured_image}}
      <img src="{{post.featured_image}}" alt="{{post.title}}" class="rounded-3xl shadow-xl w-full h-auto">
      {{endif}}
    </div>

    <!-- Right: Bio -->
    <div class="flex flex-col justify-start">
      <h1 class="font-serif text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-gray-900 md:mb-8">{{post.title}}</h1>
      {{if post.custom.role}}
      <h2 class="text-base md:text-lg lg:text-xl font-medium tracking-tight text-accent mb-6">{{post.custom.role}}</h2>
      {{endif}}
      <div class="font-sans text-base md:text-lg text-gray-600 leading-relaxed space-y-6">
        {{post.content}}
      </div>
      <div class="mt-10">
        <a href="/consultation" class="px-8 py-4 rounded-full font-medium transition-colors duration-200 flex items-center justify-center text-base md:text-lg bg-primary hover:bg-black text-white w-max">
          Request an Appointment
        </a>
      </div>
    </div>

  </div>
</article>`;

type Section = { name: string; content: string };

export async function up(knex: Knex): Promise<void> {
  const postType = await knex("website_builder.post_types")
    .where({ template_id: TEMPLATE_ID, slug: "staff" })
    .first<{ id: string }>();

  if (!postType) {
    console.log("[STAFF-MIRROR-DOCTORS] Staff post type not found — skipping");
    return;
  }

  const singleTemplate: Section[] = [
    { name: "single-post", content: SINGLE_TEMPLATE_HTML },
  ];

  await knex("website_builder.post_types")
    .where({ id: postType.id })
    .update({ single_template: JSON.stringify(singleTemplate) });

  console.log(
    `[STAFF-MIRROR-DOCTORS] Updated single_template to mirror doctors layout (${postType.id})`
  );
}

export async function down(_knex: Knex): Promise<void> {
  // Previous version is in migration 20260501200001
}
