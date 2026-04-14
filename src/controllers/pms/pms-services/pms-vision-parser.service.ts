/**
 * PMS Vision Parser
 *
 * Extracts structured business data from images and PDFs using Claude Vision.
 * Handles: screenshots of reports, photos of handwritten notes, PDF exports,
 * photos of spreadsheets on screens, pictures of bar napkins with numbers.
 *
 * The customer shouldn't have to know what format we need.
 * They give us what they have. We figure it out.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

let llm: Anthropic | null = null;
function getLLM(): Anthropic {
  if (!llm) llm = new Anthropic();
  return llm;
}

export interface VisionParseResult {
  success: boolean;
  rows: Record<string, unknown>[];
  confidence: "high" | "medium" | "low";
  description: string;
  error?: string;
}

/**
 * Determine if a file is an image or PDF that needs vision parsing.
 */
export function needsVisionParsing(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname).toLowerCase();
  const imageExts = [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"];
  const pdfExts = [".pdf"];
  return imageExts.includes(ext) || pdfExts.includes(ext);
}

/**
 * Get the media type for Claude's image API.
 */
function getMediaType(file: Express.Multer.File): "image/png" | "image/jpeg" | "image/webp" | "image/gif" {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg"; // Default for jpg, jpeg, heic, heif (converted)
}

/**
 * Parse an image or PDF into structured referral data using Claude Vision.
 *
 * Returns an array of objects that looks like a CSV was parsed,
 * so the preprocessor can handle it identically to file uploads.
 */
export async function parseWithVision(file: Express.Multer.File): Promise<VisionParseResult> {
  try {
    const anthropic = getLLM();
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdf = ext === ".pdf";
    const isHeic = ext === ".heic" || ext === ".heif";

    // Convert HEIC to JPEG (iPhones default to HEIC)
    let imageBuffer = file.buffer;
    if (isHeic) {
      try {
        imageBuffer = await sharp(file.buffer).jpeg({ quality: 90 }).toBuffer();
        console.log(`[Vision Parser] Converted HEIC to JPEG (${file.originalname})`);
      } catch (convErr: any) {
        console.error(`[Vision Parser] HEIC conversion failed: ${convErr.message}`);
        return {
          success: false,
          rows: [],
          confidence: "low" as const,
          description: "Could not process iPhone photo format",
          error: "Your photo is in HEIC format which we couldn't convert. Try taking the photo with your camera set to 'Most Compatible' in Settings > Camera > Formats, or screenshot the report instead.",
        };
      }
    }

    const base64 = imageBuffer.toString("base64");

    // Build the content block: PDF uses document type, images use image type
    const contentBlock: any = isPdf
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: isHeic ? "image/jpeg" : getMediaType(file),
            data: base64,
          },
        };

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `You are extracting business data from an image. This could be a screenshot of software, a photo of a handwritten ledger, a printed report, or anything else a business owner might photograph.

Extract ALL rows of data you can see. For each row, identify:
- Treatment Date or Date (any format you can read)
- Patient identifier (name, ID, number, or any identifier visible)
- Referral Source or "Referred By" (the doctor, practice, or source that sent this customer)
- Revenue, Fee, Production, or Amount (any dollar figure)
- Any other columns you can identify

CRITICAL RULES:
1. Extract EVERY row you can read, even if partially legible
2. If handwritten, do your best to read it. Guess if you have to, and note low confidence.
3. If it's a screenshot of software (like TDO, Dentrix, etc), read the table exactly as shown
4. Include column headers if visible
5. For any field you can't read, use "unclear" not empty string

Return ONLY a JSON object with this exact format:
{
  "description": "Brief description of what you see (e.g., 'Screenshot of TDO referral report showing January 2026 data')",
  "confidence": "high" | "medium" | "low",
  "headers": ["col1", "col2", ...],
  "rows": [
    {"col1": "value", "col2": "value", ...},
    ...
  ]
}

If you cannot extract any structured data at all, return:
{
  "description": "What you see",
  "confidence": "low",
  "headers": [],
  "rows": [],
  "error": "Why extraction failed"
}

Return ONLY the JSON. No markdown. No explanation.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: any;
    try {
      const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[Vision Parser] Failed to parse Claude response:", text.slice(0, 200));
      return {
        success: false,
        rows: [],
        confidence: "low",
        description: "Could not parse the image",
        error: "The image was received but we couldn't extract structured data. Try a clearer photo or upload a CSV export instead.",
      };
    }

    const rows = parsed.rows || [];
    const headers = parsed.headers || (rows.length > 0 ? Object.keys(rows[0]) : []);

    // Convert to the same format as csvtojson output
    const normalizedRows = rows.map((row: any) => {
      if (Array.isArray(row)) {
        // If rows are arrays, zip with headers
        const obj: Record<string, unknown> = {};
        headers.forEach((h: string, i: number) => {
          obj[h] = row[i] ?? "";
        });
        return obj;
      }
      return row;
    });

    console.log(
      `[Vision Parser] Extracted ${normalizedRows.length} rows from ${file.originalname} (confidence: ${parsed.confidence})`
    );

    return {
      success: normalizedRows.length > 0,
      rows: normalizedRows,
      confidence: parsed.confidence || "medium",
      description: parsed.description || "Image processed",
      error: parsed.error,
    };
  } catch (error: any) {
    console.error("[Vision Parser] Error:", error.message);
    return {
      success: false,
      rows: [],
      confidence: "low",
      description: "Error processing image",
      error: `Image processing failed: ${error.message}. Try uploading a CSV or Excel file instead.`,
    };
  }
}
