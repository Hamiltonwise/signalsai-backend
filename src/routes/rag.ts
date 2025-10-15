/**
 * RAG (Retrieval Augmented Generation) Route
 *
 * Comprehensive RAG pipeline that:
 * - Fetches all databases from Notion
 * - Processes all pages in each database
 * - Chunks content into optimal sizes for embeddings
 * - Generates embeddings using OpenAI's text-embedding-3-small
 * - Stores embeddings in PostgreSQL for retrieval
 *
 * @author SignalsAI Backend
 * @version 1.0.0
 */

import express, { Request, Response } from "express";
import axios from "axios";
import { db } from "../database/connection";
import * as fs from "fs";
import * as path from "path";

const router = express.Router();

// =====================================================================
// CONFIGURATION AND CONSTANTS
// =====================================================================

const NOTION_TOKEN = process.env.NOTION_TOKEN!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const NOTION_API_VERSION = "2022-06-28";
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE_TOKENS = 512;
const CHUNK_SIZE_CHARS = 2048; // Approximation: 512 tokens ≈ 2048 characters
const LOG_FILE = path.join(__dirname, "../logs/rag.log");
const ERROR_LOG_FILE = path.join(__dirname, "../logs/rag-error.log");

// =====================================================================
// TYPES AND INTERFACES
// =====================================================================

interface NotionDatabase {
  id: string;
  title: string;
  properties: any;
}

interface NotionPage {
  id: string;
  properties: any;
  parent: any;
  created_time: string;
  last_edited_time: string;
}

interface PageContent {
  pageId: string;
  title: string;
  content: string;
  properties: Record<string, any>;
  databaseId: string;
  databaseName: string;
}

interface Chunk {
  text: string;
  index: number;
}

interface EmbeddingData {
  page_id: string;
  database_id: string;
  database_name: string;
  page_title: string;
  chunk_text: string;
  chunk_index: number;
  embedding: number[];
  properties: Record<string, any>;
}

interface RAGStats {
  databasesProcessed: number;
  pagesProcessed: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
  duration?: string;
}

interface PageResult {
  id: string;
  title: string;
  status: "completed" | "failed" | "skipped";
  chunksCreated: number;
  embeddingsGenerated: number;
  error?: string;
}

interface DatabaseResult {
  id: string;
  name: string;
  status: "completed" | "failed" | "skipped";
  pagesProcessed: number;
  chunksCreated: number;
  errors: number;
  pages: PageResult[];
}

interface SkippedDatabase {
  id: string;
  name: string;
  reason: string;
}

interface ErrorDetail {
  type: string;
  database?: string;
  page?: string;
  message: string;
  timestamp: string;
}

interface RAGSummary {
  summary: {
    success: boolean;
    message: string;
    statistics: {
      databasesProcessed: number;
      pagesProcessed: number;
      chunksCreated: number;
      embeddingsGenerated: number;
      errors: number;
      duration: string;
    };
  };
  databases: DatabaseResult[];
  skippedDatabases: SkippedDatabase[];
  errors: ErrorDetail[];
}

// =====================================================================
// LOGGING UTILITIES
// =====================================================================

/**
 * Appends a log message to the specified log file
 */
function log(message: string, isError: boolean = false): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  const logFile = isError ? ERROR_LOG_FILE : LOG_FILE;

  try {
    fs.appendFileSync(logFile, logMessage);
    console.log(message);
  } catch (error) {
    console.error(`Failed to write to log file: ${error}`);
  }
}

/**
 * Logs an error with stack trace
 */
function logError(operation: string, error: any): void {
  const errorMessage = `ERROR in ${operation}: ${error.message || error}`;
  const stackTrace = error.stack ? `\nStack: ${error.stack}` : "";
  log(`${errorMessage}${stackTrace}`, true);
}

// =====================================================================
// NOTION API FUNCTIONS
// =====================================================================

/**
 * Fetches all databases from Notion
 */
async function fetchNotionDatabases(): Promise<NotionDatabase[]> {
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
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
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

/**
 * Fetches all pages for a specific database
 */
async function fetchPagesForDatabase(
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
          headers: {
            Authorization: `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_API_VERSION,
            "Content-Type": "application/json",
          },
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

/**
 * Fetches the content blocks of a page
 */
async function fetchPageContent(pageId: string): Promise<string> {
  try {
    let allBlocks: any[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
      const response: any = await axios.get(
        `https://api.notion.com/v1/blocks/${pageId}/children`,
        {
          headers: {
            Authorization: `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_API_VERSION,
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

/**
 * Extracts text from a Notion block
 */
function extractTextFromBlock(block: any): string {
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

/**
 * Extracts plain text from Notion rich text array
 */
function extractRichText(richText: any[]): string {
  if (!richText || !Array.isArray(richText)) return "";
  return richText.map((rt) => rt.plain_text || "").join("");
}

/**
 * Extracts and formats page properties
 */
function extractPageProperties(page: NotionPage): Record<string, any> {
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

// =====================================================================
// TEXT PROCESSING FUNCTIONS
// =====================================================================

/**
 * Chunks text into segments of approximately CHUNK_SIZE_CHARS
 */
function chunkText(text: string, maxChars: number = CHUNK_SIZE_CHARS): Chunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();

    if (!trimmedParagraph) continue;

    // If adding this paragraph would exceed the limit
    if (currentChunk.length + trimmedParagraph.length + 2 > maxChars) {
      // Save current chunk if it has content
      if (currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
        });
        currentChunk = "";
      }

      // If paragraph itself is longer than maxChars, split it
      if (trimmedParagraph.length > maxChars) {
        const sentences = trimmedParagraph.split(/[.!?]+\s+/);
        let sentenceChunk = "";

        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length + 2 > maxChars) {
            if (sentenceChunk.length > 0) {
              chunks.push({
                text: sentenceChunk.trim(),
                index: chunkIndex++,
              });
              sentenceChunk = "";
            }

            // If single sentence is too long, force split
            if (sentence.length > maxChars) {
              const words = sentence.split(/\s+/);
              let wordChunk = "";

              for (const word of words) {
                if (wordChunk.length + word.length + 1 > maxChars) {
                  if (wordChunk.length > 0) {
                    chunks.push({
                      text: wordChunk.trim(),
                      index: chunkIndex++,
                    });
                  }
                  wordChunk = word;
                } else {
                  wordChunk += (wordChunk ? " " : "") + word;
                }
              }

              if (wordChunk.length > 0) {
                sentenceChunk = wordChunk;
              }
            } else {
              sentenceChunk = sentence;
            }
          } else {
            sentenceChunk += (sentenceChunk ? ". " : "") + sentence;
          }
        }

        if (sentenceChunk.length > 0) {
          currentChunk = sentenceChunk;
        }
      } else {
        currentChunk = trimmedParagraph;
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmedParagraph;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
    });
  }

  return chunks;
}

// =====================================================================
// OPENAI EMBEDDING FUNCTIONS
// =====================================================================

/**
 * Generates embedding for a text chunk using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/embeddings",
      {
        model: EMBEDDING_MODEL,
        input: text,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.data[0].embedding;
  } catch (error: any) {
    logError("generateEmbedding", error);
    throw error;
  }
}

// =====================================================================
// DATABASE FUNCTIONS
// =====================================================================

/**
 * Saves an embedding to the database
 */
async function saveEmbedding(data: EmbeddingData): Promise<void> {
  try {
    await db("knowledgebase_embeddings").insert({
      page_id: data.page_id,
      database_id: data.database_id,
      chunk_index: data.chunk_index,
      text: data.chunk_text,
      embedding: JSON.stringify(data.embedding),
      metadata: {
        database_name: data.database_name,
        page_title: data.page_title,
        properties: data.properties,
        token_count: data.chunk_text.split(/\s+/).length, // Approximate token count
        source: "notion",
      },
      created_at: new Date(),
    });
  } catch (error: any) {
    logError("saveEmbedding", error);
    throw error;
  }
}

/**
 * Truncates the knowledgebase_embeddings table
 */
async function truncateEmbeddingsTable(): Promise<void> {
  try {
    log("Truncating knowledgebase_embeddings table...");
    await db("knowledgebase_embeddings").del();
    log("Table truncated successfully");
  } catch (error: any) {
    logError("truncateEmbeddingsTable", error);
    throw error;
  }
}

// =====================================================================
// PROCESSING FUNCTIONS
// =====================================================================

/**
 * Processes a single page: fetches content, chunks, embeds, and saves
 */
async function processPage(
  page: NotionPage,
  database: NotionDatabase,
  stats: RAGStats
): Promise<PageResult> {
  const properties = extractPageProperties(page);
  const pageTitle = properties.Name || properties.Title || "Untitled Page";

  const pageResult: PageResult = {
    id: page.id,
    title: pageTitle,
    status: "completed",
    chunksCreated: 0,
    embeddingsGenerated: 0,
  };

  try {
    log(`=== Started fetching info for page: ${pageTitle}`);

    // Fetch page content
    const content = await fetchPageContent(page.id);

    // Skip pages with no content
    if (!content || content.trim().length === 0) {
      log(`Skipping page "${pageTitle}" - no content found`);
      pageResult.status = "skipped";
      pageResult.error = "No content found";
      return pageResult;
    }

    log(`=== Chunking page: ${pageTitle}`);
    const chunks = chunkText(content);

    if (chunks.length === 0) {
      log(`Skipping page "${pageTitle}" - no chunks generated`);
      pageResult.status = "skipped";
      pageResult.error = "No chunks generated";
      return pageResult;
    }

    log(`Generated ${chunks.length} chunks for page: ${pageTitle}`);

    log(`=== Embedding page: ${pageTitle}`);

    // Process each chunk
    for (const chunk of chunks) {
      try {
        // Generate embedding
        const embedding = await generateEmbedding(chunk.text);
        stats.embeddingsGenerated++;
        pageResult.embeddingsGenerated++;

        // Save to database
        await saveEmbedding({
          page_id: page.id,
          database_id: database.id,
          database_name: database.title,
          page_title: pageTitle,
          chunk_text: chunk.text,
          chunk_index: chunk.index,
          embedding: embedding,
          properties: properties,
        });

        stats.chunksCreated++;
        pageResult.chunksCreated++;
      } catch (error: any) {
        logError(`Processing chunk ${chunk.index} of page ${pageTitle}`, error);
        stats.errors++;
        pageResult.status = "failed";
        pageResult.error = `Failed to process chunk ${chunk.index}: ${error.message}`;
      }
    }

    log(`=== Started saving to database: ${pageTitle}`);
    log(`=== Page completed: ${pageTitle}`);
    stats.pagesProcessed++;

    // If we had any chunk failures but some succeeded, mark as completed
    if (pageResult.chunksCreated > 0 && pageResult.status !== "failed") {
      pageResult.status = "completed";
    }

    return pageResult;
  } catch (error: any) {
    logError(`processPage(${pageTitle})`, error);
    stats.errors++;
    pageResult.status = "failed";
    pageResult.error = error.message || "Unknown error occurred";
    return pageResult;
  }
}

/**
 * Processes a single database: fetches all pages and processes them
 */
async function processDatabase(
  database: NotionDatabase,
  stats: RAGStats
): Promise<DatabaseResult> {
  const databaseResult: DatabaseResult = {
    id: database.id,
    name: database.title,
    status: "completed",
    pagesProcessed: 0,
    chunksCreated: 0,
    errors: 0,
    pages: [],
  };

  try {
    log(`=== Started fetching pages for database: ${database.title}`);

    // Fetch all pages in this database
    const pages = await fetchPagesForDatabase(database.id);

    // Skip databases with no pages
    if (pages.length === 0) {
      log(`Skipping database "${database.title}" - no pages found`);
      databaseResult.status = "skipped";
      return databaseResult;
    }

    log(`Found ${pages.length} pages in database: ${database.title}`);

    // Log page IDs
    pages.forEach((page, index) => {
      const properties = extractPageProperties(page);
      const pageTitle = properties.Name || properties.Title || "Untitled Page";
      log(`  ${index + 1}. ${pageTitle} (${page.id})`);
    });

    // Process each page
    for (let i = 0; i < pages.length; i++) {
      const pageResult = await processPage(pages[i], database, stats);
      databaseResult.pages.push(pageResult);

      // Update database-level statistics
      databaseResult.chunksCreated += pageResult.chunksCreated;
      if (pageResult.status === "completed") {
        databaseResult.pagesProcessed++;
      }
      if (pageResult.status === "failed" || pageResult.error) {
        databaseResult.errors++;
      }

      if (i < pages.length - 1) {
        log(`=== Moving to next page`);
      }
    }

    stats.databasesProcessed++;
    log(`=== Moving to next database`);

    return databaseResult;
  } catch (error: any) {
    logError(`processDatabase(${database.title})`, error);
    stats.errors++;
    databaseResult.status = "failed";
    databaseResult.errors++;
    return databaseResult;
  }
}

/**
 * Main RAG pipeline orchestrator
 */
async function runRAGPipeline(): Promise<RAGSummary> {
  const stats: RAGStats = {
    databasesProcessed: 0,
    pagesProcessed: 0,
    chunksCreated: 0,
    embeddingsGenerated: 0,
    errors: 0,
    startTime: new Date(),
  };

  const databaseResults: DatabaseResult[] = [];
  const skippedDatabases: SkippedDatabase[] = [];
  const errorDetails: ErrorDetail[] = [];

  try {
    log("==========================================");
    log("Starting RAG Pipeline");
    log("==========================================");

    // Truncate embeddings table
    // await truncateEmbeddingsTable();

    // Fetch all databases
    const databases = await fetchNotionDatabases();

    if (databases.length === 0) {
      log("No databases found in Notion workspace");
      skippedDatabases.push({
        id: "N/A",
        name: "All databases",
        reason: "No databases found in Notion workspace",
      });
    }

    // Process each database
    for (let i = 0; i < databases.length; i++) {
      const databaseResult = await processDatabase(databases[i], stats);
      databaseResults.push(databaseResult);

      // Track skipped databases
      if (databaseResult.status === "skipped") {
        skippedDatabases.push({
          id: databaseResult.id,
          name: databaseResult.name,
          reason: "No pages found",
        });
      }

      // Track database-level errors
      if (databaseResult.status === "failed") {
        errorDetails.push({
          type: "database",
          database: databaseResult.name,
          message: `Failed to process database: ${databaseResult.name}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Track page-level errors
      databaseResult.pages.forEach((page) => {
        if (page.status === "failed" && page.error) {
          errorDetails.push({
            type: "page",
            database: databaseResult.name,
            page: page.title,
            message: page.error,
            timestamp: new Date().toISOString(),
          });
        }
      });
    }

    stats.endTime = new Date();
    const duration = stats.endTime.getTime() - stats.startTime.getTime();
    stats.duration = `${Math.floor(duration / 1000)}s`;

    log("==========================================");
    log(
      `RAG transformation complete - Databases: ${stats.databasesProcessed}, Pages: ${stats.pagesProcessed}, Chunks: ${stats.chunksCreated}, Embeddings: ${stats.embeddingsGenerated}, Errors: ${stats.errors}, Duration: ${stats.duration}`
    );
    log("==========================================");

    // Build the complete summary
    const summary: RAGSummary = {
      summary: {
        success: stats.errors === 0,
        message: "RAG transformation complete",
        statistics: {
          databasesProcessed: stats.databasesProcessed,
          pagesProcessed: stats.pagesProcessed,
          chunksCreated: stats.chunksCreated,
          embeddingsGenerated: stats.embeddingsGenerated,
          errors: stats.errors,
          duration: stats.duration || "0s",
        },
      },
      databases: databaseResults,
      skippedDatabases: skippedDatabases,
      errors: errorDetails,
    };

    // Log the detailed JSON summary
    const summaryJson = JSON.stringify(summary, null, 2);
    log("==========================================");
    log("DETAILED JSON SUMMARY:");
    log(summaryJson);
    log("==========================================");

    return summary;
  } catch (error: any) {
    logError("runRAGPipeline", error);
    stats.endTime = new Date();

    // Add the critical error to error details
    errorDetails.push({
      type: "pipeline",
      message: error.message || "Unknown error occurred",
      timestamp: new Date().toISOString(),
    });

    // Return a failed summary
    const duration = stats.endTime.getTime() - stats.startTime.getTime();
    return {
      summary: {
        success: false,
        message: "RAG pipeline failed",
        statistics: {
          databasesProcessed: stats.databasesProcessed,
          pagesProcessed: stats.pagesProcessed,
          chunksCreated: stats.chunksCreated,
          embeddingsGenerated: stats.embeddingsGenerated,
          errors: stats.errors + 1,
          duration: `${Math.floor(duration / 1000)}s`,
        },
      },
      databases: databaseResults,
      skippedDatabases: skippedDatabases,
      errors: errorDetails,
    };
  }
}

// =====================================================================
// API ROUTES
// =====================================================================

/**
 * GET /rag
 *
 * Runs the complete RAG pipeline:
 * 1. Truncates the embeddings table
 * 2. Fetches all Notion databases
 * 3. Fetches all pages in each database
 * 4. Extracts and chunks content
 * 5. Generates embeddings using OpenAI
 * 6. Saves to PostgreSQL
 *
 * Returns a summary of the operation with counts
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Validate environment variables
    if (!NOTION_TOKEN) {
      return res.status(500).json({
        success: false,
        error: "NOTION_TOKEN not configured",
        message: "Please set NOTION_TOKEN in your .env file",
      });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY not configured",
        message: "Please set OPENAI_API_KEY in your .env file",
      });
    }

    // Run the RAG pipeline
    const summary = await runRAGPipeline();

    // Return success response with detailed JSON summary
    res.json({
      ...summary,
      logs: {
        mainLog: LOG_FILE,
        errorLog: ERROR_LOG_FILE,
      },
    });
  } catch (error: any) {
    logError("RAG endpoint", error);

    res.status(500).json({
      success: false,
      error: "RAG pipeline failed",
      message: error.message || "Unknown error occurred",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
