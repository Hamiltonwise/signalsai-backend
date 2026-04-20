/**
 * Post-Generation HTML Normalizer
 *
 * Deterministic cheerio pass over generator output. Enforces rules the
 * ComponentGenerator prompt is supposed to follow but sometimes drifts on:
 *
 *   1. Strip `style="..."` attributes except whitelisted CSS-variable
 *      backgrounds on <section> elements.
 *   2. Convert tag/badge-shaped <a> elements (padding utilities, no real
 *      href) to <span>.
 *   3. Normalize mixed button radii — when a section contains both
 *      `rounded-full` and `rounded-lg`/`rounded-xl`/`rounded-md` CTAs,
 *      rewrite the minority shape to match the dominant one. This is a
 *      best-effort guardrail; the authoritative fix belongs in the
 *      prompt contract.
 *
 * Idempotent — running the normalizer twice produces the same output.
 */

import * as cheerio from "cheerio";

const RADIUS_TOKENS = ["rounded-full", "rounded-lg", "rounded-xl", "rounded-md"] as const;
type RadiusToken = (typeof RADIUS_TOKENS)[number];

const BADGE_TEXT_HINTS = [
  "diplomate",
  "board certified",
  "board-certified",
  "fellow",
  "member",
  "certified",
  "award",
  "society",
  "accredited",
  "ada ",
  "dds",
  "dmd",
  "specialist",
];

function isMeaningfulHref(href: string | undefined): boolean {
  if (!href) return false;
  const h = href.trim();
  if (!h || h === "#" || h.startsWith("#")) return false;
  return true;
}

function hasPaddingUtilities(cls: string): boolean {
  return /\bpx-\S+/.test(cls) && /\bpy-\S+/.test(cls);
}

function currentRadius(cls: string): RadiusToken | null {
  for (const r of RADIUS_TOKENS) {
    if (new RegExp(`\\b${r}\\b`).test(cls)) return r;
  }
  return null;
}

function replaceRadius(cls: string, from: RadiusToken, to: RadiusToken): string {
  return cls.replace(new RegExp(`\\b${from}\\b`, "g"), to);
}

/**
 * Strip LLM-emitted inline styles. Preserves only <section style="background: var(...)">
 * which the template itself may legitimately use.
 */
function stripInlineStyles($: cheerio.CheerioAPI): number {
  let stripped = 0;
  $("[style]").each((_, el) => {
    const $el = $(el);
    const style = ($el.attr("style") || "").trim();
    const tag = (el as any).tagName?.toLowerCase?.() || "";
    const allowed =
      tag === "section" && /^background\s*:\s*var\(/i.test(style);
    if (!allowed) {
      $el.removeAttr("style");
      stripped++;
    }
  });
  return stripped;
}

/**
 * Convert obvious credential/badge <a> nodes (padding utilities, no real
 * href, text matches a known credential pattern) to <span>.
 */
function convertBadgeAnchorsToSpan($: cheerio.CheerioAPI): number {
  let converted = 0;
  $("a").each((_, el) => {
    const $el = $(el);
    const cls = $el.attr("class") || "";
    if (!hasPaddingUtilities(cls)) return;
    if (isMeaningfulHref($el.attr("href"))) return;
    const text = ($el.text() || "").trim().toLowerCase();
    if (!text) return;
    const looksLikeBadge = BADGE_TEXT_HINTS.some((hint) => text.includes(hint));
    if (!looksLikeBadge) return;

    const span = $("<span></span>");
    if (cls) span.attr("class", cls);
    span.html($el.html() || "");
    $el.replaceWith(span);
    converted++;
  });
  return converted;
}

/**
 * Enforce the `<!-- ALLORO_SHORTCODE: <type> -->` marker contract. For any
 * element containing the marker as a direct child comment, strip all of
 * its NON-heading/subheading children, and if the region lacks the
 * matching shortcode token, inject it. This guards against the LLM
 * fabricating cards inside a shortcode-owned region.
 */
const SHORTCODE_TOKEN_BY_TYPE: Record<string, string> = {
  doctors: "[post_block type=\"doctors\"]",
  services: "[post_block type=\"services\"]",
  reviews: "[review_block]",
  posts: "[post_block type=\"posts\"]",
  locations: "[post_block type=\"locations\"]",
};

function enforceShortcodeMarkers($: cheerio.CheerioAPI): number {
  let enforced = 0;

  $("*").each((_, el) => {
    const $el = $(el);
    const contents = $el.contents();
    let markerType: string | null = null;
    contents.each((_i, node) => {
      if ((node as any).type !== "comment") return;
      const data = String((node as any).data || "");
      const m = data.match(/ALLORO_SHORTCODE\s*:\s*([a-z_]+)/i);
      if (m) markerType = m[1].toLowerCase();
    });
    if (!markerType) return;

    const token = SHORTCODE_TOKEN_BY_TYPE[markerType];
    if (!token) return;

    const innerHtml = $el.html() || "";
    const hasToken =
      innerHtml.includes(token) ||
      /\[(post_block|review_block)[^\]]*\]/.test(innerHtml);

    const preserved: string[] = [];
    contents.each((_i, node) => {
      const n = node as any;
      if (n.type === "comment") {
        preserved.push(`<!--${n.data}-->`);
        return;
      }
      if (n.type === "text") {
        const text = String(n.data || "").trim();
        if (text) preserved.push(n.data);
        return;
      }
      if (n.type === "tag") {
        const tag = String(n.name || "").toLowerCase();
        if (["h1", "h2", "h3", "h4", "h5", "h6", "p"].includes(tag)) {
          preserved.push($.html(node as any));
        }
      }
    });
    if (!hasToken) preserved.push(token);

    $el.html(preserved.join("\n"));
    enforced++;
  });

  return enforced;
}

/**
 * If CTA elements on the page mix rounded-full with rounded-lg/xl/md,
 * rewrite the minority shape to match the dominant one. Only touches
 * elements that already have padding utilities (i.e., genuine buttons).
 */
function normalizeButtonRadius($: cheerio.CheerioAPI): number {
  const radiusCount: Record<RadiusToken, number> = {
    "rounded-full": 0,
    "rounded-lg": 0,
    "rounded-xl": 0,
    "rounded-md": 0,
  };
  const buttons: Array<{ el: cheerio.Cheerio<any>; radius: RadiusToken }> = [];

  $("a, button").each((_, el) => {
    const $el = $(el);
    const cls = $el.attr("class") || "";
    if (!hasPaddingUtilities(cls)) return;
    const r = currentRadius(cls);
    if (!r) return;
    radiusCount[r]++;
    buttons.push({ el: $el, radius: r });
  });

  const pill = radiusCount["rounded-full"];
  const rect =
    radiusCount["rounded-lg"] + radiusCount["rounded-xl"] + radiusCount["rounded-md"];

  if (pill === 0 || rect === 0) return 0;

  const dominant: RadiusToken =
    pill >= rect ? "rounded-full" : "rounded-lg";

  let rewritten = 0;
  for (const { el, radius } of buttons) {
    if (radius === dominant) continue;
    if (dominant === "rounded-full" && radius === "rounded-full") continue;
    const cls = el.attr("class") || "";
    el.attr("class", replaceRadius(cls, radius, dominant));
    rewritten++;
  }
  return rewritten;
}

export interface NormalizerReport {
  inlineStylesStripped: number;
  badgeAnchorsConverted: number;
  buttonRadiiRewritten: number;
  shortcodeMarkersEnforced: number;
}

/**
 * Run all normalization rules over the given HTML fragment (typically a
 * single <section>...</section> component) and return the cleaned HTML
 * plus a report of what changed.
 */
export function normalizeComponentHtml(
  html: string,
): { html: string; report: NormalizerReport } {
  if (!html || typeof html !== "string") {
    return {
      html: html || "",
      report: {
        inlineStylesStripped: 0,
        badgeAnchorsConverted: 0,
        buttonRadiiRewritten: 0,
        shortcodeMarkersEnforced: 0,
      },
    };
  }

  const $ = cheerio.load(html, { xml: false }, false);

  const shortcodeMarkersEnforced = enforceShortcodeMarkers($);
  const inlineStylesStripped = stripInlineStyles($);
  const badgeAnchorsConverted = convertBadgeAnchorsToSpan($);
  const buttonRadiiRewritten = normalizeButtonRadius($);

  return {
    html: $.html() || html,
    report: {
      inlineStylesStripped,
      badgeAnchorsConverted,
      buttonRadiiRewritten,
      shortcodeMarkersEnforced,
    },
  };
}
