import type { Section } from "./types";

/**
 * Walk a section tree and yield text-bearing fragments along with location metadata.
 * Supports nested children and html strings so any gate can scan the full page.
 */
export interface TextFragment {
  text: string;
  sectionIndex: number;
  sectionType?: string;
  field: string;
}

export function extractTextFragments(sections: Section[]): TextFragment[] {
  const fragments: TextFragment[] = [];

  sections.forEach((section, sectionIndex) => {
    collect(section, sectionIndex, section.type, fragments, "");
  });

  return fragments;
}

function collect(
  node: unknown,
  sectionIndex: number,
  sectionType: string | undefined,
  out: TextFragment[],
  fieldPath: string
): void {
  if (node == null) return;

  if (typeof node === "string") {
    const text = node.trim();
    if (text.length > 0) {
      out.push({ text: node, sectionIndex, sectionType, field: fieldPath || "text" });
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item, idx) => {
      collect(item, sectionIndex, sectionType, out, `${fieldPath}[${idx}]`);
    });
    return;
  }

  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const nextPath = fieldPath ? `${fieldPath}.${key}` : key;
      collect(value, sectionIndex, sectionType, out, nextPath);
    }
  }
}

/**
 * Strip HTML tags to leave plain text for human-readability checks.
 * Keeps alt attributes accessible via dedicated extractor below.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export interface AltEntry {
  alt: string;
  sectionIndex: number;
  sectionType?: string;
  field: string;
}

export function extractAltTexts(sections: Section[]): AltEntry[] {
  const out: AltEntry[] = [];
  const fragments = extractTextFragments(sections);
  for (const frag of fragments) {
    const fieldLower = frag.field.toLowerCase();
    if (fieldLower.endsWith("alt") || fieldLower.includes("alttext") || fieldLower.includes("alt_text")) {
      out.push({
        alt: frag.text,
        sectionIndex: frag.sectionIndex,
        sectionType: frag.sectionType,
        field: frag.field,
      });
    }
  }

  // Also mine HTML fragments for alt="..." attributes
  for (const frag of fragments) {
    if (/<[^>]+alt\s*=/.test(frag.text)) {
      const regex = /alt\s*=\s*"([^"]*)"|alt\s*=\s*'([^']*)'/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(frag.text)) !== null) {
        const val = match[1] ?? match[2] ?? "";
        if (val.length > 0) {
          out.push({
            alt: val,
            sectionIndex: frag.sectionIndex,
            sectionType: frag.sectionType,
            field: `${frag.field}:alt-attr`,
          });
        }
      }
    }
  }

  return out;
}

export function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
