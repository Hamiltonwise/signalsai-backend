/**
 * Strips noisy, non-semantic content from a rendered HTML homepage before
 * feeding it to an LLM for analysis. Typical reductions: 100–200kB → 20–40kB.
 *
 * Kept:
 *   - All visible text, headings, links, forms, images (with alt/href/title).
 *   - meta tags, schema.org microdata (itemprop/itemscope/itemtype).
 *   - aria-*, role, lang, content attributes.
 *
 * Dropped:
 *   - <script>, <style>, <noscript>, preload/prefetch <link>s.
 *   - HTML comments.
 *   - Large inline <svg> bodies (replaced with placeholder).
 *   - base64 data: URLs on <img src>.
 *   - Inline `style` attributes.
 *   - Collapsed repeated whitespace.
 */

import * as cheerio from "cheerio";

export interface StripResult {
  html: string;
  originalSizeKB: number;
  strippedSizeKB: number;
  reductionPct: number;
}

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
