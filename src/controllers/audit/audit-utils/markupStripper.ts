/**
 * Strips noisy, non-semantic content from a rendered HTML homepage before
 * feeding it to an LLM for analysis. Typical reductions: 100–200kB → 25–35kB
 * (post-2026-04-25 tightening; was 60–80kB before).
 *
 * Kept:
 *   - All visible text, headings, links, forms, images (with alt/href/title).
 *   - meta tags, schema.org microdata (itemprop/itemscope/itemtype).
 *   - aria-*, role, lang, content attributes.
 *   - Short semantic class/id values (≤60 chars, ≤5 tokens for class).
 *   - SEO-relevant link tags: rel="canonical", rel="alternate".
 *   - Test/role data attrs: data-type, data-role, data-cy.
 *
 * Dropped:
 *   - <script>, <style>, <noscript>, preload/prefetch <link>s.
 *   - HTML comments.
 *   - Large inline <svg> bodies (replaced with placeholder).
 *   - base64 data: URLs on <img src>.
 *   - Inline `style` attributes.
 *   - Framework utility class strings (>60 chars OR >5 space-separated
 *     tokens — Tailwind/Bootstrap utility lists, MUI generated classes).
 *   - Most data-* attributes (kept: data-type, data-role, data-cy).
 *   - Long generated `id` values (>30 chars — typically framework-emitted).
 *   - <head> <link> tags except canonical/alternate (no preconnect/dns-prefetch
 *     /icon — none of which inform the analysis).
 *   - aria-hidden="true" subtrees (decorative-only).
 *   - Collapsed repeated whitespace.
 */

import * as cheerio from "cheerio";

export interface StripResult {
  html: string;
  originalSizeKB: number;
  strippedSizeKB: number;
  reductionPct: number;
}

// Class strings longer than this OR with more space-separated tokens than
// MAX_CLASS_TOKENS are treated as framework utility lists (Tailwind, etc.)
// and dropped. Short semantic class names like "phone" or "hero-cta"
// survive — those tell the LLM something useful about element role.
const MAX_CLASS_LENGTH = 60;
const MAX_CLASS_TOKENS = 5;

// Generated `id` values from React/Vue/Angular tend to be 36-char UUIDs or
// hash-suffixed strings. Short ids ("contact", "footer") are usually
// hand-written and semantic; keep them.
const MAX_ID_LENGTH = 30;

// Data attributes worth keeping. Everything else is framework state noise
// (data-v-xxx for Vue, data-react-id, data-emotion, data-styled, etc.).
const PRESERVED_DATA_ATTRS = new Set(["data-type", "data-role", "data-cy"]);

// <head> <link> rels worth keeping for SEO/structure signals. Everything
// else (preconnect, dns-prefetch, icon, manifest, apple-touch-icon, etc.)
// is layout/perf noise that doesn't affect website-analysis grading.
const PRESERVED_LINK_RELS = new Set(["canonical", "alternate"]);

export function stripMarkupForLLM(html: string): StripResult {
  const originalSize = html.length;
  const $ = cheerio.load(html);

  // Remove non-content elements
  $(
    "script, style, noscript, link[rel='preload'], link[rel='prefetch'], link[rel='modulepreload']"
  ).remove();

  // Remove HTML comments (walk all descendants)
  $("*")
    .contents()
    .each((_, node) => {
      if ((node as { type?: string }).type === "comment") {
        $(node).remove();
      }
    });

  // Replace large inline SVGs with a short placeholder
  $("svg").each((_, el) => {
    const outer = $.html(el) ?? "";
    if (outer.length > 300) {
      $(el).replaceWith("<svg><!-- stripped --></svg>");
    }
  });

  // Strip base64 data URLs on images (keeps the element, drops the payload)
  $("img[src^='data:']").attr("src", "[data-url]");
  $("source[srcset^='data:']").removeAttr("srcset");

  // Strip inline styles
  $("[style]").removeAttr("style");

  // Drop decorative-only subtrees flagged by ARIA. These exist purely for
  // visual styling and are explicitly hidden from accessibility tools —
  // the LLM has no business reading them either.
  $("[aria-hidden='true']").remove();

  // Drop <head> <link> tags that aren't SEO-relevant. Canonical and
  // alternate are kept (canonical URL is a real signal; alternate covers
  // hreflang / RSS).
  $("head link[rel]").each((_, el) => {
    const rel = ($(el).attr("rel") || "").toLowerCase();
    if (!PRESERVED_LINK_RELS.has(rel)) {
      $(el).remove();
    }
  });

  // Drop framework utility class strings. Heuristic: long classes or many
  // tokens = generated/utility-first; short = semantic. Conservative.
  $("[class]").each((_, el) => {
    const cls = $(el).attr("class") || "";
    const tokens = cls.trim().split(/\s+/).filter(Boolean);
    if (cls.length > MAX_CLASS_LENGTH || tokens.length > MAX_CLASS_TOKENS) {
      $(el).removeAttr("class");
    }
  });

  // Drop generated `id` values. Short semantic ids (contact, footer) survive.
  $("[id]").each((_, el) => {
    const id = $(el).attr("id") || "";
    if (id.length > MAX_ID_LENGTH) {
      $(el).removeAttr("id");
    }
  });

  // Drop framework state data-* attributes. Walk every element with any
  // data-* attr and prune the non-semantic ones. cheerio doesn't have a
  // native [data-*] selector, so iterate all elements and check attribs.
  $("*").each((_, el) => {
    const attribs = (el as { attribs?: Record<string, string> }).attribs;
    if (!attribs) return;
    for (const name of Object.keys(attribs)) {
      if (name.startsWith("data-") && !PRESERVED_DATA_ATTRS.has(name)) {
        $(el).removeAttr(name);
      }
    }
  });

  // Collapse whitespace
  let out = $.html() ?? "";
  out = out.replace(/\s{2,}/g, " ").replace(/>\s+</g, "><").trim();

  const strippedSize = out.length;
  const reductionPct =
    originalSize > 0 ? Math.round((1 - strippedSize / originalSize) * 100) : 0;

  return {
    html: out,
    originalSizeKB: Math.round(originalSize / 1024),
    strippedSizeKB: Math.round(strippedSize / 1024),
    reductionPct,
  };
}
