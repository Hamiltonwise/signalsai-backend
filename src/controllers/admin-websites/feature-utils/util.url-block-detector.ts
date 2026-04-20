/**
 * URL Block Detector
 *
 * Inspects a single HTTP response and decides whether the URL is blocked
 * by a WAF, anti-bot service, or CAPTCHA challenge. Critical principle:
 * content-based rules run on every response, regardless of HTTP status,
 * because Cloudflare (and others) frequently return 200 OK with a
 * challenge page instead of a real block status.
 */

import axios from "axios";

export type BlockVendor =
  | "cloudflare"
  | "akamai"
  | "sucuri"
  | "datadome"
  | "perimeterx"
  | "imperva"
  | "kasada"
  | "aws_waf"
  | "f5_bigip"
  | "fastly"
  | "generic_waf"
  | "captcha"
  | "rate_limit"
  | "forbidden"
  | "timeout"
  | "empty"
  | "unknown";

export type BlockCheckResult =
  | {
      ok: true;
      status: number;
      preview_chars: number;
      preview_text: string;
      /**
       * Orthogonal signal to `ok`. True when the response passed block
       * detection but the visible body has < 500 non-whitespace chars — a
       * common signature of JS-hydrated SPAs that warmup would scrape empty.
       * Not a replacement for the ≥ 200 empty-body threshold below.
       */
      thin_content?: boolean;
    }
  | {
      ok: false;
      block_type: BlockVendor;
      status: number | null;
      detail: string;
      detected_signals: string[];
    };

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export async function detectBlock(url: string): Promise<BlockCheckResult> {
  try {
    new URL(url);
  } catch {
    return {
      ok: false,
      block_type: "unknown",
      status: null,
      detail: "Invalid URL",
      detected_signals: ["invalid_url"],
    };
  }

  let response: any;
  try {
    response = await axios.get(url, {
      timeout: DEFAULT_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true, // we analyze all status codes
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // axios cannot stream only N bytes natively; we rely on response size filter below
    });
  } catch (err: any) {
    if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "")) {
      return {
        ok: false,
        block_type: "timeout",
        status: null,
        detail: `Request timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        detected_signals: ["timeout"],
      };
    }
    return {
      ok: false,
      block_type: "unknown",
      status: null,
      detail: err?.message || "Request failed",
      detected_signals: ["network_error"],
    };
  }

  const status = response.status;
  const headers = normalizeHeaders(response.headers);
  const bodyText = typeof response.data === "string"
    ? response.data
    : JSON.stringify(response.data);
  const body = bodyText.slice(0, 50_000); // cap analysis window
  const preview = body.slice(0, 2_000);

  // Status-only rules
  if (status === 429) {
    return {
      ok: false,
      block_type: "rate_limit",
      status,
      detail: "HTTP 429 Too Many Requests",
      detected_signals: ["http_429"],
    };
  }

  // Vendor detection — content + headers, runs on all statuses
  const signals: string[] = [];

  // --- Cloudflare ---
  if (/cloudflare/i.test(headers["server"] || "")) signals.push("server_cloudflare");
  if (headers["cf-ray"]) signals.push("cf_ray_header");
  if (headers["cf-cache-status"]) signals.push("cf_cache_status_header");
  if (headers["cf-mitigated"]) signals.push("cf_mitigated_header");
  const cookies = extractCookies(headers);
  if (cookies.some((c) => /^__cf_bm=|^cf_clearance=/.test(c))) {
    signals.push("cf_cookie");
  }
  const cfBodyMarkers = [
    "challenge-platform",
    "cf_chl_opt",
    "__cf_chl_jschl_tk__",
    "cf-browser-verification",
    "Just a moment...",
    "Attention Required | Cloudflare",
    "Checking your browser before accessing",
    "cdn-cgi/challenge-platform",
    "cloudflare.com/cdn-cgi/",
  ];
  for (const marker of cfBodyMarkers) {
    if (body.includes(marker)) signals.push(`cf_body_${slug(marker)}`);
  }

  // If any Cloudflare challenge marker is present, treat as blocked
  const isCfChallenge =
    signals.some((s) => s.startsWith("cf_body_") && s.includes("challenge")) ||
    signals.includes("cf_body_just_a_moment") ||
    signals.includes("cf_body_attention_required_cloudflare") ||
    signals.includes("cf_body_checking_your_browser_before_accessing") ||
    signals.includes("cf_mitigated_header");

  if (isCfChallenge) {
    return cfBlocked(status, signals);
  }

  // cf-ray alone with a tiny body is suspicious
  if (signals.includes("cf_ray_header") && body.length < 3_000 && status !== 200) {
    return cfBlocked(status, [...signals, "cf_ray_with_small_body"]);
  }

  // --- Akamai ---
  if (/akamaighost/i.test(headers["server"] || "")) signals.push("akamai_server");
  if (cookies.some((c) => /^(ak_bmsc|bm_sz|bm_mi|_abck)=/.test(c))) {
    signals.push("akamai_cookie");
  }
  if (body.includes("Access Denied") && /Reference\s*#\s*\d+/i.test(body)) {
    signals.push("akamai_access_denied");
  }
  if (body.includes("_abck=")) signals.push("akamai_abck_js");
  if (signals.some((s) => s.startsWith("akamai_"))) {
    return { ok: false, block_type: "akamai", status, detail: "Akamai WAF / Bot Manager", detected_signals: akamaiOnly(signals) };
  }

  // --- Sucuri ---
  if (/sucuri\/cloudproxy/i.test(headers["server"] || "")) signals.push("sucuri_server");
  if (body.includes("Sucuri WebSite Firewall") || body.includes("sucuri_cloudproxy")) {
    signals.push("sucuri_body");
  }
  if (signals.some((s) => s.startsWith("sucuri_"))) {
    return { ok: false, block_type: "sucuri", status, detail: "Sucuri WAF", detected_signals: sucuriOnly(signals) };
  }

  // --- DataDome ---
  if (cookies.some((c) => /^datadome=/.test(c))) signals.push("datadome_cookie");
  if (
    body.includes("datadome") ||
    body.includes("geo.captcha-delivery.com") ||
    body.includes("dd-captcha")
  ) {
    signals.push("datadome_body");
  }
  if (
    status === 403 &&
    (body.includes('"dd":') || body.includes('"captcha":')) &&
    body.includes("datadome")
  ) {
    signals.push("datadome_403_json");
  }
  if (signals.some((s) => s.startsWith("datadome_"))) {
    return { ok: false, block_type: "datadome", status, detail: "DataDome bot protection", detected_signals: ddOnly(signals) };
  }

  // --- PerimeterX / HUMAN ---
  if (cookies.some((c) => /^(_px|_pxhd|_pxvid)=/.test(c))) signals.push("px_cookie");
  if (
    body.includes("_pxhd") ||
    body.includes("pxCaptcha") ||
    body.includes("px-captcha") ||
    body.includes("perimeterx.net") ||
    body.includes("Please verify you are a human")
  ) {
    signals.push("px_body");
  }
  if (signals.some((s) => s.startsWith("px_"))) {
    return { ok: false, block_type: "perimeterx", status, detail: "PerimeterX / HUMAN Security", detected_signals: pxOnly(signals) };
  }

  // --- Imperva / Incapsula ---
  if (cookies.some((c) => /^(visid_incap_|incap_ses_)/.test(c))) signals.push("imperva_cookie");
  if (
    body.includes("_Incapsula_Resource") ||
    body.includes("incap_ses") ||
    body.includes("visid_incap") ||
    /Request unsuccessful\. Incapsula incident ID/i.test(body)
  ) {
    signals.push("imperva_body");
  }
  if (signals.some((s) => s.startsWith("imperva_"))) {
    return { ok: false, block_type: "imperva", status, detail: "Imperva / Incapsula", detected_signals: impervaOnly(signals) };
  }

  // --- Kasada ---
  if (cookies.some((c) => /^x-kpsdk-(ct|cd)=/.test(c))) signals.push("kasada_cookie");
  if (body.includes("/ips.js") && body.includes("bd-ready")) signals.push("kasada_body");
  if (signals.some((s) => s.startsWith("kasada_"))) {
    return { ok: false, block_type: "kasada", status, detail: "Kasada bot defense", detected_signals: kasadaOnly(signals) };
  }

  // --- AWS WAF ---
  if (
    status === 403 &&
    (headers["x-amzn-requestid"] || headers["x-amz-cf-id"]) &&
    (body.includes("Request blocked") || body.includes("<TITLE>403 Forbidden</TITLE>"))
  ) {
    return {
      ok: false,
      block_type: "aws_waf",
      status,
      detail: "AWS WAF block",
      detected_signals: ["aws_waf_403_request_blocked"],
    };
  }
  if (cookies.some((c) => /^AWSALB=/.test(c)) && status === 403) {
    return {
      ok: false,
      block_type: "aws_waf",
      status,
      detail: "AWS ELB + 403 (likely WAF)",
      detected_signals: ["aws_alb_403"],
    };
  }

  // --- F5 Big-IP ASM ---
  if (cookies.some((c) => /^(TS01|BIGipServer)/.test(c))) signals.push("f5_cookie");
  if (/The requested URL was rejected\. Please consult with your administrator/i.test(body)) {
    signals.push("f5_rejected_body");
  }
  if (signals.some((s) => s.startsWith("f5_"))) {
    return { ok: false, block_type: "f5_bigip", status, detail: "F5 Big-IP ASM", detected_signals: f5Only(signals) };
  }

  // --- Fastly ---
  if (
    (headers["via"] || "").toLowerCase().includes("fastly") &&
    body.includes("Request blocked")
  ) {
    return {
      ok: false,
      block_type: "fastly",
      status,
      detail: "Fastly block",
      detected_signals: ["fastly_via_request_blocked"],
    };
  }

  // --- Generic WAF / ModSecurity ---
  const genericMarkers = [
    "Mod_Security",
    "Generated by Wordfence",
    "You don't have permission to access",
  ];
  for (const m of genericMarkers) {
    if (body.includes(m)) signals.push(`generic_${slug(m)}`);
  }
  if (signals.some((s) => s.startsWith("generic_"))) {
    return {
      ok: false,
      block_type: "generic_waf",
      status,
      detail: "Generic WAF / ModSecurity",
      detected_signals: genericOnly(signals),
    };
  }

  // --- CAPTCHA detection (user cannot proceed) ---
  const captchaMarkers = [
    { marker: /class="h-captcha"|data-sitekey=["'][^"']+["'][^>]*h-captcha/i, name: "hcaptcha" },
    { marker: /class="g-recaptcha"|data-sitekey=["'][^"']+["'][^>]*recaptcha|google\.com\/recaptcha/i, name: "recaptcha" },
    { marker: /cdn\.turnstile\.cloudflare\.com|cf-turnstile/i, name: "cf_turnstile" },
    { marker: /gt_captcha|gt-captcha-box/i, name: "geetest" },
    { marker: /arkoselabs|funcaptcha/i, name: "arkose" },
    { marker: /Verify you are human|I'm not a robot|Please complete the security check/i, name: "captcha_text" },
  ];
  for (const { marker, name } of captchaMarkers) {
    if (marker.test(body)) signals.push(`captcha_${name}`);
  }
  if (signals.some((s) => s.startsWith("captcha_"))) {
    return {
      ok: false,
      block_type: "captcha",
      status,
      detail: "CAPTCHA required",
      detected_signals: captchaOnly(signals),
    };
  }

  // --- Last-resort rules ---
  if (status === 403) {
    return {
      ok: false,
      block_type: "forbidden",
      status,
      detail: "HTTP 403 Forbidden (no vendor signature matched)",
      detected_signals: ["http_403"],
    };
  }

  if (status === 503) {
    return {
      ok: false,
      block_type: "unknown",
      status,
      detail: "HTTP 503 Service Unavailable",
      detected_signals: ["http_503"],
    };
  }

  if (status >= 400) {
    return {
      ok: false,
      block_type: "unknown",
      status,
      detail: `HTTP ${status}`,
      detected_signals: [`http_${status}`],
    };
  }

  if (status === 200 && body.trim().length < 200) {
    return {
      ok: false,
      block_type: "empty",
      status,
      detail: "Response body too small — likely a JS-loaded shell we can't read",
      detected_signals: ["empty_body", `body_len_${body.length}`],
    };
  }

  return {
    ok: true,
    status,
    preview_chars: body.length,
    preview_text: preview,
    thin_content: preview.trim().length < 500,
  };
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function normalizeHeaders(headers: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
  }
  return out;
}

function extractCookies(headers: Record<string, string>): string[] {
  const raw = headers["set-cookie"];
  if (!raw) return [];
  return raw.split(/,(?=[^ ]+=)/).map((s) => s.trim());
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cfBlocked(
  status: number,
  signals: string[],
): BlockCheckResult {
  return {
    ok: false,
    block_type: "cloudflare",
    status,
    detail: "Cloudflare challenge or block",
    detected_signals: cfOnly(signals),
  };
}

function cfOnly(s: string[]): string[] {
  return s.filter((x) => x.startsWith("cf_") || x === "server_cloudflare");
}
function akamaiOnly(s: string[]): string[] {
  return s.filter((x) => x.startsWith("akamai_"));
}
function sucuriOnly(s: string[]): string[] {
  return s.filter((x) => x.startsWith("sucuri_"));
}
function ddOnly(s: string[]): string[] {
  return s.filter((x) => x.startsWith("datadome_"));
}
function pxOnly(s: string[]): string[] {
  return s.filter((x) => x.startsWith("px_"));
}
function impervaOnly(s: string[]): string[] {
  return s.filter((x) => x.startsWith("imperva_"));
}
function kasadaOnly(s: string[]): string[] {
  return s.filter((x) => x.startsWith("kasada_"));
}
function f5Only(s: string[]): string[] {
  return s.filter((x) => x.startsWith("f5_"));
}
function genericOnly(s: string[]): string[] {
  return s.filter((x) => x.startsWith("generic_"));
}
function captchaOnly(s: string[]): string[] {
  return s.filter((x) => x.startsWith("captcha_"));
}
