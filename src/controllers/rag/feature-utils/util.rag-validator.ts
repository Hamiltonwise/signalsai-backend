/**
 * RAG Pipeline Validator
 *
 * Environment validation and configuration constants.
 * No I/O - uses process.env directly.
 */

// =====================================================================
// CONFIGURATION CONSTANTS
// =====================================================================

const NOTION_API_VERSION = "2022-06-28";
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE_CHARS = 2048; // Approximation: 512 tokens ~ 2048 characters

// =====================================================================
// VALIDATION
// =====================================================================

export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.NOTION_TOKEN) {
    errors.push("NOTION_TOKEN not configured");
  }

  if (!process.env.OPENAI_API_KEY) {
    errors.push("OPENAI_API_KEY not configured");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =====================================================================
// CONFIG ACCESSORS
// =====================================================================

export function getNotionToken(): string {
  return process.env.NOTION_TOKEN!;
}

export function getOpenAIKey(): string {
  return process.env.OPENAI_API_KEY!;
}

export function getNotionApiVersion(): string {
  return NOTION_API_VERSION;
}

export function getEmbeddingModel(): string {
  return EMBEDDING_MODEL;
}

export function getChunkSizeChars(): number {
  return CHUNK_SIZE_CHARS;
}
