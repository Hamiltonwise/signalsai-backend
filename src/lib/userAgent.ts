/**
 * User-Agent parser for leadgen session ingest.
 *
 * Inline heuristics (no dependencies) matching the frontend `friendlyUserAgent`
 * helper in `frontend/src/components/Admin/LeadgenSubmissionsTable.tsx`. Returns
 * a structured triple used to populate the new `browser`, `os`, `device_type`
 * columns on `leadgen_sessions` (see migration 20260416000000).
 *
 * Returns nulls on missing/empty input. Never throws.
 */
export interface ParsedUserAgent {
  browser: string | null;
  os: string | null;
  device_type: "mobile" | "tablet" | "desktop" | null;
}

export function parseUserAgent(
  ua: string | null | undefined
): ParsedUserAgent {
  if (!ua || typeof ua !== "string" || ua.length === 0) {
    return { browser: null, os: null, device_type: null };
  }

  const u = ua.toLowerCase();

  let browser: string | null = null;
  if (u.includes("edg/") || u.includes("edge/")) browser = "Edge";
  else if (u.includes("chrome/") && !u.includes("chromium/")) browser = "Chrome";
  else if (u.includes("firefox/")) browser = "Firefox";
  else if (u.includes("safari/") && !u.includes("chrome/")) browser = "Safari";
  else if (u.includes("opera/") || u.includes("opr/")) browser = "Opera";

  let os: string | null = null;
  if (u.includes("iphone") || u.includes("ipad") || u.includes("ios")) os = "iOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("mac os") || u.includes("macintosh")) os = "macOS";
  else if (u.includes("windows")) os = "Windows";
  else if (u.includes("linux")) os = "Linux";

  // Device type — iPad is tablet, iPhone/Android phone is mobile, else desktop.
  let device_type: ParsedUserAgent["device_type"] = "desktop";
  if (u.includes("ipad") || u.includes("tablet")) {
    device_type = "tablet";
  } else if (
    u.includes("iphone") ||
    (u.includes("android") && u.includes("mobile"))
  ) {
    device_type = "mobile";
  } else if (u.includes("android")) {
    // Android without "mobile" in the UA is typically a tablet per Google UA spec.
    device_type = "tablet";
  }

  return { browser, os, device_type };
}
