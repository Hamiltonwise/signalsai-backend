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
      fixInstruction: "Replace ALL color/opacity variants with inline style. bg-primary/10 → style=\"background:rgba(35,35,35,0.1)\". text-white/80 → style=\"color:rgba(255,255,255,0.8)\". bg-white/10 → style=\"background:rgba(255,255,255,0.1)\"." });
  }

  // bg-opacity-*, border-opacity-* utilities
  const legacyOpacity = html.match(/(?:bg|border|text)-opacity-\d+/g) || [];
  if (legacyOpacity.length > 0) {
    issues.push({ type: "ui",
      description: `Legacy opacity utilities (${[...new Set(legacyOpacity)].join(", ")}) fail with CDN.`,
      fixInstruction: "Replace bg-opacity-10 with inline style=\"background:rgba(...)\"." });
  }

  // Gradient classes with brand colors
  const brandGradients = html.match(/(?:from|to|via)-(?:primary|accent)(?:\/\d+)?/g) || [];
  if (brandGradients.length > 0) {
    issues.push({ type: "ui",
      description: `Gradient with brand colors (${[...new Set(brandGradients)].join(", ")}) fails with CSS custom properties.`,
      fixInstruction: "Replace gradient classes with inline style=\"background:linear-gradient(...)\". Use solid bg-primary or bg-accent for non-gradient backgrounds." });
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
