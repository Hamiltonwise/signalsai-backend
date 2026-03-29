/**
 * Web Fetch Service -- shared utility for fetching web pages and RSS feeds.
 *
 * Used by: AEO Monitor, Market Signal Scout, Technology Horizon, and
 * any agent that needs to read external web content.
 *
 * Design: never throws. Every function returns a result envelope with
 * success boolean so callers can handle failures gracefully.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface FetchPageResult {
  success: boolean;
  html?: string;
  error?: string;
}

export interface RSSItem {
  title: string;
  link: string;
  date: string;
  summary?: string;
}

export interface FetchRSSResult {
  success: boolean;
  items?: RSSItem[];
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 10_000;
const USER_AGENT =
  "AlloroBot/1.0 (+https://getalloro.com; business-intelligence-platform)";

// ── fetchPage ──────────────────────────────────────────────────────

/**
 * Fetch a web page and return raw HTML.
 * 10-second timeout, custom user-agent header.
 */
export async function fetchPage(url: string): Promise<FetchPageResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timer);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    return { success: true, html };
  } catch (err: any) {
    const message =
      err.name === "AbortError"
        ? `Timeout after ${DEFAULT_TIMEOUT}ms`
        : err.message || String(err);
    return { success: false, error: message };
  }
}

// ── fetchRSS ───────────────────────────────────────────────────────

/**
 * Fetch and parse an RSS or Atom feed.
 * Returns structured items with title, link, date, and optional summary.
 */
export async function fetchRSS(url: string): Promise<FetchRSSResult> {
  const page = await fetchPage(url);
  if (!page.success || !page.html) {
    return { success: false, error: page.error || "Empty response" };
  }

  try {
    const items = parseRSSItems(page.html);
    return { success: true, items };
  } catch (err: any) {
    return { success: false, error: `RSS parse error: ${err.message}` };
  }
}

// ── extractText ────────────────────────────────────────────────────

/**
 * Strip HTML tags and return plain text. Simple regex approach,
 * no external dependency needed.
 */
export async function extractText(html: string): Promise<string> {
  // Remove script and style blocks entirely
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// ── RSS Parser (regex-based, no dependencies) ──────────────────────

/**
 * Parse RSS 2.0 and Atom feed XML using regex.
 * Handles both <item> (RSS) and <entry> (Atom) elements.
 */
function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Try RSS 2.0 format first (<item> elements)
  const rssItemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  match = rssItemRegex.exec(xml);
  while (match !== null) {
    const block = match[1];
    items.push(parseRSSBlock(block));
    match = rssItemRegex.exec(xml);
  }

  // If no RSS items found, try Atom format (<entry> elements)
  if (items.length === 0) {
    const atomEntryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    match = atomEntryRegex.exec(xml);
    while (match !== null) {
      const block = match[1];
      items.push(parseAtomBlock(block));
      match = atomEntryRegex.exec(xml);
    }
  }

  return items;
}

function parseRSSBlock(block: string): RSSItem {
  return {
    title: extractTag(block, "title"),
    link: extractTag(block, "link"),
    date: extractTag(block, "pubDate") || extractTag(block, "dc:date"),
    summary: extractTag(block, "description") || undefined,
  };
}

function parseAtomBlock(block: string): RSSItem {
  // Atom <link> is self-closing with href attribute
  const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return {
    title: extractTag(block, "title"),
    link: linkMatch ? linkMatch[1] : "",
    date: extractTag(block, "updated") || extractTag(block, "published"),
    summary: extractTag(block, "summary") || extractTag(block, "content") || undefined,
  };
}

function extractTag(block: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = block.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle regular tags
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(regex);
  return match ? match[1].trim() : "";
}
