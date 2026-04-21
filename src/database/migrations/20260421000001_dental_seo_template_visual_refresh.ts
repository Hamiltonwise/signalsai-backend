import type { Knex } from "knex";

/**
 * Dental SEO Template — Visual Refresh
 *
 * Rewrites the "Alloro Dental Template" template row + its 17 template_pages
 * section JSONB to:
 *  - Unify all subpage heroes on a single background-image pattern with
 *    consistent min-height and a slate-deep overlay.
 *  - Replace non-hero pastel gradients with the global .bg-gradient-brand class.
 *  - Strip inline style="" attributes in favor of Tailwind utilities.
 *  - Split the footer: keep bg-primary on the locations strip; flip the main
 *    <footer> to .bg-slate-deep.
 *  - Add an explicit "plot ALL locations + auto-center" AI instruction to the
 *    footer map block.
 *  - Replace hardcoded CTA labels with an AI-CONTENT directive that branches
 *    on business.category (endo → Book Appointment, ortho → Schedule a
 *    Consultation, else Request a Consultation).
 *  - Normalize the Single Location page's malformed {sections:[...]} wrapper
 *    to a plain array.
 *
 * Safety:
 *  - Snapshots full rows of the target template + its pages into backup
 *    tables (templates_backup_20260421, template_pages_backup_20260421)
 *    BEFORE any update. down() restores from those tables and drops them.
 *  - Idempotency guard: aborts if either backup table already exists.
 *  - All updates run inside a single transaction.
 *
 * Spec: plans/04212026-no-ticket-dental-seo-template-visual-refresh/spec.md
 */

const BACKUP_TEMPLATES = "website_builder.templates_backup_20260421";
const BACKUP_PAGES = "website_builder.template_pages_backup_20260421";

// ---------------------------------------------------------------------------
// Constants — new markup chrome
// ---------------------------------------------------------------------------

const SUBPAGE_HERO_SIZE_CLASSES =
  "relative w-full min-h-[560px] md:min-h-[680px] flex items-center justify-center overflow-hidden py-20 md:py-24";

const HERO_OVERLAY_GRADIENT =
  "linear-gradient(to bottom, rgba(15,23,42,0.75), rgba(15,23,42,0.55), rgba(15,23,42,0.85))";

const CTA_DIRECTIVE_COMMENT = `<!-- AI-CONTENT: cta-label | Choose label by business.category:
       - Endodontist / Endodontics → "Book Appointment"
       - Orthodontist / Orthodontics → "Schedule a Consultation"
       - Default / other dental → "Request a Consultation"
       Apply the same label consistently across header, body, and footer CTAs for this site. -->`;

const CTA_PLACEHOLDER_TEXT = "Request a Consultation";

// ---------------------------------------------------------------------------
// Per-page hero AI-IMAGE directives
// ---------------------------------------------------------------------------

interface HeroImageSpec {
  slotKey: string;
  description: string;
  searchKeywords: string;
  requirements: string;
  fallback: string;
  placeholderUrl: string;
}

const HERO_IMAGE_SPECS: Record<string, HeroImageSpec> = {
  Homepage: {
    slotKey: "hero-bg",
    description: "Main homepage hero image. Wide, warm photo capturing the practice personality.",
    searchKeywords: "dental clinic hero image, patient smiling, modern dental office wide shot, welcoming reception",
    requirements: "Landscape, minimum 1920x1080, professional quality, warm lighting.",
    fallback: "Any wide clinic/office interior photo or smiling patient photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=10",
  },
  "About Us": {
    slotKey: "about-hero-bg",
    description: "About page hero. Team or office-wide shot that conveys warmth and professionalism.",
    searchKeywords: "dental team group photo, dental office interior wide shot, practice team portrait",
    requirements: "Landscape, minimum 1920x1080, professional quality.",
    fallback: "Any wide interior dental office photo or team photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=40",
  },
  Services: {
    slotKey: "services-hero-bg",
    description: "Services page hero. Treatment room or clinical setting that signals modern care.",
    searchKeywords: "dental treatment room, modern dental chair, clinical operatory, treatment area wide shot",
    requirements: "Landscape, minimum 1920x1080, professional quality.",
    fallback: "Any modern dental operatory or clinical setting photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=50",
  },
  Contact: {
    slotKey: "contact-hero-bg",
    description: "Contact page hero. Exterior office photo or welcoming reception shot.",
    searchKeywords: "dental office exterior, welcoming reception area, office storefront photo",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any exterior or reception photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=60",
  },
  "Request Consultation": {
    slotKey: "consultation-hero-bg",
    description: "Consultation page hero. Warm patient-provider interaction or consultation setting.",
    searchKeywords: "dentist consultation with patient, welcoming dental consultation room, dentist and patient smiling",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any welcoming patient interaction photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=70",
  },
  Reviews: {
    slotKey: "reviews-hero-bg",
    description: "Reviews page hero. Happy patients or smiling faces.",
    searchKeywords: "happy dental patients, smiling patient portrait, satisfied customer in dental office",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any smiling patient photo or reception warmth shot.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=80",
  },
  Articles: {
    slotKey: "articles-hero-bg",
    description: "Articles/blog page hero. Clean editorial image suggesting oral health education.",
    searchKeywords: "dental articles, oral health education, editorial dental imagery, clinician reading",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any clinical or educational-feeling wide shot.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=90",
  },
  Success: {
    slotKey: "success-hero-bg",
    description: "Form success confirmation hero. Reassuring, bright, positive.",
    searchKeywords: "smiling patient, dental confirmation, welcoming office scene, bright reception",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any bright welcoming dental photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=100",
  },
  "Referral Form": {
    slotKey: "referral-hero-bg",
    description: "Referral form hero. Professional collaboration imagery.",
    searchKeywords: "dentist referral, clinician collaboration, dental professionals meeting, dental office workflow",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any professional clinical setting photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=110",
  },
  "Educational Content": {
    slotKey: "education-hero-bg",
    description: "Educational article detail hero. Clean editorial visual matching the article theme.",
    searchKeywords: "dental education, oral health illustration, modern clinical teaching, patient education",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any clean clinical or educational photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=120",
  },
  "Accessibility Notice": {
    slotKey: "accessibility-hero-bg",
    description: "Accessibility notice hero. Welcoming, inclusive imagery.",
    searchKeywords: "welcoming dental office, accessible reception, inclusive care, accessibility at dentist",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any welcoming, inclusive office photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=130",
  },
  "Privacy Policy": {
    slotKey: "privacy-hero-bg",
    description: "Privacy policy hero. Clean, professional, trust-building image.",
    searchKeywords: "professional dental office, trust, clean clinical environment, quiet office interior",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any clean professional office photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=140",
  },
  "Single Doctor": {
    slotKey: "doctor-hero-bg",
    description: "Doctor detail page hero. Clinical setting for the doctor portrait to sit against.",
    searchKeywords: "dental office interior, clinical setting, operatory, professional dental environment",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any dental office or clinical setting photo.",
    placeholderUrl: "https://picsum.photos/1920/800?random=doctor",
  },
  "Single Location": {
    slotKey: "location-hero-bg",
    description: "Location detail page hero. Exterior or welcoming interior photo for this specific location.",
    searchKeywords: "dental office exterior, location storefront, interior office reception photo",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any exterior or interior location photo.",
    placeholderUrl: "https://picsum.photos/1920/800?random=location",
  },
  "First Visit": {
    slotKey: "first-visit-hero-bg",
    description: "First visit hero. Warm new-patient welcoming imagery.",
    searchKeywords: "new patient welcome, friendly dental reception, first dental visit, greeting patient",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any welcoming reception photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=150",
  },
  "Dental Emergencies": {
    slotKey: "emergency-hero-bg",
    description: "Emergency page hero. Calm, professional clinical imagery that reassures.",
    searchKeywords: "dental emergency care, reassuring clinical setting, urgent dental treatment room, on-call dentist",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any clean clinical operatory photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=160",
  },
  "Insurance & Financial Information": {
    slotKey: "insurance-hero-bg",
    description: "Insurance page hero. Professional front-desk or billing setting.",
    searchKeywords: "dental front desk, reception desk, billing and insurance, dental administration",
    requirements: "Landscape, minimum 1920x800, professional quality.",
    fallback: "Any front-desk or reception photo.",
    placeholderUrl: "https://picsum.photos/1920/1080?random=170",
  },
};

function buildHeroAiImageComment(spec: HeroImageSpec): string {
  return `<!-- AI-IMAGE: ${spec.slotKey} | ${spec.description}
       SEARCH KEYWORDS: ${spec.searchKeywords}.
       REQUIREMENTS: ${spec.requirements}
       FALLBACK: ${spec.fallback}
       INSTRUCTION: Replace ONLY the url() value inside the section's background-image style; keep the linear-gradient overlay intact. Do not render this as an <img> element. -->`;
}

// ---------------------------------------------------------------------------
// Inline-style scrubber — converts known style="" patterns to Tailwind
// ---------------------------------------------------------------------------

function scrubInlineStyles(html: string): string {
  let out = html;

  // Strip any leftover AI-INSTRUCTION comment about the --gradient-bg custom property,
  // anywhere in the markup (these appear both at the top and inline after section tags).
  out = out.replace(
    /<!--\s*AI-INSTRUCTION:\s*This section uses a gradient background\.?\s*The gradient value is provided via --gradient-bg CSS custom property\.?\s*-->/gi,
    ""
  );

  // style="color:rgba(255,255,255,0.X)" → text-white/X0 on same element
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="color:\s*rgba\(255,\s*255,\s*255,\s*0?\.(\d+)\);?"/g,
    (_m, prefix, classStr, between, decimal) => {
      const opacity = Math.round(parseFloat("0." + decimal) * 100);
      const bucket = Math.round(opacity / 10) * 10;
      const newClass = `${classStr} text-white/${bucket}`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="background:rgba(255,255,255,0.X); border:1px solid rgba(255,255,255,0.Y);"
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="background:\s*rgba\(255,\s*255,\s*255,\s*0?\.(\d+)\);\s*border:\s*1px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0?\.(\d+)\);?"/g,
    (_m, prefix, classStr, between, bgDec, borderDec) => {
      const bgBucket = Math.round(parseFloat("0." + bgDec) * 100 / 10) * 10;
      const borderBucket = Math.round(parseFloat("0." + borderDec) * 100 / 10) * 10;
      const newClass =
        `${classStr} bg-white/${bgBucket} border border-white/${borderBucket}`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="background:rgba(255,255,255,0.X);" alone → bg-white/X0
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="background:\s*rgba\(255,\s*255,\s*255,\s*0?\.(\d+)\);?"/g,
    (_m, prefix, classStr, between, dec) => {
      const bucket = Math.round(parseFloat("0." + dec) * 100 / 10) * 10;
      const newClass = `${classStr} bg-white/${bucket}`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="border:1px solid rgba(255,255,255,0.X);" → border border-white/X0
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="border:\s*1px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0?\.(\d+)\);?"/g,
    (_m, prefix, classStr, between, dec) => {
      const bucket = Math.round(parseFloat("0." + dec) * 100 / 10) * 10;
      const newClass = `${classStr} border border-white/${bucket}`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="border-color:rgba(255,255,255,0.X);" → border-white/X0
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="border-color:\s*rgba\(255,\s*255,\s*255,\s*0?\.(\d+)\);?"/g,
    (_m, prefix, classStr, between, dec) => {
      const bucket = Math.round(parseFloat("0." + dec) * 100 / 10) * 10;
      const newClass = `${classStr} border-white/${bucket}`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="opacity:0.X;" → opacity-X0
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="opacity:\s*0?\.(\d+);?"/g,
    (_m, prefix, classStr, between, dec) => {
      const bucket = Math.round(parseFloat("0." + dec) * 100 / 5) * 5;
      const newClass = `${classStr} opacity-${bucket}`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="color:#HEX;" where HEX is a known dark brand text hex → drop inline
  out = out.replace(
    /\sstyle="color:\s*#(0d2d4a|1e4d6b|2d4a5e|232323|0F172A|0f172a);?"/gi,
    ""
  );

  // style="color:rgba(13,45,74,0.X);" (dark brand text variant) → drop inline
  out = out.replace(/\sstyle="color:\s*rgba\(13,\s*45,\s*74,\s*[^)]+\);?"/g, "");

  // style="background: var(--color-primary, #232323);" → bg-primary class
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="background:\s*var\(--color-primary[^)]*\);?"/g,
    (_m, prefix, classStr, between) => {
      const newClass = `${classStr} bg-primary`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="background:rgba(var(--color-primary-rgb,14,137,136),0.15);" → bg-primary-subtle
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="background:\s*rgba\(var\(--color-primary-rgb[^)]*\),\s*0?\.1\d*\);?"/g,
    (_m, prefix, classStr, between) => {
      const newClass = `${classStr} bg-primary-subtle`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="background:#232323;" → bg-[#0F172A] (slate-deep)
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="background:\s*#232323;?"/g,
    (_m, prefix, classStr, between) => {
      const newClass = `${classStr} bg-[#0F172A]`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="background:rgba(0,0,0,0.X);" → bg-black/X0 (or bg-black/[0.0X] for small)
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="background:\s*rgba\(0,\s*0,\s*0,\s*0?\.(\d+)\);?"/g,
    (_m, prefix, classStr, between, dec) => {
      const frac = parseFloat("0." + dec);
      const cls =
        frac < 0.1
          ? `bg-black/[0.${dec.padStart(2, "0")}]`
          : `bg-black/${Math.round(frac * 100 / 10) * 10}`;
      const newClass = `${classStr} ${cls}`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="border:1px solid rgba(0,0,0,0.X);" → border border-black/X0
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="border:\s*1px\s+solid\s+rgba\(0,\s*0,\s*0,\s*0?\.(\d+)\);?"/g,
    (_m, prefix, classStr, between, dec) => {
      const bucket = Math.round(parseFloat("0." + dec) * 100 / 10) * 10;
      const newClass = `${classStr} border border-black/${bucket}`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="background:rgba(35,35,35,0.0X);" → bg-black/[0.0X]
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="background:\s*rgba\(35,\s*35,\s*35,\s*0?\.(\d+)\);?"/g,
    (_m, prefix, classStr, between, dec) => {
      const cls = `bg-black/[0.${dec.padStart(2, "0")}]`;
      const newClass = `${classStr} ${cls}`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="background:#HEX;" (any 3 or 6 digit hex) → bg-[#HEX]
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="background:\s*(#[0-9a-fA-F]{3,8});?"/g,
    (_m, prefix, classStr, between, hex) => {
      const newClass = `${classStr} bg-[${hex}]`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="color:#HEX;" → text-[#HEX]
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="color:\s*(#[0-9a-fA-F]{3,8});?"/g,
    (_m, prefix, classStr, between, hex) => {
      const newClass = `${classStr} text-[${hex}]`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="border-color:#HEX; color:#HEX;" → border-[#HEX] text-[#HEX]
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="border-color:\s*(#[0-9a-fA-F]{3,8});\s*color:\s*(#[0-9a-fA-F]{3,8});?"/g,
    (_m, prefix, classStr, between, bHex, tHex) => {
      const newClass = `${classStr} border-[${bHex}] text-[${tHex}]`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="grid-template-columns:auto 1fr;" → grid-cols-[auto_1fr]
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="grid-template-columns:\s*auto\s+1fr;?"/g,
    (_m, prefix, classStr, between) => {
      const newClass = `${classStr} grid-cols-[auto_1fr]`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="box-shadow:0 25px 50px -12px rgba(0,0,0,0.08);" → shadow-2xl
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="box-shadow:\s*0\s+25px\s+50px\s+-12px\s+rgba\(0,\s*0,\s*0,\s*0?\.0\d\);?"/g,
    (_m, prefix, classStr, between) => {
      const newClass = `${classStr} shadow-2xl`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="background:rgba(255,255,255,0.9);backdrop-filter:blur(4px);" → bg-white/90 backdrop-blur-sm
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="background:\s*rgba\(255,\s*255,\s*255,\s*0?\.9\);\s*backdrop-filter:\s*blur\(4px\);?"/g,
    (_m, prefix, classStr, between) => {
      const newClass = `${classStr} bg-white/90 backdrop-blur-sm`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // style="height:500px; background:#HEX;" → h-[500px] bg-[#HEX]
  out = out.replace(
    /(<[^>]*?class="([^"]*?)")([^>]*?)\sstyle="height:\s*(\d+)px;\s*background:\s*(#[0-9a-fA-F]{3,8});?"/g,
    (_m, prefix, classStr, between, h, hex) => {
      const newClass = `${classStr} h-[${h}px] bg-[${hex}]`.trim();
      return `${prefix.replace(`class="${classStr}"`, `class="${newClass}"`)}${between}`;
    }
  );

  // Collapse double spaces created by class merging
  out = out.replace(/class="([^"]*)"/g, (_m, v) => `class="${v.replace(/\s+/g, " ").trim()}"`);

  return out;
}

function flipHeroTextColors(html: string): string {
  let out = html;
  out = out.replace(/\btext-gray-900\b/g, "text-white");
  out = out.replace(/\btext-gray-800\b/g, "text-white/95");
  out = out.replace(/\btext-gray-700\b/g, "text-white/80");
  out = out.replace(/\btext-gray-600\b/g, "text-white/70");
  return out;
}

// ---------------------------------------------------------------------------
// Hero section rewrite
// ---------------------------------------------------------------------------

function extractHeroComponentClass(sectionTag: string): string {
  const m = sectionTag.match(/alloro-tpl-v1-release-section-([a-z0-9-]+)/i);
  return m ? `alloro-tpl-v1-release-section-${m[1]}` : "alloro-tpl-v1-release-section-hero";
}

/**
 * Find the end index of the balanced </div> that closes the <div> beginning
 * at `openIdx` in `html`. Returns the index AFTER the closing </div>, or -1.
 */
function findBalancedDivEnd(html: string, openStartIdx: number, openTagEndIdx: number): number {
  let depth = 1;
  let i = openTagEndIdx;
  const openPattern = /<div\b/gi;
  const closePattern = /<\/div>/gi;
  while (i < html.length && depth > 0) {
    openPattern.lastIndex = i;
    closePattern.lastIndex = i;
    const openHit = openPattern.test(html) ? openPattern.lastIndex - 4 : -1; // points at "<div"
    closePattern.lastIndex = i;
    const closeHit = closePattern.test(html) ? closePattern.lastIndex - 6 : -1; // points at "</div"
    if (closeHit === -1) return -1;
    if (openHit !== -1 && openHit < closeHit) {
      depth += 1;
      i = openHit + 4;
    } else {
      depth -= 1;
      i = closeHit + 6;
      if (depth === 0) return i;
    }
  }
  // Hint about unused param so tsc doesn't complain
  void openStartIdx;
  return -1;
}

function rewriteHero(pageName: string, sectionName: string, content: string): string {
  const spec = HERO_IMAGE_SPECS[pageName];
  if (!spec) {
    throw new Error(`No HERO_IMAGE_SPECS entry for page "${pageName}"`);
  }

  // Strip leading AI-IMAGE / AI-INSTRUCTION comment
  let body = content.replace(/^\s*<!--\s*AI-(?:IMAGE|INSTRUCTION)[\s\S]*?-->\s*/i, "");

  const openRe = /<section\b[^>]*\bclass="[^"]*alloro-tpl-v1-release-section-[a-z0-9-]+[^"]*"[^>]*>/i;
  const openMatch = body.match(openRe);
  if (!openMatch) {
    throw new Error(`Cannot find <section ...> opening for hero in ${pageName}/${sectionName}`);
  }
  const componentClass = extractHeroComponentClass(openMatch[0]);
  const openEnd = (openMatch.index ?? 0) + openMatch[0].length;

  // Strip overlay wrapper if present: <div class="absolute inset-0 z-0">...</div>
  let inner = body.slice(openEnd);
  const overlayOpenRe = /<div\s+class="absolute\s+inset-0\s+z-0"[^>]*>/;
  const overlayOpenMatch = inner.match(overlayOpenRe);
  if (overlayOpenMatch) {
    const overlayStart = overlayOpenMatch.index ?? 0;
    const overlayOpenEnd = overlayStart + overlayOpenMatch[0].length;
    const overlayEnd = findBalancedDivEnd(inner, overlayStart, overlayOpenEnd);
    if (overlayEnd !== -1) {
      inner = inner.slice(0, overlayStart) + inner.slice(overlayEnd);
    }
  }

  const newOpen =
    `<section class="${componentClass} ${SUBPAGE_HERO_SIZE_CLASSES} bg-center bg-cover bg-no-repeat text-ivory" ` +
    `style="background-image:${HERO_OVERLAY_GRADIENT}, url('${spec.placeholderUrl}');">`;
  const aiComment = buildHeroAiImageComment(spec);

  let rebuilt = `${aiComment}\n${newOpen}${inner}`;

  rebuilt = scrubInlineStyles(rebuilt);
  rebuilt = flipHeroTextColors(rebuilt);

  // Remove any lingering inner overlay gradient style
  rebuilt = rebuilt.replace(
    /\sstyle="background:\s*linear-gradient\([^"]*?rgba\(\s*\d+[^"]*?\);?"/g,
    ""
  );

  return rebuilt;
}

function rewriteHomepageHero(content: string): string {
  const spec = HERO_IMAGE_SPECS["Homepage"];
  let body = content.replace(/^\s*<!--\s*AI-IMAGE[\s\S]*?-->\s*/i, "");
  body = `${buildHeroAiImageComment(spec)}\n${body}`;

  // Temporarily protect the section's own background-image style before scrubbing
  body = body.replace(/\sstyle="opacity:\s*0?\.9;?"/g, " data-opacity-tmp");
  body = scrubInlineStyles(body);
  body = body.replace(/ data-opacity-tmp/g, " opacity-90");

  body = body.replace(
    /<section\s+class="([^"]*alloro-tpl-v1-release-section-hero[^"]*)"/,
    (_m, cls) =>
      cls.includes("text-ivory") ? `<section class="${cls}"` : `<section class="${cls} text-ivory"`
  );

  return body;
}

// ---------------------------------------------------------------------------
// Non-hero gradient section rewrite → .bg-gradient-brand
// ---------------------------------------------------------------------------

function rewriteGradientSection(content: string): string {
  let out = content;

  out = out.replace(
    /^\s*<!--\s*AI-INSTRUCTION:\s*This section uses a gradient background[\s\S]*?-->\s*/i,
    ""
  );

  out = out.replace(
    /(<section\b[^>]*?\bclass=")([^"]*?)("[^>]*?)\sstyle="background:\s*var\(--gradient-bg[^"]*?\);?"/,
    (_m, pre, classes, post) => {
      const updatedClasses = classes.includes("bg-gradient-brand")
        ? classes
        : `${classes} bg-gradient-brand text-ivory`;
      return `${pre}${updatedClasses}${post}`;
    }
  );

  out = scrubInlineStyles(out);
  out = flipHeroTextColors(out);

  return out;
}

// ---------------------------------------------------------------------------
// CTA directive injector
// ---------------------------------------------------------------------------

function injectCtaDirectives(content: string): string {
  const ctaLiterals = [
    "Request an Appointment",
    "Request Free Consultation",
    "Book Appointment",
    "Request Emergency Appointment",
    "Schedule a Consultation",
    "Book an Appointment",
  ];

  return content.replace(
    /(\s*)(<a\s+href="\/consultation"[^>]*>)([\s\S]*?)(<\/a>)/g,
    (_m, lead, openTag, inner, closeTag) => {
      let finalInner = inner;
      for (const lit of ctaLiterals) {
        if (finalInner.includes(lit)) {
          finalInner = finalInner.split(lit).join(CTA_PLACEHOLDER_TEXT);
        }
      }
      return `\n${lead}${CTA_DIRECTIVE_COMMENT}\n${lead}${openTag}${finalInner}${closeTag}`;
    }
  );
}

// ---------------------------------------------------------------------------
// Per-page orchestrator
// ---------------------------------------------------------------------------

const GRADIENT_SECTIONS_BY_PAGE: Record<string, string[]> = {
  Services: ["section-services-cta"],
  "About Us": ["section-consultation-cta"],
  Reviews: ["section-cta"],
  "Educational Content": ["section-cta"],
  "Accessibility Notice": ["section-cta"],
  "Dental Emergencies": ["section-cta"],
  Homepage: ["section-appointment"],
  "Single Doctor": ["section-consultation"],
  "Single Location": ["section-consultation"],
  "Request Consultation": ["section-consultation"],
};

interface Section {
  name: string;
  content: string;
}

export function transformPageSections(pageName: string, raw: unknown): Section[] {
  let sections: Section[];
  if (Array.isArray(raw)) {
    sections = raw as Section[];
  } else if (raw && typeof raw === "object" && Array.isArray((raw as { sections?: unknown }).sections)) {
    sections = (raw as { sections: Section[] }).sections;
  } else {
    throw new Error(`Unexpected sections shape for ${pageName}: ${typeof raw}`);
  }

  const gradientTargets = new Set(GRADIENT_SECTIONS_BY_PAGE[pageName] ?? []);

  return sections.map((s) => {
    let content = s.content;
    const isHero = /hero/i.test(s.name);

    if (isHero) {
      content =
        pageName === "Homepage"
          ? rewriteHomepageHero(content)
          : rewriteHero(pageName, s.name, content);
    } else if (gradientTargets.has(s.name)) {
      content = rewriteGradientSection(content);
    } else {
      content = scrubInlineStyles(content);
    }

    content = injectCtaDirectives(content);
    return { name: s.name, content };
  });
}

// ---------------------------------------------------------------------------
// Wrapper — add slate-deep / ivory utilities
// ---------------------------------------------------------------------------

const NEW_WRAPPER_UTILITIES = `
    /* Slate-deep surface + ivory text utilities (added 2026-04-21) */
    .bg-slate-deep {
      background-color: #0F172A !important;
      color: #F8FAFC;
    }
    .bg-slate-deep * {
      color: inherit;
    }
    .text-ivory { color: #F8FAFC; }
    .text-slate-deep { color: #0F172A; }`;

export function transformWrapper(html: string): string {
  const marker = ".bg-gradient-brand * {\n      color: inherit;\n    }";
  if (!html.includes(marker)) {
    const loose = html.indexOf(".bg-gradient-brand *");
    if (loose === -1)
      throw new Error("Cannot locate .bg-gradient-brand marker in wrapper to insert utilities");
    const closingBrace = html.indexOf("}", loose);
    if (closingBrace === -1) throw new Error("Malformed wrapper CSS near .bg-gradient-brand *");
    return html.slice(0, closingBrace + 1) + NEW_WRAPPER_UTILITIES + html.slice(closingBrace + 1);
  }
  return html.replace(marker, `${marker}${NEW_WRAPPER_UTILITIES}`);
}

// ---------------------------------------------------------------------------
// Header — inject CTA directives
// ---------------------------------------------------------------------------

export function transformHeader(html: string): string {
  let out = html;
  out = injectCtaDirectives(out);
  const mobileSpanRe =
    /(<span\s+class="alloro-tpl-v1-release-header-component-mobile-cta-button[^"]*"[^>]*>)([^<]+)(<\/span>)/;
  out = out.replace(mobileSpanRe, (_m, open, _label, close) => `${open}${CTA_PLACEHOLDER_TEXT}${close}`);
  return out;
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

const FOOTER_MAP_AI_INSTRUCTION_HEADER = `<!-- ========== LOCATIONS STRIP ==========
  AI-INSTRUCTIONS (Locations Strip):
  - This section appears ABOVE the main footer.
  - It uses the location-footer-columns post block to display practice locations.
  - Replace the heading with the business's service area (e.g., "Serving Northern Virginia").
  - MAP BEHAVIOR (REQUIRED): Populate the \`locations\` array in the inline <script> with EVERY
    location from the business identity — no subset, no sample data. The map MUST auto-center
    via \`fitBounds\` when there are 2+ locations, and \`setView\` at zoom 14 when exactly 1.
    Do not render the map if there are zero locations — hide the entire map div in that case.
  - If the business has only one location, this section can be simplified but the pin MUST still
    render at that single location's coordinates.
-->`;

const FOOTER_MAP_LOCATIONS_DIRECTIVE = `/* AI-CONTENT: map-locations | Replace the \`locations\` array with ALL locations from identity.locations[].
         Each entry needs: name, full formatted address, exact lat/lng (geocode from place_id if missing),
         and gmaps (Google Maps URL). Do not drop duplicates. Every physical location must have a pin.
         The map will auto-fitBounds across all pins so all are visible and centered. */`;

export function transformFooter(html: string): string {
  let out = html;

  out = out.replace(
    /<!--\s*==========\s*LOCATIONS STRIP\s*==========[\s\S]*?-->/,
    FOOTER_MAP_AI_INSTRUCTION_HEADER
  );

  out = out.replace(
    /<div\s+class="rounded-3xl overflow-hidden mb-12 md:mb-16"\s+style="height:380px;">/,
    `<div class="rounded-3xl overflow-hidden mb-12 md:mb-16 h-[380px]">`
  );

  out = out.replace(
    /<div\s+id="footer-map"\s+style="height:100%;\s*width:100%;\s*z-index:0;\s*position:relative;">/,
    `<div id="footer-map" class="h-full w-full relative z-0">`
  );

  out = out.replace(
    /\/\*\s*AI-CONTENT:\s*map-locations\s*\|[\s\S]*?\*\//,
    FOOTER_MAP_LOCATIONS_DIRECTIVE
  );

  out = out.replace(
    /<footer\s+class="(alloro-tpl-v1-release-footer\s+)bg-primary(\s+text-white[^"]*)"/,
    `<footer class="$1bg-slate-deep$2"`
  );

  out = scrubInlineStyles(out);

  return out;
}

// ---------------------------------------------------------------------------
// Migration up/down
// ---------------------------------------------------------------------------

async function resolveTemplate(
  knex: Knex
): Promise<{ id: string; name: string; wrapper: string; header: string; footer: string } | null> {
  let tmpl = await knex("website_builder.templates")
    .where("is_active", true)
    .first("id", "name", "wrapper", "header", "footer");
  if (tmpl) return tmpl;
  tmpl = await knex("website_builder.templates")
    .whereRaw("LOWER(name) LIKE ?", ["%dental%"])
    .orWhereRaw("LOWER(name) LIKE ?", ["%seo%"])
    .orderBy("created_at", "asc")
    .first("id", "name", "wrapper", "header", "footer");
  return tmpl ?? null;
}

export async function up(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES,
    BACKUP_PAGES,
  ]);
  if (guard.rows[0].t1 !== null || guard.rows[0].t2 !== null) {
    throw new Error(
      `Backup tables ${BACKUP_TEMPLATES} or ${BACKUP_PAGES} already exist. Drop them to re-run.`
    );
  }

  const template = await resolveTemplate(knex);
  if (!template) {
    console.log("[migration:dental_seo_refresh] No dental template found — skipping");
    return;
  }
  console.log(`[migration:dental_seo_refresh] Target: "${template.name}" (${template.id})`);

  await knex.raw(
    `CREATE TABLE ${BACKUP_TEMPLATES} AS SELECT * FROM website_builder.templates WHERE id = ?`,
    [template.id]
  );
  await knex.raw(
    `CREATE TABLE ${BACKUP_PAGES} AS SELECT * FROM website_builder.template_pages WHERE template_id = ?`,
    [template.id]
  );
  console.log(`[migration:dental_seo_refresh] Backups created`);

  const newWrapper = transformWrapper(template.wrapper);
  const newHeader = transformHeader(template.header);
  const newFooter = transformFooter(template.footer);

  const pages = await knex("website_builder.template_pages")
    .where("template_id", template.id)
    .select("id", "name", "sections");

  const pageUpdates: { id: string; name: string; newSections: Section[] }[] = [];
  for (const p of pages) {
    try {
      const newSections = transformPageSections(p.name, p.sections);
      pageUpdates.push({ id: p.id, name: p.name, newSections });
      console.log(
        `[migration:dental_seo_refresh] Transformed "${p.name}" → ${newSections.length} sections`
      );
    } catch (e) {
      throw new Error(
        `Transformation failed for page "${p.name}" (${p.id}): ${(e as Error).message}`
      );
    }
  }

  await knex.transaction(async (trx) => {
    await trx("website_builder.templates").where("id", template.id).update({
      wrapper: newWrapper,
      header: newHeader,
      footer: newFooter,
      updated_at: new Date(),
    });
    for (const u of pageUpdates) {
      await trx("website_builder.template_pages").where("id", u.id).update({
        sections: JSON.stringify(u.newSections),
        updated_at: new Date(),
      });
    }
  });

  console.log("[migration:dental_seo_refresh] Complete");
}

export async function down(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS t1, to_regclass(?) AS t2`, [
    BACKUP_TEMPLATES,
    BACKUP_PAGES,
  ]);
  if (guard.rows[0].t1 === null || guard.rows[0].t2 === null) {
    throw new Error(`Cannot rollback: backup tables missing.`);
  }

  await knex.transaction(async (trx) => {
    await trx.raw(
      `UPDATE website_builder.templates tgt
       SET wrapper = src.wrapper, header = src.header, footer = src.footer, updated_at = src.updated_at
       FROM ${BACKUP_TEMPLATES} src
       WHERE tgt.id = src.id`
    );
    await trx.raw(
      `UPDATE website_builder.template_pages tgt
       SET sections = src.sections, updated_at = src.updated_at
       FROM ${BACKUP_PAGES} src
       WHERE tgt.id = src.id`
    );
  });

  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_PAGES}`);
  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_TEMPLATES}`);

  console.log("[migration:dental_seo_refresh/down] Restored from backup; backup tables dropped");
}
