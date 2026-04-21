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
 * Strip LLM-emitted inline styles that the generator contract forbids.
 *
 * Allowed on ANY element (templates legitimately use these):
 *   - `background:` / `background-image:` / `background-color:`
 *     (hero sections ship with gradient-over-image backgrounds in the
 *     template markup; stripping these kills the visual design)
 *
 * Stripped: everything else (opacity, color, width, positioning, etc.) —
 * those are the drift signals we actually care about.
 */
function stripInlineStyles($: cheerio.CheerioAPI): number {
  let stripped = 0;
  $("[style]").each((_, el) => {
    const $el = $(el);
    const raw = ($el.attr("style") || "").trim();
    if (!raw) {
      $el.removeAttr("style");
      return;
    }
    // Keep only background-* declarations; drop everything else.
    const kept = raw
      .split(";")
      .map((decl) => decl.trim())
      .filter((decl) => decl.length > 0)
      .filter((decl) => /^background(-image|-color|-position|-size|-repeat)?\s*:/i.test(decl));

    if (kept.length === 0) {
      $el.removeAttr("style");
      stripped++;
      return;
    }

    const next = kept.join("; ") + ";";
    if (next !== raw) {
      $el.attr("style", next);
      if (kept.length < raw.split(";").filter((s) => s.trim()).length) {
        stripped++;
      }
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

const PLACEHOLDER_URL = "app.getalloro.com/api/imports/placeholder.png";

/**
 * Drop anchor wrappers whose only child is a placeholder <img>. Applies
 * only to "logo-wall" style sections — ones whose class namespace contains
 * `associations`, `affiliat`, `memberships`, `badges`, or `trust` — so we
 * don't accidentally strip a legitimate placeholder elsewhere (e.g. a
 * hero that's still loading a real image on refresh).
 */
function dropPlaceholderLogoSlots($: cheerio.CheerioAPI): number {
  let dropped = 0;
  const groupHints = /(associations|affiliat|memberships|badges|trust-badges|logo-wall)/i;

  // Collect candidate containers: any ancestor whose class string hints
  // at a logo-wall group.
  const candidateContainers: cheerio.Cheerio<any>[] = [];
  $("[class]").each((_, el) => {
    const $el = $(el);
    const cls = $el.attr("class") || "";
    if (groupHints.test(cls)) {
      candidateContainers.push($el);
    }
  });

  const seen = new Set<any>();
  for (const $container of candidateContainers) {
    const raw = $container.get(0);
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);

    $container.find("a, div").each((_, el) => {
      const $slot = $(el);
      const $img = $slot.find("img").first();
      if ($img.length === 0) return;
      const src = $img.attr("src") || "";
      if (!src.includes(PLACEHOLDER_URL)) return;
      // Only strip if this element is a leaf-ish logo slot: contains just
      // an <img> (plus whitespace), no heading / paragraph siblings inside.
      const nonImgChildren = $slot
        .children()
        .filter((_i, c) => (c as any).tagName?.toLowerCase?.() !== "img");
      if (nonImgChildren.length > 0) return;
      $slot.remove();
      dropped++;
    });
  }
  return dropped;
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
  placeholderSlotsDropped: number;
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
        placeholderSlotsDropped: 0,
      },
    };
  }

  const $ = cheerio.load(html, { xml: false }, false);

  const shortcodeMarkersEnforced = enforceShortcodeMarkers($);
  const inlineStylesStripped = stripInlineStyles($);
  const badgeAnchorsConverted = convertBadgeAnchorsToSpan($);
  const buttonRadiiRewritten = normalizeButtonRadius($);
  const placeholderSlotsDropped = dropPlaceholderLogoSlots($);

  return {
    html: $.html() || html,
    report: {
      inlineStylesStripped,
      badgeAnchorsConverted,
      buttonRadiiRewritten,
      shortcodeMarkersEnforced,
      placeholderSlotsDropped,
    },
  };
}
