import type { Knex } from "knex";

/**
 * Page Creation Enhancements migration.
 *
 * Adds:
 *  - template_pages.dynamic_slots JSONB — per-template-page context slots
 *  - templates.layout_slots JSONB — layout-level slots (logo, socials, etc.)
 *  - projects gradient_* columns (mirrored to project_identity.brand)
 *  - projects layouts generation tracking columns
 *
 * Seeds:
 *  - dental SEO template pages with their specific dynamic_slots
 *  - dental SEO template with layout_slots
 *
 * Backfills layouts_generated_at for projects with existing wrappers so the
 * new "layouts must exist before pages" gate doesn't break live sites.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Slot storage columns
  await knex.raw(`
    ALTER TABLE website_builder.template_pages
      ADD COLUMN IF NOT EXISTS dynamic_slots JSONB DEFAULT NULL;
  `);

  await knex.raw(`
    ALTER TABLE website_builder.templates
      ADD COLUMN IF NOT EXISTS layout_slots JSONB DEFAULT NULL;
  `);

  // 2. Gradient columns on projects (mirrored to project_identity.brand)
  await knex.raw(`
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS gradient_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS gradient_from VARCHAR(255) DEFAULT NULL;
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS gradient_to VARCHAR(255) DEFAULT NULL;
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS gradient_direction VARCHAR(20) DEFAULT 'to-br';
  `);

  // 3. Layouts generation tracking
  await knex.raw(`
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS layouts_generated_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS layouts_generation_progress JSONB DEFAULT NULL;
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS layouts_generation_status VARCHAR(20) DEFAULT NULL;
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS layout_slot_values JSONB DEFAULT NULL;
  `);

  // 4. Backfill layouts_generated_at for projects with existing wrappers
  await knex.raw(`
    UPDATE website_builder.projects
      SET layouts_generated_at = updated_at
      WHERE wrapper IS NOT NULL
        AND length(wrapper) > 100
        AND layouts_generated_at IS NULL;
  `);

  // 5. Seed dental SEO template
  await seedDentalSeoTemplate(knex);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.projects
      DROP COLUMN IF EXISTS layout_slot_values,
      DROP COLUMN IF EXISTS layouts_generation_status,
      DROP COLUMN IF EXISTS layouts_generation_progress,
      DROP COLUMN IF EXISTS layouts_generated_at,
      DROP COLUMN IF EXISTS gradient_direction,
      DROP COLUMN IF EXISTS gradient_to,
      DROP COLUMN IF EXISTS gradient_from,
      DROP COLUMN IF EXISTS gradient_enabled;

    ALTER TABLE website_builder.templates
      DROP COLUMN IF EXISTS layout_slots;

    ALTER TABLE website_builder.template_pages
      DROP COLUMN IF EXISTS dynamic_slots;
  `);
}

// ---------------------------------------------------------------------------
// Seed data — dental SEO template
// ---------------------------------------------------------------------------

async function seedDentalSeoTemplate(knex: Knex): Promise<void> {
  // Locate the dental SEO template — prefer `is_active = true`, fall back to
  // any template whose name contains "dental" or "SEO".
  let template = await knex("website_builder.templates").where("is_active", true).first();
  if (!template) {
    template = await knex("website_builder.templates")
      .whereRaw("LOWER(name) LIKE ?", ["%dental%"])
      .orWhereRaw("LOWER(name) LIKE ?", ["%seo%"])
      .orderBy("created_at", "asc")
      .first();
  }

  if (!template) {
    console.log("[migration:page_creation_enhancements] No dental SEO template found — skipping seed");
    return;
  }

  console.log(
    `[migration:page_creation_enhancements] Seeding template "${template.name}" (id=${template.id})`,
  );

  // 1. Layout slots on the template
  await knex("website_builder.templates").where("id", template.id).update({
    layout_slots: JSON.stringify(LAYOUT_SLOTS_DENTAL_SEO),
  });

  // 2. Dynamic slots on each matching template page
  const templatePages = await knex("website_builder.template_pages")
    .where("template_id", template.id)
    .select("id", "name");

  for (const page of templatePages) {
    const slots = resolvePageSlots(page.name);
    if (!slots) continue;
    await knex("website_builder.template_pages").where("id", page.id).update({
      dynamic_slots: JSON.stringify(slots),
    });
    console.log(
      `[migration:page_creation_enhancements] Seeded slots for template page "${page.name}" (${slots.length} slots)`,
    );
  }
}

type SlotDef = {
  key: string;
  label: string;
  type: "text" | "url";
  description: string;
  placeholder?: string;
};

// ---------------------------------------------------------------------------
// Name matcher — maps each template page name to its slot definitions
// ---------------------------------------------------------------------------

function resolvePageSlots(name: string): SlotDef[] | null {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (normalized === "/" || normalized.includes("homepage") || normalized === "home") {
    return HOMEPAGE_SLOTS;
  }
  if (normalized.includes("about") || normalized.includes("ourstory") || normalized.includes("story")) {
    return ABOUT_SLOTS;
  }
  if (normalized.includes("insurance") || normalized.includes("financial") || normalized.includes("billing")) {
    return INSURANCE_SLOTS;
  }
  if (normalized.includes("emergency") || normalized.includes("urgent")) {
    return EMERGENCY_SLOTS;
  }
  if (normalized.includes("consult")) {
    return CONSULTATION_SLOTS;
  }
  if (normalized.includes("contact")) {
    return CONTACT_SLOTS;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Slot definitions (seeded into template_pages.dynamic_slots)
// ---------------------------------------------------------------------------

const HOMEPAGE_SLOTS: SlotDef[] = [
  {
    key: "certifications_credentials",
    type: "text",
    label: "Certifications & Credentials",
    description: "Board certifications, awards, memberships. Used in 'Why Choose Us'.",
    placeholder: "e.g., ADA member, Invisalign Diamond Provider, Board Certified in Endodontics",
  },
  {
    key: "unique_value_proposition",
    type: "text",
    label: "What Makes This Practice Unique",
    description: "1-2 sentences capturing the practice's differentiator. Used in hero and upgrade-smile.",
    placeholder: "The only dental practice in Austin offering same-day CEREC crowns...",
  },
  {
    key: "gallery_source_url",
    type: "url",
    label: "Gallery/Portfolio URL",
    description: "URL to scrape before/after or portfolio photos from. Used in the gallery section.",
    placeholder: "https://example.com/smile-gallery",
  },
  {
    key: "faq_focus_topics",
    type: "text",
    label: "FAQ Focus Topics",
    description: "Topics the FAQ should cover (e.g., insurance, first visit, pediatric care).",
    placeholder: "insurance, Invisalign pricing, pediatric comfort, new patient flow",
  },
];

const ABOUT_SLOTS: SlotDef[] = [
  {
    key: "practice_founding_story",
    type: "text",
    label: "Practice Founding Story",
    description: "How and why the practice was founded. Used in hero and values sections.",
  },
  {
    key: "practice_values",
    type: "text",
    label: "Core Practice Values",
    description: "3-5 core values or principles (e.g., patient-first, evidence-based, lifelong care).",
  },
];

const CONTACT_SLOTS: SlotDef[] = [
  {
    key: "parking_directions",
    type: "text",
    label: "Parking & Directions",
    description: "How to find and park at the office. Especially helpful in urban locations.",
  },
  {
    key: "insurance_accepted_list",
    type: "text",
    label: "Insurance Quick List",
    description: "Brief list of accepted insurance carriers for the contact page.",
  },
  {
    key: "new_patient_forms_url",
    type: "url",
    label: "New Patient Forms URL",
    description: "Link to downloadable new patient paperwork.",
  },
];

const CONSULTATION_SLOTS: SlotDef[] = [
  {
    key: "consultation_types",
    type: "text",
    label: "Consultation Types Offered",
    description: "e.g., Free 15-minute phone consult, in-person new patient exam, virtual consult.",
  },
  {
    key: "what_to_expect",
    type: "text",
    label: "What to Expect",
    description: "What happens during a consultation. Helps build patient confidence.",
  },
  {
    key: "consultation_form_fields",
    type: "text",
    label: "Custom Form Fields",
    description: "Additional fields needed beyond name/email/phone (e.g., preferred time, insurance).",
  },
];

const INSURANCE_SLOTS: SlotDef[] = [
  {
    key: "accepted_insurance_list",
    type: "text",
    label: "Accepted Insurance Plans",
    description: "Specific plans/carriers the practice is in-network or out-of-network with.",
  },
  {
    key: "payment_options",
    type: "text",
    label: "Payment & Financing Options",
    description: "Financing partners (CareCredit, Sunbit), in-house membership plans, payment methods.",
  },
  {
    key: "billing_policy",
    type: "text",
    label: "Billing Policy",
    description: "Payment due dates, deposit requirements, cancellation/no-show fees.",
  },
  {
    key: "cost_estimate_process",
    type: "text",
    label: "Cost Estimate Process",
    description: "How patients get a cost estimate before treatment (consultation, phone quote, etc.).",
  },
];

const EMERGENCY_SLOTS: SlotDef[] = [
  {
    key: "emergency_hours_policy",
    type: "text",
    label: "After-Hours Availability",
    description: "Is there an emergency line? After-hours coverage? On-call doctor?",
  },
  {
    key: "common_emergencies_handled",
    type: "text",
    label: "Emergencies Handled",
    description: "Specific situations the practice handles (knocked-out tooth, severe pain, broken crown).",
  },
  {
    key: "emergency_contact_details",
    type: "text",
    label: "Emergency Contact",
    description: "Emergency phone number or contact info if different from main office.",
  },
  {
    key: "first_aid_instructions",
    type: "text",
    label: "First-Aid Instructions",
    description: "Advice patients can follow while waiting for their emergency appointment.",
  },
];

// ---------------------------------------------------------------------------
// Layout slots — seeded on templates.layout_slots (one set per template)
// ---------------------------------------------------------------------------

const LAYOUT_SLOTS_DENTAL_SEO: SlotDef[] = [
  {
    key: "logo_url",
    type: "url",
    label: "Logo URL",
    description: "URL to the practice's logo image. Downloaded, stored in S3, used in the header.",
  },
  {
    key: "logo_alt_text",
    type: "text",
    label: "Logo Alt Text",
    description: "Alt text for the logo image (defaults to business name).",
  },
  {
    key: "social_links",
    type: "text",
    label: "Social Media Links",
    description: "One URL per line. Facebook, Instagram, LinkedIn, etc. Rendered as icon links in the footer.",
  },
  {
    key: "nav_cta_text",
    type: "text",
    label: "Nav CTA Button Text",
    description: "Text for the primary CTA in the header (default: 'Book Appointment').",
  },
  {
    key: "footer_service_areas",
    type: "text",
    label: "Service Areas",
    description: "Cities or regions served. Shown in the footer (e.g., 'Serving Austin, Round Rock, and Cedar Park').",
  },
  {
    key: "custom_footer_legal_text",
    type: "text",
    label: "Custom Legal/Disclaimer Text",
    description: "Any custom legal text beyond standard copyright (e.g., ADA disclaimer, HIPAA notice).",
  },
];
