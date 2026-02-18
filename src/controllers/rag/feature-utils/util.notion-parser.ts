/**
 * Notion Parser Utilities
 *
 * Pure functions for parsing Notion data structures.
 * Extracts text from blocks, rich text arrays, and page properties.
 * No I/O, no side effects - fully testable.
 */

import type { NotionPage } from "./util.rag-types";

// =====================================================================
// BLOCK TEXT EXTRACTION
// =====================================================================

/**
 * Extracts text content from a Notion block.
 * Handles paragraph, heading, list, quote, callout, toggle, code, and to_do block types.
 */
export function extractTextFromBlock(block: any): string {
  const type = block.type;

  if (!block[type]) return "";

  // Handle different block types
  switch (type) {
    case "paragraph":
    case "heading_1":
    case "heading_2":
    case "heading_3":
    case "bulleted_list_item":
    case "numbered_list_item":
    case "quote":
    case "callout":
    case "toggle":
      return extractRichText(block[type].rich_text);

    case "code":
      return block[type].rich_text
        ? extractRichText(block[type].rich_text)
        : "";

    case "to_do":
      const checked = block[type].checked ? "[x]" : "[ ]";
      return `${checked} ${extractRichText(block[type].rich_text)}`;

    default:
      return "";
  }
}

// =====================================================================
// RICH TEXT EXTRACTION
// =====================================================================

/**
 * Extracts plain text from a Notion rich_text array.
 */
export function extractRichText(richText: any[]): string {
  if (!richText || !Array.isArray(richText)) return "";
  return richText.map((rt) => rt.plain_text || "").join("");
}

// =====================================================================
// PAGE PROPERTY EXTRACTION
// =====================================================================

/**
 * Extracts and formats all properties from a Notion page.
 * Handles title, rich_text, number, select, multi_select, date,
 * checkbox, url, email, phone_number, and status property types.
 */
export function extractPageProperties(page: NotionPage): Record<string, any> {
  const properties: Record<string, any> = {};

  for (const [key, value] of Object.entries(page.properties)) {
    const propData = value as any;

    switch (propData.type) {
      case "title":
        properties[key] = propData.title?.[0]?.plain_text || "";
        break;
      case "rich_text":
        properties[key] = propData.rich_text?.[0]?.plain_text || "";
        break;
      case "number":
        properties[key] = propData.number;
        break;
      case "select":
        properties[key] = propData.select?.name || "";
        break;
      case "multi_select":
        properties[key] =
          propData.multi_select?.map((s: any) => s.name).join(", ") || "";
        break;
      case "date":
        properties[key] = propData.date?.start || "";
        break;
      case "checkbox":
        properties[key] = propData.checkbox;
        break;
      case "url":
        properties[key] = propData.url || "";
        break;
      case "email":
        properties[key] = propData.email || "";
        break;
      case "phone_number":
        properties[key] = propData.phone_number || "";
        break;
      case "status":
        properties[key] = propData.status?.name || "";
        break;
      default:
        properties[key] = JSON.stringify(propData);
    }
  }

  return properties;
}
