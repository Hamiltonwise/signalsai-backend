import { Request, Response } from "express";
import { AlloroImportModel } from "../../models/website-builder/AlloroImportModel";
import { categorizeType, isTextType } from "./feature-utils/mimeTypeUtils";
import { groupImportsByFilename } from "./feature-utils/importGrouper";
import * as importS3Service from "./feature-services/ImportS3Service";
import * as importVersionService from "./feature-services/ImportVersionService";
import * as importStatusService from "./feature-services/ImportStatusService";

// =====================================================================
// GET /imports — List all imports
// =====================================================================

export async function listImports(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { type, status, search } = req.query;

    console.log("[Admin Imports] Fetching imports with filters:", req.query);

    const imports = await AlloroImportModel.listWithFilters({
      type: type as string | undefined,
      status: status as string | undefined,
      search: search as string | undefined,
    });

    const result = groupImportsByFilename(imports);

    console.log(`[Admin Imports] Found ${result.length} unique imports`);

    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("[Admin Imports] Error fetching imports:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch imports",
    });
  }
}

// =====================================================================
// POST /imports — Create a new import (first version)
// =====================================================================

export async function createImport(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const file = req.file;
    const { display_name, filename: customFilename, text_content } = req.body;

    // If no file and no text_content, error
    if (!file && !text_content) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Either a file upload or text_content is required",
      });
    }

    const mimeType = file?.mimetype || (req.body.mime_type || "text/plain");
    const type = categorizeType(mimeType);
    const originalFilename = file?.originalname || customFilename || "untitled";
    const filename = customFilename || originalFilename;
    const name = display_name || filename;

    // Check if filename already exists
    const existingVersions = await AlloroImportModel.findByFilename(filename);
    if (existingVersions.length > 0) {
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_FILENAME",
        message: `An import with filename "${filename}" already exists. Use the new-version endpoint to add a version.`,
      });
    }

    const buffer = file?.buffer || Buffer.from(text_content || "", "utf-8");

    // Upload to S3
    const s3Result = await importS3Service.uploadImport(
      filename,
      1,
      originalFilename,
      buffer,
      mimeType
    );

    console.log(`[Admin Imports] Creating import: ${filename}`);

    const record = await importVersionService.createFirstVersion({
      filename,
      display_name: name,
      type,
      mime_type: mimeType,
      file_size: buffer.length,
      s3_key: s3Result.s3_key,
      s3_bucket: s3Result.s3_bucket,
      content_hash: s3Result.content_hash,
      text_content: isTextType(type) ? buffer.toString("utf-8") : null,
    });

    console.log(`[Admin Imports] Created import ID: ${record.id}`);

    return res.status(201).json({ success: true, data: record });
  } catch (error: any) {
    console.error("[Admin Imports] Error creating import:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create import",
    });
  }
}

// =====================================================================
// GET /imports/:id — Get a single import with all versions for its filename
// =====================================================================

export async function getImport(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;

    console.log(`[Admin Imports] Fetching import ID: ${id}`);

    const record = await AlloroImportModel.findById(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Import not found",
      });
    }

    // Get all versions for this filename
    const versions = await AlloroImportModel.findByFilename(record.filename);

    return res.json({
      success: true,
      data: { ...record, versions },
    });
  } catch (error: any) {
    console.error("[Admin Imports] Error fetching import:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch import",
    });
  }
}

// =====================================================================
// POST /imports/:id/new-version — Upload a new version of an existing import
// =====================================================================

export async function createNewVersion(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const file = req.file;
    const { text_content } = req.body;

    if (!file && !text_content) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Either a file upload or text_content is required",
      });
    }

    // Get the existing import to know the filename
    const existing = await AlloroImportModel.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Import not found",
      });
    }

    // Get the next version number for this filename
    const newVersion = await importVersionService.getNextVersionNumber(
      existing.filename
    );

    const mimeType = file?.mimetype || existing.mime_type;
    const buffer = file?.buffer || Buffer.from(text_content || "", "utf-8");
    const originalFilename = file?.originalname || existing.filename;

    // Upload to S3
    const s3Result = await importS3Service.uploadImport(
      existing.filename,
      newVersion,
      originalFilename,
      buffer,
      mimeType as string
    );

    console.log(
      `[Admin Imports] Creating version ${newVersion} for: ${existing.filename}`
    );

    // Downgrade any currently published version to "active"
    await importVersionService.demotePublishedVersion(existing.filename);

    const record = await importVersionService.createVersionRecord(
      existing,
      newVersion,
      mimeType as string,
      buffer.length,
      s3Result,
      buffer
    );

    console.log(
      `[Admin Imports] Created and published version ${newVersion}, ID: ${record.id}`
    );

    return res.status(201).json({ success: true, data: record });
  } catch (error: any) {
    console.error("[Admin Imports] Error creating new version:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create new version",
    });
  }
}

// =====================================================================
// PATCH /imports/:id/status — Change version status
// =====================================================================

export async function updateStatus(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!importStatusService.validateStatus(status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Status must be one of: published, active, deprecated",
      });
    }

    const result = await importStatusService.changeStatus(id, status);

    console.log(
      `[Admin Imports] Updated status of ${result.updated.filename} v${result.updated.version} to ${status}`
    );

    return res.json({
      success: true,
      data: result.updated,
      previouslyPublished: result.previouslyPublished,
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Import not found",
      });
    }
    console.error("[Admin Imports] Error updating status:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update status",
    });
  }
}

// =====================================================================
// DELETE /imports/:id — Delete all versions of an import
// =====================================================================

export async function deleteImport(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;

    const record = await AlloroImportModel.findById(id);
    if (!record) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Import not found",
      });
    }

    // Find all versions for this filename
    const allVersions = await AlloroImportModel.findVersionsForDeletion(
      record.filename
    );

    // Delete all S3 objects
    await importS3Service.deleteAllVersions(allVersions);

    // Delete all versions from database
    await AlloroImportModel.deleteByFilename(record.filename);

    console.log(
      `[Admin Imports] Deleted all ${allVersions.length} versions of ${record.filename}`
    );

    return res.json({
      success: true,
      message: `Deleted all ${allVersions.length} versions of ${record.filename}`,
      data: { id, filename: record.filename, deletedCount: allVersions.length },
    });
  } catch (error: any) {
    console.error("[Admin Imports] Error deleting import:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete import",
    });
  }
}
