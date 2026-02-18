/**
 * OpenAI Client Service
 *
 * Encapsulates OpenAI API communication.
 * Handles embedding generation and API error handling.
 */

import axios from "axios";
import { getOpenAIKey, getEmbeddingModel } from "../feature-utils/util.rag-validator";
import { logError } from "./service.rag-logger";

// =====================================================================
// EMBEDDING GENERATION
// =====================================================================

/**
 * Generates an embedding vector for a text chunk using OpenAI's API.
 * Uses the text-embedding-3-small model.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/embeddings",
      {
        model: getEmbeddingModel(),
        input: text,
      },
      {
        headers: {
          Authorization: `Bearer ${getOpenAIKey()}`,
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
