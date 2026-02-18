import {
  AlloroImportModel,
  IAlloroImport,
} from "../../../models/website-builder/AlloroImportModel";
import { isTextType } from "../feature-utils/mimeTypeUtils";
import { S3UploadResult } from "./ImportS3Service";

export interface CreateImportData {
  filename: string;
  display_name: string;
  type: string;
  mime_type: string;
  file_size: number;
  s3_key: string;
  s3_bucket: string;
  content_hash: string;
  text_content: string | null;
}

/** Create the first version of an import (version 1, status published) */
export async function createFirstVersion(
  data: CreateImportData
): Promise<IAlloroImport> {
  return AlloroImportModel.create({
    filename: data.filename,
    display_name: data.display_name,
    type: data.type,
    version: 1,
    status: "published",
    mime_type: data.mime_type,
    file_size: data.file_size,
    s3_key: data.s3_key,
    s3_bucket: data.s3_bucket,
    content_hash: data.content_hash,
    text_content: data.text_content,
  });
}

/** Get the next version number for a filename */
export async function getNextVersionNumber(
  filename: string
): Promise<number> {
  const latest = await AlloroImportModel.getLatestVersion(filename);
  return latest + 1;
}

/** Demote any currently published version to "active" for a filename */
export async function demotePublishedVersion(
  filename: string
): Promise<void> {
  await AlloroImportModel.updateStatusByFilename(
    filename,
    "published",
    "active"
  );
}

/**
 * Create a new version record in the database.
 * Caller is responsible for S3 upload and published demotion before calling this.
 */
export async function createVersionRecord(
  existing: IAlloroImport,
  newVersion: number,
  mimeType: string,
  fileSize: number,
  s3Result: S3UploadResult,
  buffer: Buffer
): Promise<IAlloroImport> {
  return AlloroImportModel.create({
    filename: existing.filename,
    display_name: existing.display_name,
    type: existing.type,
    version: newVersion,
    status: "published",
    mime_type: mimeType,
    file_size: fileSize,
    s3_key: s3Result.s3_key,
    s3_bucket: s3Result.s3_bucket,
    content_hash: s3Result.content_hash,
    text_content: isTextType(existing.type) ? buffer.toString("utf-8") : null,
  });
}
