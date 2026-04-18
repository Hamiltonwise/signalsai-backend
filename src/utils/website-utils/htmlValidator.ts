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
  issues.push(...checkContrastPairs(html));
  issues.push(...checkProseStyle(html));
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

  // Multiple top-level <section> tags — the generator produces ONE section per component.
  // More than one usually means the AI invented additional sibling sections.
  const topLevelSectionCount = (html.match(/<section\b/gi) || []).length;
  if (topLevelSectionCount > 1) {
    issues.push({ type: "ui",
      description: `Output contains ${topLevelSectionCount} <section> elements — component should have exactly one.`,
      fixInstruction: "Keep only the root <section>. Merge content into it or remove invented sub-sections. Template structural fidelity: do not add sibling sections." });
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

/**
 * Flags banned foreground/background Tailwind combinations that produce
 * unreadable contrast. Scans each element's class attribute as a unit so a
 * `bg-white` on element A and `text-white` on element B don't falsely pair.
 */
function checkContrastPairs(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const LIGHT_BG = /\b(?:bg-white|bg-gray-50|bg-gray-100|bg-primary-subtle|bg-accent-subtle)\b/;
  const DARK_BG = /\b(?:bg-primary|bg-accent|bg-gradient-brand|bg-gray-800|bg-gray-900)\b/;
  const LIGHT_TEXT = /\b(?:text-white|text-gray-100|text-gray-200)\b/;
  const DARK_TEXT = /\b(?:text-gray-900|text-gray-800|text-gray-700)\b/;

  const classAttrs = html.match(/class=["'][^"']+["']/gi) || [];
  let lightBgWithLightText = 0;
  let darkBgWithDarkText = 0;
  const offendingClasses: string[] = [];

  for (const attr of classAttrs) {
    const hasLightBg = LIGHT_BG.test(attr);
    const hasDarkBg = DARK_BG.test(attr);
    const hasLightText = LIGHT_TEXT.test(attr);
    const hasDarkText = DARK_TEXT.test(attr);

    // bg-accent-subtle is a special case — it's tinted, not dark — so only exclude bg-primary when exclusion is needed.
    // A class attr that has BOTH a light bg and bg-accent/bg-primary is rare; treat it as dark-bg dominant.
    if (hasLightBg && !hasDarkBg && hasLightText) {
      lightBgWithLightText++;
      if (offendingClasses.length < 2) offendingClasses.push(attr.replace(/^class=["']|["']$/g, ""));
    }
    if (hasDarkBg && hasDarkText) {
      darkBgWithDarkText++;
      if (offendingClasses.length < 2) offendingClasses.push(attr.replace(/^class=["']|["']$/g, ""));
    }
  }

  if (lightBgWithLightText > 0) {
    issues.push({ type: "ui",
      description: `${lightBgWithLightText} element(s) combine light text (text-white/gray-100/200) with a light background — unreadable.`,
      fixInstruction: `Change to text-gray-900 or text-gray-800 for text on light backgrounds. Offending class attr example: ${offendingClasses[0] || "(none)"}` });
  }
  if (darkBgWithDarkText > 0) {
    issues.push({ type: "ui",
      description: `${darkBgWithDarkText} element(s) combine dark text (text-gray-700/800/900) with a dark background — unreadable.`,
      fixInstruction: `Change to text-white or text-gray-100 for text on dark backgrounds. Offending class attr example: ${offendingClasses[offendingClasses.length - 1] || "(none)"}` });
  }

  return issues;
}

/**
 * Flags prose-level AI tells. Currently catches em-dashes and en-dashes in
 * visible text content. Matches against text outside tags; shortcodes like
 * `{{slot}}` and `[post_block]` pass through.
 */
function checkProseStyle(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Strip tag innards, style blocks, and shortcodes before scanning.
  const textOnly = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[[^\]]+\]/g, "");

  const dashMatches = textOnly.match(/[—–]/g) || [];
  if (dashMatches.length > 0) {
    issues.push({ type: "ui",
      description: `${dashMatches.length} em-dash/en-dash character(s) in prose — AI tell.`,
      fixInstruction: "Replace every — and – in visible copy with a comma, period, colon, or parentheses. Do not touch shortcodes." });
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
  const allValidPaths = [...existingPaths];
  for (const slug of existingPostSlugs) allValidPaths.push(`/${slug}`);
  const validPathSet = new Set(allValidPaths);

  const hrefRegex = /href=["'](\/[^"'#?]*)["']/g;
  let match: RegExpExecArray | null;
  const broken: string[] = [];

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (href === "/") continue;
    const norm = href.endsWith("/") && href.length > 1 ? href.slice(0, -1) : href;
    if (!validPathSet.has(norm) && !validPathSet.has(href)) broken.push(href);
  }

  if (broken.length > 0) {
    // For each broken link, find the closest matching valid path
    const suggestions = broken.map((href) => {
      const best = findClosestPath(href, allValidPaths);
      return best ? `${href} → ${best}` : `${href} → REMOVE (no close match)`;
    });

    issues.push({ type: "link",
      description: `${broken.length} broken link(s): ${broken.slice(0, 5).join(", ")}`,
      fixInstruction: `Fix each broken link using the suggested replacement:\n${suggestions.join("\n")}\nIf the suggestion says REMOVE, either remove the link entirely or replace with /contact.` });
  }

  if ((html.match(/href=["'][^"']*\.html["']/gi) || []).length > 0) {
    issues.push({ type: "link", description: "Links with .html extension.",
      fixInstruction: "Remove .html from all href values." });
  }

  return issues;
}

/**
 * Find the closest matching valid path for a broken link using segment similarity.
 */
function findClosestPath(broken: string, validPaths: string[]): string | null {
  const brokenSegments = broken.toLowerCase().split("/").filter(Boolean);
  if (brokenSegments.length === 0) return null;

  let bestPath: string | null = null;
  let bestScore = 0;

  for (const valid of validPaths) {
    const validSegments = valid.toLowerCase().split("/").filter(Boolean);

    let score = 0;
    for (const bs of brokenSegments) {
      for (const vs of validSegments) {
        if (bs === vs) {
          score += 3;
        } else if (vs.includes(bs) || bs.includes(vs)) {
          score += 2;
        } else if (levenshteinDistance(bs, vs) <= 2) {
          score += 1;
        }
      }
    }

    if (validSegments.length === brokenSegments.length) score += 1;

    const lastBroken = brokenSegments[brokenSegments.length - 1];
    const lastValid = validSegments[validSegments.length - 1];
    if (lastBroken && lastValid && (lastBroken === lastValid || lastValid.includes(lastBroken) || lastBroken.includes(lastValid))) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestPath = valid;
    }
  }

  return bestScore >= 2 ? bestPath : null;
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > 3) return Math.max(a.length, b.length);

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}
