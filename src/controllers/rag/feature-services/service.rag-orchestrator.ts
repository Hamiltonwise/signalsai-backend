/**
 * RAG Orchestrator Service
 *
 * Main pipeline orchestration logic.
 * Coordinates NotionClient, OpenAIClient, TextChunker, KnowledgebaseEmbeddingModel, and RagLogger.
 * Tracks statistics, aggregates errors, and produces the RAGSummary.
 */

import type {
  NotionDatabase,
  NotionPage,
  RAGStats,
  PageResult,
  DatabaseResult,
  SkippedDatabase,
  ErrorDetail,
  RAGSummary,
} from "../feature-utils/util.rag-types";
import { extractPageProperties } from "../feature-utils/util.notion-parser";
import { fetchDatabases, fetchPagesForDatabase, fetchPageContent } from "./service.notion-client";
import { generateEmbedding } from "./service.openai-client";
import { chunkText } from "./service.text-chunker";
import { log, logError } from "./service.rag-logger";
import { KnowledgebaseEmbeddingModel } from "../../../models/KnowledgebaseEmbeddingModel";

// =====================================================================
// PAGE PROCESSING
// =====================================================================

/**
 * Processes a single page: fetches content, chunks, embeds, and saves.
 * Tracks statistics via the mutable stats object.
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

        // Save to database via model
        await KnowledgebaseEmbeddingModel.bulkInsert([
          {
            page_id: page.id,
            database_id: database.id,
            chunk_index: chunk.index,
            text: chunk.text,
            embedding: embedding,
            metadata: {
              page_id: page.id,
              database_id: database.id,
              database_name: database.title,
              page_title: pageTitle,
              properties: properties,
              token_count: chunk.text.split(/\s+/).length,
              source: "notion",
            },
          },
        ]);

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

// =====================================================================
// DATABASE PROCESSING
// =====================================================================

/**
 * Processes a single database: fetches all pages and processes them.
 * Tracks statistics via the mutable stats object.
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

// =====================================================================
// PIPELINE ORCHESTRATION
// =====================================================================

/**
 * Main RAG pipeline orchestrator.
 * Fetches all Notion databases, processes each one, and returns a complete summary.
 */
export async function runPipeline(): Promise<RAGSummary> {
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

    // Truncate embeddings table (kept commented out as in original)
    // await KnowledgebaseEmbeddingModel.truncate();

    // Fetch all databases
    const databases = await fetchDatabases();

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
