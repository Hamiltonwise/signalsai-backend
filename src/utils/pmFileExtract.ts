const MAX_CHARS = 50_000;

/**
 * Extract text content from uploaded files.
 * Supports: .txt, .pdf, .docx, .eml
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase();

  let text: string;

  switch (ext) {
    case "txt":
      text = buffer.toString("utf-8");
      break;

    case "pdf": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
      break;
    }

    case "docx": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      break;
    }

    case "eml": {
      // Simple email body extraction — strip headers
      const raw = buffer.toString("utf-8");
      const bodyStart = raw.indexOf("\n\n");
      text = bodyStart >= 0 ? raw.slice(bodyStart + 2) : raw;
      break;
    }

    default:
      throw new Error(
        `Unsupported file type: .${ext}. Accepted: .txt, .pdf, .docx, .eml`
      );
  }

  // Truncate if too long
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + "\n\n[truncated — content exceeded 50,000 characters]";
  }

  return text;
}
