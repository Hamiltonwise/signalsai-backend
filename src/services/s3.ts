/**
 * S3 Service — Upload, download, and delete files from AWS S3
 *
 * Used by the alloro_imports system to store CSS, JS, images, and other
 * assets that templates can reference via /api/imports/:filename
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const bucket = process.env.AWS_S3_IMPORTS_BUCKET || "alloro-imports";
const region = process.env.AWS_S3_IMPORTS_REGION || "us-east-1";

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

/**
 * Upload a file buffer to S3
 */
export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Get a file from S3 — returns the readable stream and content type
 */
export async function getFromS3(
  key: string
): Promise<{ body: ReadableStream | NodeJS.ReadableStream; contentType: string }> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  return {
    body: response.Body as NodeJS.ReadableStream,
    contentType: response.ContentType || "application/octet-stream",
  };
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

/**
 * Build an S3 key for an import file
 * Format: imports/{filename}/v{version}/{originalFilename}
 */
export function buildS3Key(
  filename: string,
  version: number,
  originalFilename: string
): string {
  return `imports/${filename}/v${version}/${originalFilename}`;
}

export { bucket };
