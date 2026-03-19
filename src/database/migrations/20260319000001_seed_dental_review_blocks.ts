import type { Knex } from "knex";

/**
 * Seed the "Alloro Dental Template" with 3 default review block templates.
 * Idempotent: skips if blocks with the same slugs already exist.
 */

const TEMPLATE_NAME = "Alloro Dental Template";

const REVIEW_BLOCKS = [
  {
    name: "Review Grid",
    slug: "review-grid",
    description: "Responsive 3-column card grid with photo, name, stars, text, and date",
    sections: [
      {
        name: "grid",
        content: `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
{{start_review_loop}}
  <div class="bg-white rounded-xl shadow-md p-6 flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <img src="{{review.reviewer_photo}}" alt="{{review.reviewer_name}}" class="w-12 h-12 rounded-full object-cover bg-gray-200" onerror="this.style.display='none'" />
      <div>
        <p class="font-semibold text-gray-900 text-sm">{{review.reviewer_name}}</p>
        <p class="text-gray-400 text-xs">{{review.date}}</p>
      </div>
    </div>
    <div class="flex">{{review.stars_html}}</div>
    <p class="text-gray-600 text-sm leading-relaxed">{{review.text}}</p>
  </div>
{{end_review_loop}}
</div>`,
      },
    ],
  },
  {
    name: "Review Carousel",
    slug: "review-carousel",
    description: "Horizontal scroll carousel with snap scrolling review cards",
    sections: [
      {
        name: "carousel",
        content: `<div class="relative" data-review-carousel>
  <div class="relative overflow-hidden">
    <div class="flex transition-transform duration-500 ease-out" data-review-slider style="transform: translateX(0%);">
{{start_review_loop}}
      <div data-review-card class="flex-shrink-0 px-2 md:px-4" style="width: 33.3333%;">
        <div class="bg-white p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 relative flex flex-col h-full min-h-[320px]">
          <div class="absolute top-6 right-6 md:top-8 md:right-8">
            <svg viewBox="0 0 24 24" class="w-5 h-5 md:w-6 md:h-6" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.21-.19-.63z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          </div>
          <div class="flex items-center gap-4 mb-6">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center font-bold text-lg font-serif overflow-hidden">
              <img src="{{review.reviewer_photo}}" alt="{{review.reviewer_name}}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
              <span style="display:none">{{review.reviewer_name}}</span>
            </div>
            <div>
              <h4 class="font-bold text-base text-gray-900 font-sans">{{review.reviewer_name}}</h4>
              <p class="text-xs text-gray-400 font-sans">Google Review</p>
            </div>
          </div>
          <div class="flex text-yellow-400 text-sm mb-4">{{review.stars_html}}<span class="ml-2 text-blue-500 bg-blue-100 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">&#10003;</span></div>
          <p class="text-gray-600 text-sm md:text-base leading-relaxed font-sans flex-grow">"{{review.text}}"</p>
        </div>
      </div>
{{end_review_loop}}
    </div>
  </div>
  <div class="flex justify-center gap-3 mt-8">
    <button data-review-prev class="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors" aria-label="Previous reviews">
      <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
    </button>
    <button data-review-next class="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors" aria-label="Next reviews">
      <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
    </button>
  </div>
</div>
<script>
(function(){
  document.querySelectorAll('[data-review-carousel]').forEach(function(carousel){
    var slider = carousel.querySelector('[data-review-slider]');
    var cards = carousel.querySelectorAll('[data-review-card]');
    var prevBtn = carousel.querySelector('[data-review-prev]');
    var nextBtn = carousel.querySelector('[data-review-next]');
    if(!slider||!cards.length||!prevBtn||!nextBtn) return;
    var perPage = window.innerWidth < 768 ? 1 : 3;
    var current = 0;
    var maxIndex = Math.max(0, cards.length - perPage);
    function update(){
      slider.style.transform = 'translateX(-' + (current * (100/perPage)) + '%)';
    }
    prevBtn.addEventListener('click', function(){ if(current>0){current--;update();} });
    nextBtn.addEventListener('click', function(){ if(current<maxIndex){current++;update();} });
    window.addEventListener('resize', function(){
      perPage = window.innerWidth < 768 ? 1 : 3;
      maxIndex = Math.max(0, cards.length - perPage);
      if(current>maxIndex) current=maxIndex;
      update();
    });
  });
})();
</script>`,
      },
    ],
  },
  {
    name: "Compact Review List",
    slug: "review-list-compact",
    description: "Minimal vertical list for sidebars and footers",
    sections: [
      {
        name: "list",
        content: `<div class="flex flex-col divide-y divide-gray-100">
{{start_review_loop}}
  <div class="py-3 flex flex-col gap-1">
    <div class="flex items-center justify-between">
      <span class="font-medium text-sm text-gray-900">{{review.reviewer_name}}</span>
      <div class="flex">{{review.stars_html}}</div>
    </div>
    <p class="text-gray-500 text-xs leading-relaxed line-clamp-2">{{review.text}}</p>
  </div>
{{end_review_loop}}
</div>`,
      },
    ],
  },
];

export async function up(knex: Knex): Promise<void> {
  // Find the dental template
  const template = await knex("website_builder.templates")
    .where("name", TEMPLATE_NAME)
    .first();

  if (!template) {
    console.log(`[SEED] Template "${TEMPLATE_NAME}" not found — skipping review block seed`);
    return;
  }

  console.log(`[SEED] Seeding review blocks for template "${TEMPLATE_NAME}" (${template.id})`);

  for (const block of REVIEW_BLOCKS) {
    // Skip if slug already exists
    const existing = await knex("website_builder.review_blocks")
      .where({ template_id: template.id, slug: block.slug })
      .first();

    if (existing) {
      console.log(`[SEED] Review block "${block.slug}" already exists — skipping`);
      continue;
    }

    await knex("website_builder.review_blocks").insert({
      template_id: template.id,
      name: block.name,
      slug: block.slug,
      description: block.description,
      sections: JSON.stringify(block.sections),
    });

    console.log(`[SEED] Created review block "${block.slug}"`);
  }
}

export async function down(knex: Knex): Promise<void> {
  const template = await knex("website_builder.templates")
    .where("name", TEMPLATE_NAME)
    .first();

  if (!template) return;

  const slugs = REVIEW_BLOCKS.map((b) => b.slug);
  await knex("website_builder.review_blocks")
    .where("template_id", template.id)
    .whereIn("slug", slugs)
    .del();

  console.log(`[SEED] Removed seeded review blocks from "${TEMPLATE_NAME}"`);
}
