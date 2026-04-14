/**
 * PM Task Attachments — S3 Key Builder
 *
 * Mirrors the pattern from admin-media's buildMediaS3Key:
 *   pm-attachments/{taskId}/{uuid8}-{sanitized-filename}
 *
 * Sanitization matches the existing convention — anything outside
 * [a-zA-Z0-9._-] becomes an underscore. The uuid8 prefix prevents
 * collisions between identically-named uploads on the same task.
 */

import { v4 as uuidv4 } from "uuid";

export function buildAttachmentS3Key(taskId: string, filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniqueId = uuidv4().slice(0, 8);
  return `pm-attachments/${taskId}/${uniqueId}-${sanitized}`;
}
