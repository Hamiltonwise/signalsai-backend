export const PAGE_SIZE = 10;

export const APP_URL =
  process.env.NODE_ENV === "production"
    ? "https://app.getalloro.com"
    : "http://localhost:5174";

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = [
  // Spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  // Images (screenshots, photos of reports, napkin scans)
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
  // PDFs (exported reports, printed summaries)
  "application/pdf",
];

export const ALLOWED_EXTENSIONS = [
  ".csv", ".xls", ".xlsx", ".txt",
  ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif",
  ".pdf",
];

export type PmsStatus = "pending" | "error" | "completed" | string;
