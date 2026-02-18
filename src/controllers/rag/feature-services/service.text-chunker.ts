/**
 * Text Chunker Service
 *
 * Chunks text into segments of approximately maxChars characters.
 * Respects paragraph boundaries, then sentence boundaries, then word boundaries.
 * Pure function - no side effects, fully testable.
 */

import type { Chunk } from "../feature-utils/util.rag-types";
import { getChunkSizeChars } from "../feature-utils/util.rag-validator";

// =====================================================================
// TEXT CHUNKING
// =====================================================================

/**
 * Chunks text into segments of approximately maxChars characters.
 *
 * Split priority:
 * 1. Paragraph boundaries (double newlines)
 * 2. Sentence boundaries (period/exclamation/question mark + space)
 * 3. Word boundaries (spaces) - forced split for very long content
 */
export function chunkText(
  text: string,
  maxChars: number = getChunkSizeChars()
): Chunk[] {
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
