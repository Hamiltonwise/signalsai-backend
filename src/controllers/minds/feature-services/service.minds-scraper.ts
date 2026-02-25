import axios from "axios";
import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";

const FETCH_TIMEOUT = parseInt(process.env.MINDS_HTTP_FETCH_TIMEOUT_MS || "10000", 10);
const MAX_SCRAPED_PAGE_CHARACTERS = parseInt(
  process.env.MINDS_MAX_SCRAPED_PAGE_CHARACTERS || "100000",
  10
);
const USER_AGENT = "AlloroMindsBot/1.0";

export interface ScrapedResult {
  url: string;
  title: string;
  markdown: string;
  htmlHash: string;
}

function htmlToMarkdown($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): string {
  const lines: string[] = [];

  element.children().each((_i: number, el: any) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();

    if (!tag) {
      // Text node
      const text = $el.text().trim();
      if (text) lines.push(text);
      return;
    }

    switch (tag) {
      case "h1":
        lines.push(`# ${$el.text().trim()}`);
        break;
      case "h2":
        lines.push(`## ${$el.text().trim()}`);
        break;
      case "h3":
        lines.push(`### ${$el.text().trim()}`);
        break;
      case "h4":
      case "h5":
      case "h6":
        lines.push(`#### ${$el.text().trim()}`);
        break;
      case "p":
        lines.push($el.text().trim());
        break;
      case "ul":
        $el.find("> li").each((_j, li) => {
          lines.push(`- ${$(li).text().trim()}`);
        });
        break;
      case "ol":
        $el.find("> li").each((j, li) => {
          lines.push(`${j + 1}. ${$(li).text().trim()}`);
        });
        break;
      case "blockquote":
        lines.push(`> ${$el.text().trim()}`);
        break;
      case "pre":
      case "code":
        lines.push("```");
        lines.push($el.text().trim());
        lines.push("```");
        break;
      default: {
        const text = $el.text().trim();
        if (text) lines.push(text);
      }
    }
  });

  return lines.filter(Boolean).join("\n\n");
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

export async function scrapeUrl(url: string): Promise<ScrapedResult> {
  const response = await axios.get(url, {
    timeout: FETCH_TIMEOUT,
    maxRedirects: 3,
    headers: { "User-Agent": USER_AGENT },
    responseType: "text",
    maxContentLength: 10 * 1024 * 1024, // 10MB
  });

  const html = response.data as string;
  const htmlHash = simpleHash(html);

  // Sanitize HTML — strip scripts, styles, iframes, event handlers
  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "article",
      "section",
      "main",
      "aside",
    ]),
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });

  const $ = cheerio.load(sanitized);

  // Extract title
  const title =
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    $("meta[property='og:title']").attr("content") ||
    "";

  // Find main content area
  const contentSelectors = [
    "article",
    "main",
    '[role="main"]',
    ".post-content",
    ".entry-content",
    ".article-content",
    ".blog-content",
    ".content",
  ];

  let contentElement: cheerio.Cheerio<any> | null = null;
  for (const sel of contentSelectors) {
    const found = $(sel).first();
    if (found.length > 0) {
      contentElement = found;
      break;
    }
  }

  // Fallback to body
  if (!contentElement) {
    contentElement = $("body");
  }

  // Remove nav, footer, sidebar, etc.
  contentElement.find("nav, footer, aside, .sidebar, .menu, .nav, .footer, .header, .comments").remove();

  let markdown = htmlToMarkdown($, contentElement);

  // Enforce max characters
  if (markdown.length > MAX_SCRAPED_PAGE_CHARACTERS) {
    markdown = markdown.slice(0, MAX_SCRAPED_PAGE_CHARACTERS);
    markdown += "\n\n[... content truncated at character limit]";
  }

  return { url, title, markdown, htmlHash };
}
