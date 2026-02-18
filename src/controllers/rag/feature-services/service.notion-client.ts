/**
 * Notion Client Service
 *
 * Encapsulates all Notion API communication.
 * Handles pagination, error handling, and data mapping.
 * Delegates block parsing to NotionParser utility.
 */

import axios from "axios";
import type { NotionDatabase, NotionPage } from "../feature-utils/util.rag-types";
import { getNotionToken, getNotionApiVersion } from "../feature-utils/util.rag-validator";
import { extractTextFromBlock } from "../feature-utils/util.notion-parser";
import { log, logError } from "./service.rag-logger";

// =====================================================================
// NOTION API HEADERS
// =====================================================================

function getNotionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getNotionToken()}`,
    "Notion-Version": getNotionApiVersion(),
    "Content-Type": "application/json",
  };
}

// =====================================================================
// DATABASE FETCHING
// =====================================================================

/**
 * Fetches all databases from the Notion workspace.
 * Uses the Notion search API filtered to database objects.
 */
export async function fetchDatabases(): Promise<NotionDatabase[]> {
  try {
    log("Fetching databases from Notion...");

    const response = await axios.post(
      "https://api.notion.com/v1/search",
      {
        filter: {
          property: "object",
          value: "database",
        },
        page_size: 100,
      },
      {
        headers: getNotionHeaders(),
      }
    );

    const databases = response.data.results.map((db: any) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || "Untitled Database",
      properties: db.properties,
    }));

    log(`Fetched ${databases.length} databases from Notion`);

    // Log database names
    databases.forEach((db: NotionDatabase, index: number) => {
      log(`  ${index + 1}. ${db.title} (${db.id})`);
    });

    return databases;
  } catch (error: any) {
    logError("fetchNotionDatabases", error);
    throw error;
  }
}

// =====================================================================
// PAGE FETCHING
// =====================================================================

/**
 * Fetches all pages for a specific database.
 * Handles Notion API pagination (100 pages per request).
 */
export async function fetchPagesForDatabase(
  databaseId: string
): Promise<NotionPage[]> {
  try {
    let allPages: NotionPage[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
      const response: any = await axios.post(
        `https://api.notion.com/v1/databases/${databaseId}/query`,
        {
          start_cursor: startCursor,
          page_size: 100,
        },
        {
          headers: getNotionHeaders(),
        }
      );

      allPages = allPages.concat(response.data.results);
      hasMore = response.data.has_more;
      startCursor = response.data.next_cursor;
    }

    return allPages;
  } catch (error: any) {
    logError(`fetchPagesForDatabase(${databaseId})`, error);
    throw error;
  }
}

// =====================================================================
// PAGE CONTENT FETCHING
// =====================================================================

/**
 * Fetches the content blocks of a page and extracts text.
 * Handles Notion API pagination for blocks (100 blocks per request).
 * Returns concatenated text from all blocks.
 */
export async function fetchPageContent(pageId: string): Promise<string> {
  try {
    let allBlocks: any[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
      const response: any = await axios.get(
        `https://api.notion.com/v1/blocks/${pageId}/children`,
        {
          headers: {
            Authorization: `Bearer ${getNotionToken()}`,
            "Notion-Version": getNotionApiVersion(),
          },
          params: {
            start_cursor: startCursor,
            page_size: 100,
          },
        }
      );

      allBlocks = allBlocks.concat(response.data.results);
      hasMore = response.data.has_more;
      startCursor = response.data.next_cursor;
    }

    // Extract text from blocks
    const textContent = allBlocks
      .map((block) => extractTextFromBlock(block))
      .filter((text) => text.length > 0)
      .join("\n\n");

    return textContent;
  } catch (error: any) {
    logError(`fetchPageContent(${pageId})`, error);
    return "";
  }
}
