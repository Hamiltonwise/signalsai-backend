/**
 * Identity Context Builder
 *
 * Translates a project_identity document into a stable cached block and a
 * variable per-component payload. Pure function — no LLM, no DB.
 */

export type GradientPresetId =
  | "balanced"
  | "wider-from"
  | "wider-to"
  | "centered"
  | "hard-edge";

/**
 * Expand a preset ID into CSS stops. Mirrors the frontend definition in
 * GradientPicker.tsx — kept in sync by convention (both sides are small).
 */
export function buildGradientStopsCss(
  from: string,
  to: string,
  preset: GradientPresetId | null | undefined,
): string {
  const active: GradientPresetId = preset || "balanced";
  const stops: Array<{ role: "from" | "to"; position: number }> =
    active === "balanced"
      ? [
          { role: "from", position: 0 },
          { role: "to", position: 100 },
        ]
      : active === "wider-from"
        ? [
            { role: "from", position: 0 },
            { role: "from", position: 70 },
            { role: "to", position: 100 },
          ]
        : active === "wider-to"
          ? [
              { role: "from", position: 0 },
              { role: "to", position: 30 },
              { role: "to", position: 100 },
            ]
          : active === "centered"
            ? [
                { role: "from", position: 25 },
                { role: "to", position: 75 },
              ]
            : /* hard-edge */ [
                { role: "from", position: 0 },
                { role: "from", position: 49 },
                { role: "to", position: 51 },
                { role: "to", position: 100 },
              ];

  return stops
    .map((s) => `${s.role === "from" ? from : to} ${s.position}%`)
    .join(", ");
}

export interface ProjectIdentity {
  version?: number;
  business?: {
    name?: string | null;
    category?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    rating?: number | null;
    review_count?: number | null;
    website_url?: string | null;
    place_id?: string | null;
    hours?: unknown;
  };
  brand?: {
    primary_color?: string | null;
    accent_color?: string | null;
    gradient_enabled?: boolean;
    gradient_from?: string | null;
    gradient_to?: string | null;
    gradient_direction?: string | null;
    gradient_text_color?: "white" | "dark" | null;
    gradient_preset?: GradientPresetId | null;
    logo_s3_url?: string | null;
    logo_alt_text?: string | null;
  };
  voice_and_tone?: {
    archetype?: string | null;
    tone_descriptor?: string | null;
    voice_samples?: string[];
  };
  content_essentials?: {
    unique_value_proposition?: string | null;
    founding_story?: string | null;
    core_values?: string[];
    certifications?: string[];
    service_areas?: string[];
    social_links?: Record<string, string | null>;
    review_themes?: string[];
    featured_testimonials?: Array<{
      author?: string | null;
      rating?: number | null;
      text?: string | null;
    }>;
  };
  extracted_assets?: {
    images?: Array<ImageManifestEntry>;
    discovered_pages?: Array<{ url?: string | null; title?: string | null; content_excerpt?: string | null }>;
  };
  meta?: {
    warmup_status?: string | null;
  };
}

export interface ImageManifestEntry {
  source_url?: string | null;
  s3_url?: string | null;
  description?: string | null;
  use_case?: string | null;
  resolution?: string | null;
  is_logo?: boolean;
  usability_rank?: number | null;
}

export interface ComponentContext {
  componentName: string;
  templateMarkup: string;
  variableUserMessage: string;
  imageManifest: Array<{
    id: string;
    description: string | null;
    use_case: string | null;
    resolution: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// STABLE CONTEXT (cached across component calls)
// ---------------------------------------------------------------------------

export function buildStableIdentityContext(identity: ProjectIdentity): string {
  const b = identity.business || {};
  const br = identity.brand || {};
  const v = identity.voice_and_tone || {};

  const parts: string[] = [];

  parts.push("## BUSINESS");
  parts.push(
    kvLines({
      Name: b.name,
      Category: b.category,
      Phone: b.phone,
      Address: [b.address, b.city, b.state, b.zip].filter(Boolean).join(", "),
      Website: b.website_url,
      Rating: b.rating ? `${b.rating}/5 (${b.review_count || 0} reviews)` : null,
    }),
  );

  parts.push("\n## BRAND");
  const brandLines: Record<string, unknown> = {
    "Primary color": br.primary_color,
    "Accent color": br.accent_color,
  };
  if (br.gradient_enabled) {
    brandLines["Gradient"] = `${br.gradient_from} to ${br.gradient_to} (${br.gradient_direction})`;
    brandLines["Gradient preset"] = br.gradient_preset || "balanced";
    brandLines["Gradient text color"] = br.gradient_text_color || "white";
  }
  if (br.logo_s3_url) {
    brandLines["Logo URL"] = br.logo_s3_url;
    brandLines["Logo alt"] = br.logo_alt_text;
  }
  parts.push(kvLines(brandLines));

  parts.push("\n## VOICE & TONE");
  parts.push(kvLines({ Archetype: v.archetype, Tone: v.tone_descriptor }));

  if (v.voice_samples && v.voice_samples.length > 0) {
    parts.push("\nVoice samples to match:");
    for (const sample of v.voice_samples.slice(0, 3)) {
      parts.push(`  - "${sample}"`);
    }
  }

  const colorRules = [
    "\n## COLOR UTILITY CLASSES",
    "- bg-primary, text-primary - solid primary color",
    "- bg-accent, text-accent - solid accent color",
    br.gradient_enabled
      ? "- bg-gradient-brand, text-gradient-brand - gradient between primary and accent. Use for hero backgrounds and accent headings."
      : null,
    "- bg-primary-subtle, bg-accent-subtle - subtle tinted variants",
    "Never use Tailwind opacity variants like bg-primary/10 - they don't work.",
  ];
  parts.push(colorRules.filter(Boolean).join("\n"));

  return parts.join("\n");
}

function kvLines(obj: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    out.push(`- ${k}: ${v}`);
  }
  return out.join("\n") || "- (unset)";
}

// ---------------------------------------------------------------------------
// PER-COMPONENT CONTEXT
// ---------------------------------------------------------------------------

export function buildComponentContext(
  identity: ProjectIdentity,
  component: { name: string; templateMarkup: string; type?: string },
  slotValues: Record<string, string> | undefined,
  pageContext?: string,
): ComponentContext {
  const ce = identity.content_essentials || {};
  const compName = component.name.toLowerCase();

  const parts: string[] = [];

  parts.push(
    `## COMPONENT TO GENERATE\nName: ${component.name}\nType: ${component.type || "section"}`,
  );
  parts.push(`\n## TEMPLATE MARKUP\n\`\`\`html\n${component.templateMarkup}\n\`\`\``);

  const relevantContent = extractRelevantContent(compName, ce);
  if (relevantContent) {
    parts.push(`\n## PAGE-SPECIFIC CONTEXT\n${relevantContent}`);
  }

  const manifest = filterImagesForComponent(
    compName,
    identity.extracted_assets?.images || [],
  );
  if (manifest.length > 0) {
    const lines = manifest.map(
      (m) =>
        `- ${m.id}: ${m.description || "(no description)"} - use_case: ${m.use_case || "?"} - resolution: ${m.resolution || "?"}`,
    );
    parts.push(
      `\n## AVAILABLE IMAGES (use the select_image tool to get actual URLs)\n${lines.join("\n")}`,
    );
  }

  if (slotValues) {
    const nonEmpty = Object.entries(slotValues).filter(([, v]) => v && String(v).trim());
    if (nonEmpty.length > 0) {
      parts.push(
        `\n## ADMIN-PROVIDED SLOT VALUES\n${nonEmpty.map(([k, v]) => `- ${k}: ${v}`).join("\n")}`,
      );
    }
  }

  if (pageContext && pageContext.trim()) {
    parts.push(`\n## ADDITIONAL CONTEXT FROM ADMIN\n${pageContext.trim()}`);
  }

  return {
    componentName: component.name,
    templateMarkup: component.templateMarkup,
    variableUserMessage: parts.join("\n"),
    imageManifest: manifest,
  };
}

function extractRelevantContent(
  compName: string,
  ce: ProjectIdentity["content_essentials"],
): string | null {
  if (!ce) return null;
  const parts: string[] = [];

  const addList = (label: string, items: unknown) => {
    if (!Array.isArray(items) || items.length === 0) return;
    parts.push(`**${label}:** ${items.filter(Boolean).join(", ")}`);
  };
  const addStr = (label: string, value: unknown) => {
    if (!value) return;
    parts.push(`**${label}:** ${value}`);
  };

  if (
    compName.includes("hero") ||
    compName.includes("upgrade") ||
    compName === "wrapper"
  ) {
    addStr("Unique value proposition", ce.unique_value_proposition);
    if (ce.featured_testimonials && ce.featured_testimonials.length > 0) {
      const t = ce.featured_testimonials[0];
      if (t.text) {
        parts.push(`**Top testimonial:** "${t.text}" - ${t.author || "patient"}`);
      }
    }
  }

  if (
    compName.includes("why-choose") ||
    compName.includes("whychoose") ||
    compName.includes("orthodontist") ||
    compName.includes("doctor")
  ) {
    addList("Certifications", ce.certifications);
    addList("Core values", ce.core_values);
  }

  if (compName.includes("testimonial") || compName.includes("review")) {
    if (ce.featured_testimonials && ce.featured_testimonials.length > 0) {
      parts.push("**Featured testimonials:**");
      for (const t of ce.featured_testimonials.slice(0, 5)) {
        parts.push(
          `  - "${t.text}" - ${t.author || "Anonymous"} (${t.rating || "?"} stars)`,
        );
      }
    }
  }

  if (compName.includes("faq")) {
    addList("Review themes to address", ce.review_themes);
  }

  if (compName === "footer") {
    if (ce.social_links) {
      const social = Object.entries(ce.social_links)
        .filter(([, v]) => v && typeof v === "string")
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (social) parts.push(`**Social links:** ${social}`);
    }
    addList("Service areas", ce.service_areas);
    addList("Certifications", ce.certifications);
  }

  if (
    compName.includes("about") ||
    compName.includes("story") ||
    compName.includes("values")
  ) {
    addStr("Founding story", ce.founding_story);
    addList("Core values", ce.core_values);
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

function filterImagesForComponent(
  compName: string,
  images: ImageManifestEntry[],
): Array<{
  id: string;
  description: string | null;
  use_case: string | null;
  resolution: string | null;
}> {
  if (!Array.isArray(images) || images.length === 0) return [];

  const ranked = images
    .map((img, idx) => {
      const use = (img.use_case || "").toLowerCase();
      let score = 0;

      if (compName.includes("hero") || compName.includes("upgrade")) {
        if (use.includes("hero") || use.includes("banner")) score += 10;
        if (img.resolution === "high") score += 3;
      }
      if (compName.includes("gallery") || compName.includes("portfolio")) {
        if (
          use.includes("gallery") ||
          use.includes("portfolio") ||
          use.includes("before")
        )
          score += 10;
      }
      if (
        compName.includes("team") ||
        compName.includes("about") ||
        compName.includes("doctor")
      ) {
        if (
          use.includes("team") ||
          use.includes("portrait") ||
          use.includes("doctor")
        )
          score += 10;
      }
      if (compName === "header" || compName === "wrapper") {
        if (img.is_logo || use.includes("logo")) score += 20;
      }
      if (compName.includes("service") || compName.includes("why-choose")) {
        if (
          use.includes("office") ||
          use.includes("interior") ||
          use.includes("storefront")
        )
          score += 5;
      }

      score += img.usability_rank || 5;

      return { img, score, idx };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return ranked.map((r) => ({
    id: `img-${r.idx}`,
    description: r.img.description || null,
    use_case: r.img.use_case || null,
    resolution: r.img.resolution || null,
  }));
}

// ---------------------------------------------------------------------------
// IMAGE URL RESOLVER (for select_image tool)
// ---------------------------------------------------------------------------

export function resolveImageUrl(
  identity: ProjectIdentity,
  imageId: string,
): { s3_url: string | null; description: string | null } | null {
  const match = /^img-(\d+)$/.exec(imageId);
  if (!match) return null;
  const idx = parseInt(match[1], 10);
  const images = identity.extracted_assets?.images || [];
  const img = images[idx];
  if (!img) return null;
  return {
    s3_url: img.s3_url || img.source_url || null,
    description: img.description || null,
  };
}
