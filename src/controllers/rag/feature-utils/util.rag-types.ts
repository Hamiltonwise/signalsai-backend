/**
 * RAG Pipeline Type Definitions
 *
 * All TypeScript interfaces used across the RAG pipeline.
 * Pure type definitions - no logic, no I/O.
 */

// =====================================================================
// NOTION TYPES
// =====================================================================

export interface NotionDatabase {
  id: string;
  title: string;
  properties: any;
}

export interface NotionPage {
  id: string;
  properties: any;
  parent: any;
  created_time: string;
  last_edited_time: string;
}

// =====================================================================
// CONTENT TYPES
// =====================================================================

export interface PageContent {
  pageId: string;
  title: string;
  content: string;
  properties: Record<string, any>;
  databaseId: string;
  databaseName: string;
}

export interface Chunk {
  text: string;
  index: number;
}

// =====================================================================
// EMBEDDING TYPES
// =====================================================================

export interface EmbeddingData {
  page_id: string;
  database_id: string;
  database_name: string;
  page_title: string;
  chunk_text: string;
  chunk_index: number;
  embedding: number[];
  properties: Record<string, any>;
}

// =====================================================================
// RESULT TYPES
// =====================================================================

export interface RAGStats {
  databasesProcessed: number;
  pagesProcessed: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
  duration?: string;
}

export interface PageResult {
  id: string;
  title: string;
  status: "completed" | "failed" | "skipped";
  chunksCreated: number;
  embeddingsGenerated: number;
  error?: string;
}

export interface DatabaseResult {
  id: string;
  name: string;
  status: "completed" | "failed" | "skipped";
  pagesProcessed: number;
  chunksCreated: number;
  errors: number;
  pages: PageResult[];
}

export interface SkippedDatabase {
  id: string;
  name: string;
  reason: string;
}

export interface ErrorDetail {
  type: string;
  database?: string;
  page?: string;
  message: string;
  timestamp: string;
}

// =====================================================================
// SUMMARY TYPE
// =====================================================================

export interface RAGSummary {
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
