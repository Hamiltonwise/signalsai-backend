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
