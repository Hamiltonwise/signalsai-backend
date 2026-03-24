/**
 * HTML Validator — Agentic Loop
 *
 * Validates generated/edited HTML for UI integrity and link correctness.
 * Used as a self-correcting loop: generate -> validate -> fix -> validate -> save.
 */

export interface ValidationIssue {
  type: "ui" | "link";
  description: string;
  fixInstruction: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function validateHtml(
  html: string,
  existingPaths: string[],
  existingPostSlugs: string[]
): ValidationResult {
  const issues: ValidationIssue[] = [];
  issues.push(...checkStructure(html));
  issues.push(...checkColors(html));
  issues.push(...checkBannedPatterns(html));
  issues.push(...checkBrokenImages(html));
  issues.push(...checkLinks(html, existingPaths, existingPostSlugs));

  return { valid: issues.length === 0, issues };
}

function checkStructure(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (html.length > 300 && !/max-w-|container/.test(html)) {
    issues.push({ type: "ui", description: "No container constraint (max-w-*).",
      fixInstruction: "Wrap inner content in <div class=\"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\">." });
  }

  if (/<a\s[^>]*>(?:(?!<\/a>)[\s\S])*<a\s/gi.test(html)) {
    issues.push({ type: "ui", description: "Nested anchor tags.",
      fixInstruction: "Remove outer <a> or restructure." });
  }

  const absCount = (html.match(/\babsolute\b/g) || []).length + (html.match(/\bfixed\b/g) || []).length;
  if (absCount > 0) {
    issues.push({ type: "ui", description: `Uses position absolute/fixed (${absCount}x).`,
      fixInstruction: "Replace with flex or grid layouts." });
  }

  const inlineStyles = (html.match(/style="[^"]+"/g) || []).filter(
    (s) => !s.includes("display:none") && !s.includes("display: none")
  );
  if (inlineStyles.length > 0) {
    issues.push({ type: "ui", description: `${inlineStyles.length} inline style(s).`,
      fixInstruction: "Convert to Tailwind CSS classes." });
  }

  return issues;
}

function checkColors(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const hexColors = html.match(/(?:bg|text|border|from|to)-\[#[a-fA-F0-9]{3,8}\]/gi) || [];
  if (hexColors.length > 0) {
    issues.push({ type: "ui",
      description: `Hardcoded hex colors: ${[...new Set(hexColors)].slice(0, 3).join(", ")}.`,
      fixInstruction: "Use bg-primary, text-primary, bg-accent, text-accent instead." });
  }

  // ANY color/opacity variant — all fail with CDN Tailwind
  const colorOpacity = html.match(/(?:bg|text|border|from|to|via)-(?:primary|accent|white|black|gray-\d+|slate-\d+)\/\d+/g) || [];
  if (colorOpacity.length > 0) {
    issues.push({ type: "ui",
      description: `Color opacity variants (${[...new Set(colorOpacity)].slice(0, 4).join(", ")}) fail with Tailwind CDN.`,
      fixInstruction: "Remove ALL color/opacity variants. Use solid Tailwind classes instead: bg-gray-50 or bg-gray-100 for light tinted backgrounds, bg-gray-900 or bg-primary for dark backgrounds, text-white or text-gray-200 for light text on dark, text-gray-600 for muted text. Never use /N opacity modifiers on any color." });
  }

  // bg-opacity-*, border-opacity-* utilities
  const legacyOpacity = html.match(/(?:bg|border|text)-opacity-\d+/g) || [];
  if (legacyOpacity.length > 0) {
    issues.push({ type: "ui",
      description: `Legacy opacity utilities (${[...new Set(legacyOpacity)].join(", ")}) fail with CDN.`,
      fixInstruction: "Remove legacy opacity utilities. Use solid Tailwind colors instead: bg-gray-50 for light tinted backgrounds, bg-gray-900 for dark." });
  }

  // Gradient classes with brand colors
  const brandGradients = html.match(/(?:from|to|via)-(?:primary|accent)(?:\/\d+)?/g) || [];
  if (brandGradients.length > 0) {
    issues.push({ type: "ui",
      description: `Gradient with brand colors (${[...new Set(brandGradients)].join(", ")}) fails with CSS custom properties.`,
      fixInstruction: "Remove gradient classes (from-primary, to-accent, via-primary etc). Use solid bg-primary or bg-accent instead. For visual depth, use separate nested elements with different solid background colors (e.g., bg-primary on outer, bg-gray-50 on inner)." });
  }

  // Non-standard Tailwind opacity steps
  const nonStandardOpacity = html.match(/\/(?:8|15|35|45|55|65|85)\b/g) || [];
  if (nonStandardOpacity.length > 0) {
    issues.push({ type: "ui",
      description: `Non-standard opacity steps (${[...new Set(nonStandardOpacity)].join(", ")}). Only 5,10,20,25,30,40,50,60,70,75,80,90,95 valid.`,
      fixInstruction: "Replace with nearest valid Tailwind step." });
  }

  // Inline font-family references (both quoted and unquoted)
  const inlineFonts = html.match(/font-\[['"]?[A-Z][a-zA-Z_]+/g) || [];
  if (inlineFonts.length > 0) {
    issues.push({ type: "ui",
      description: `Inline font references: ${[...new Set(inlineFonts)].slice(0, 3).join(", ")}.`,
      fixInstruction: "WRONG: font-['Cormorant_Garamond',serif] RIGHT: font-serif. WRONG: font-['DM_Sans',sans-serif] RIGHT: font-sans" });
  }

  // rounded-lg on buttons (should be rounded-full)
  const buttonsWithRoundedLg = html.match(/<(?:a|button)[^>]*rounded-lg[^>]*>/gi) || [];
  if (buttonsWithRoundedLg.length > 0) {
    issues.push({ type: "ui",
      description: `${buttonsWithRoundedLg.length} button(s) use rounded-lg — should be rounded-full.`,
      fixInstruction: "Replace rounded-lg with rounded-full on all buttons and CTA links." });
  }

  const hasDarkBg = /bg-(?:gray-[789]00|slate-[789]00|black|primary)\b/.test(html);
  if (hasDarkBg && (html.match(/\btext-gray-[4-7]00\b/g) || []).length > 0) {
    issues.push({ type: "ui", description: "Low-contrast text on dark background.",
      fixInstruction: "Use text-white or text-gray-100/200 on dark backgrounds." });
  }

  return issues;
}

function checkBannedPatterns(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (/\bfloat-(?:left|right)\b|float:\s*(?:left|right)/i.test(html)) {
    issues.push({ type: "ui", description: "Uses float.",
      fixInstruction: "Replace with flex or grid." });
  }
  if (/!important/.test(html)) {
    issues.push({ type: "ui", description: "Uses !important.",
      fixInstruction: "Remove !important." });
  }

  // Orphaned content before <section> tag
  const trimmed = html.trim();
  if (trimmed.length > 0 && !trimmed.startsWith("<section") && !trimmed.startsWith("<!--")) {
    const firstSection = trimmed.indexOf("<section");
    if (firstSection > 0) {
      issues.push({ type: "ui", description: "Orphaned HTML content before the <section> tag.",
        fixInstruction: "Remove all content before the opening <section> tag. Each section must start with <section>." });
    }
  }

  // Visible removal comments
  const removalPattern = /\((?:empty|removed|section removed|deleted|cleared)[^)]*\)/i;
  if (removalPattern.test(html)) {
    issues.push({ type: "ui", description: "Visible removal comment in HTML.",
      fixInstruction: "Remove all text like '(empty — section removed entirely)' or '(removed)'. If the section should be empty, return an empty string — literally nothing." });
  }

  // Raw shortcode template tokens in page HTML (should only be in template definitions)
  const rawTokens = html.match(/\{\{(?:start_post_loop|end_post_loop|start_review_loop|end_review_loop|post\.[\w]+|post_content|post_title|custom_field)\b[^}]*\}\}/g) || [];
  if (rawTokens.length > 0) {
    issues.push({ type: "ui",
      description: `Raw shortcode template tokens in page HTML: ${[...new Set(rawTokens)].slice(0, 3).join(", ")}`,
      fixInstruction: "Replace raw template tokens ({{start_post_loop}}, {{post.title}}, etc.) with a complete shortcode reference: {{ post_block id='slug' items='type' }}. Template loop tokens belong in post_block template definitions, not in page HTML." });
  }

  // Anchor hrefs (#something) — these often point to non-existent IDs
  const anchorHrefs = html.match(/href="#[^"]+"/g) || [];
  for (const anchor of anchorHrefs) {
    const id = anchor.match(/#([^"]+)/)?.[1];
    if (id && !html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
      issues.push({ type: "link",
        description: `Anchor href="#${id}" but no matching id="${id}" exists in this section.`,
        fixInstruction: `Replace href="#${id}" with a link to an actual page path (e.g., /consultation or /contact).` });
      break; // One is enough to trigger a fix
    }
  }

  return issues;
}

function checkBrokenImages(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Detect <img> with relative src paths (invented/placeholder images)
  const relativeImages = html.match(/<img[^>]*src=["']\/(?!api\/)[^"']*["'][^>]*>/gi) || [];
  if (relativeImages.length > 0) {
    issues.push({
      type: "ui",
      description: `${relativeImages.length} image(s) with local/relative src paths — these files likely don't exist.`,
      fixInstruction: "Remove <img> tags with relative src paths (src=\"/images/...\", src=\"/assets/...\"). Replace with text content or a placeholder div with class=\"bg-gray-200 rounded-lg w-full h-48 flex items-center justify-center\". Keep images that use https:// URLs.",
    });
  }

  // Detect common placeholder image patterns
  const placeholderImages = html.match(/<img[^>]*src=["'](?:https?:\/\/(?:via\.placeholder|placehold|placekitten|picsum|dummyimage|fakeimg)[^"']*|data:image\/[^"']*)["'][^>]*>/gi) || [];
  if (placeholderImages.length > 0) {
    issues.push({
      type: "ui",
      description: `${placeholderImages.length} placeholder/dummy image(s) detected.`,
      fixInstruction: "Remove placeholder images. Replace with a div with class=\"bg-gray-200 rounded-lg w-full h-48\" or omit entirely.",
    });
  }

  return issues;
}

function checkLinks(html: string, existingPaths: string[], existingPostSlugs: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const validPaths = new Set(existingPaths);
  for (const slug of existingPostSlugs) validPaths.add(`/${slug}`);

  const hrefRegex = /href=["'](\/[^"'#?]*)["']/g;
  let match: RegExpExecArray | null;
  const broken: string[] = [];

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (href === "/") continue;
    const norm = href.endsWith("/") && href.length > 1 ? href.slice(0, -1) : href;
    if (!validPaths.has(norm) && !validPaths.has(href)) broken.push(href);
  }

  if (broken.length > 0) {
    issues.push({ type: "link",
      description: `${broken.length} broken link(s): ${broken.slice(0, 3).join(", ")}`,
      fixInstruction: `Fix broken links. Valid pages: ${existingPaths.slice(0, 15).join(", ")}` });
  }

  if ((html.match(/href=["'][^"']*\.html["']/gi) || []).length > 0) {
    issues.push({ type: "link", description: "Links with .html extension.",
      fixInstruction: "Remove .html from all href values." });
  }

  return issues;
}
