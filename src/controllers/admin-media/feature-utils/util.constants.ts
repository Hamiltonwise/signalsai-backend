/**
 * Admin Media Constants
 *
 * Centralized constants for media upload, quota enforcement,
 * and MIME type validation.
 */

export const MEDIA_TABLE = "website_builder.media";
export const PAGES_TABLE = "website_builder.pages";
export const PROJECTS_TABLE = "website_builder.projects";

/** 5 GB per project */
export const PROJECT_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "video/mp4",
  "application/pdf",
];
