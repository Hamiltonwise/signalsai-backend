import type { ComposedLobPostcard, OrgRevealContext, PracticeAddress } from "./types";

/**
 * Card 4: Lob postcard composition.
 *
 * Front: practice name, Alloro mark. Back: short handwritten-style note,
 * site URL, signature. No marketing-speak. No "launch" language.
 * Cesar Millan: owner is the hero.
 */

const US_STATE_PATTERN = /^[A-Z]{2}$/;
const US_ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

export function validateAddress(addr: PracticeAddress | null): PracticeAddress {
  if (!addr) {
    return {
      line1: "",
      city: "",
      state: "",
      zip: "",
      valid: false,
      reason: "no_address_on_file",
    };
  }
  const reasons: string[] = [];
  if (!addr.line1?.trim()) reasons.push("missing_line1");
  if (!addr.city?.trim()) reasons.push("missing_city");
  const stateUpper = (addr.state || "").trim().toUpperCase();
  if (!stateUpper) reasons.push("missing_state");
  else if (!US_STATE_PATTERN.test(stateUpper)) reasons.push("invalid_state");
  const zip = (addr.zip || "").trim();
  if (!zip) reasons.push("missing_zip");
  else if (!US_ZIP_PATTERN.test(zip)) reasons.push("invalid_zip");

  if (reasons.length > 0) {
    return {
      line1: addr.line1 || "",
      city: addr.city || "",
      state: stateUpper,
      zip,
      valid: false,
      reason: reasons.join(","),
    };
  }

  return {
    line1: addr.line1.trim(),
    city: addr.city.trim(),
    state: stateUpper,
    zip,
    valid: true,
  };
}

function shortUrl(full: string | null): string {
  if (!full) return "";
  // Strip protocol and trailing slashes for the postcard.
  return full
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function composeRevealPostcard(org: OrgRevealContext): ComposedLobPostcard {
  const checkedAddress = validateAddress(org.practiceAddress);
  const url = shortUrl(org.shortSiteUrl ?? org.siteUrl);
  const name = org.name || "Your practice";
  const displayName = name.length > 60 ? `${name.slice(0, 57)}…` : name;

  const frontHtml = `
    <html><body style="margin:0; padding:0; font-family: Georgia, serif; background:#F6F1EA;">
      <div style="padding: 56px 40px; text-align:center;">
        <div style="font-size: 11px; letter-spacing: 3px; color:#64748b; text-transform: uppercase; margin-bottom: 32px;">A Note From Alloro</div>
        <div style="font-size: 30px; color:#1A1D23; font-weight: 600; line-height: 1.2;">${escapeHtml(displayName)}</div>
        <div style="height: 2px; width: 64px; background:#D56753; margin: 32px auto;"></div>
        <div style="font-size: 14px; color:#334155; font-style: italic;">your new home is live</div>
      </div>
    </body></html>
  `.trim();

  // Handwritten-style back. Short. Nothing marketing.
  const backLines = [
    `${displayName} -`,
    `your new home is live.`,
    url ? url : "",
    `We will keep making it better.`,
    `- The Alloro team`,
  ].filter(Boolean);

  const backHtml = `
    <html><body style="margin:0; padding:0; font-family: 'Caveat', 'Bradley Hand', cursive; background:#FFFBF4;">
      <div style="padding: 48px 44px; color:#1A1D23; font-size: 22px; line-height: 1.6;">
        ${backLines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}
      </div>
    </body></html>
  `.trim();

  return {
    to: {
      name,
      address_line1: checkedAddress.line1 || "Practice address pending",
      address_city: checkedAddress.city,
      address_state: checkedAddress.state,
      address_zip: checkedAddress.zip || "00000",
    },
    front: frontHtml,
    back: backHtml,
    description: `Alloro reveal postcard for ${name}`,
    size: "4x6",
    addressValid: checkedAddress.valid,
  };
}
