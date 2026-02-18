/**
 * Admin Media S3 Helper Utilities
 *
 * Pure functions for building S3 keys and URLs for media assets.
 */

import { v4 as uuidv4 } from "uuid";
import { bucket } from "../../../utils/core/s3";

/**
 * Build S3 key for media file
 *
 * For images: caller appends .webp after processing
 * For videos/PDFs: keeps original extension via sanitized filename
 */
export function buildMediaS3Key(
  projectId: string,
  filename: string,
  isThumb: boolean = false
): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniqueId = uuidv4().slice(0, 8);

  if (isThumb) {
    return `uploads/${projectId}/thumbs/${uniqueId}-thumb.webp`;
  }

  return `uploads/${projectId}/${uniqueId}-${sanitized}`;
}

/**
 * Build public S3 URL from key
 */
export function buildS3Url(s3Key: string): string {
  const region = process.env.AWS_S3_IMPORTS_REGION || "us-east-1";
  const bucketName = bucket;
  return `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
}
