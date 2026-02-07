/**
 * Admin Imports API Routes
 *
 * CRUD for website_builder.alloro_imports — self-hosted CSS, JS,
 * images, and other assets that templates can reference via URL.
 *
 * Each import supports versioning: edits create new versions.
 * Statuses: published (one per filename), active, deprecated.
 */

import crypto from "crypto";
import express, { Request, Response } from "express";
import multer from "multer";
import { db } from "../../database/connection";
import { uploadToS3, deleteFromS3, buildS3Key, bucket } from "../../services/s3";

const router = express.Router();

const IMPORTS_TABLE = "website_builder.alloro_imports";

// Multer — memory storage, 25 MB limit, accept all files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// =====================================================================
// Helpers
// =====================================================================

/** Determine the import "type" category from a MIME type */
function categorizeType(mimeType: string): string {
  if (mimeType === "text/css") return "css";
  if (
    mimeType === "application/javascript" ||
    mimeType === "text/javascript" ||
    mimeType === "application/x-javascript"
  )
    return "javascript";
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType.startsWith("font/") ||
    mimeType === "application/font-woff" ||
    mimeType === "application/font-woff2" ||
    mimeType === "application/vnd.ms-fontobject"
  )
    return "font";
  return "file";
}

/** Check if the file type is text-editable */
function isTextType(type: string): boolean {
  return type === "css" || type === "javascript";
}

// =====================================================================
// GET /imports — List all imports
// =====================================================================

router.get("/", async (req: Request, res: Response) => {
  try {
    const { type, status, search } = req.query;

    console.log("[Admin Imports] Fetching imports with filters:", req.query);

    let query = db(IMPORTS_TABLE).select("*");

    if (type && type !== "all") {
      query = query.where("type", type);
    }
    if (status && status !== "all") {
      query = query.where("status", status);
    }
    if (search) {
      query = query.where(function () {
        this.where("filename", "ilike", `%${search}%`).orWhere(
          "display_name",
          "ilike",
          `%${search}%`
        );
      });
    }

    const imports = await query.orderBy("filename", "asc").orderBy("version", "desc");

    // Group by filename for the list view
    const grouped: Record<
      string,
      { filename: string; display_name: string; type: string; versions: typeof imports }
    > = {};

    for (const row of imports) {
      if (!grouped[row.filename]) {
        grouped[row.filename] = {
          filename: row.filename,
          display_name: row.display_name,
          type: row.type,
          versions: [],
        };
      }
      grouped[row.filename].versions.push(row);
    }

    const result = Object.values(grouped).map((g) => {
      const published = g.versions.find((v: any) => v.status === "published");
      return {
        filename: g.filename,
        display_name: g.display_name,
        type: g.type,
        published_version: published?.version || null,
        latest_version: g.versions[0]?.version || 0,
        version_count: g.versions.length,
        status: published ? "published" : g.versions[0]?.status,
        updated_at: g.versions[0]?.updated_at,
        created_at: g.versions[g.versions.length - 1]?.created_at,
        id: published?.id || g.versions[0]?.id,
      };
    });

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
});

// =====================================================================
// POST /imports — Create a new import (first version)
// =====================================================================

router.post("/", upload.single("file"), async (req: Request, res: Response) => {
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
    const existing = await db(IMPORTS_TABLE).where("filename", filename).first();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_FILENAME",
        message: `An import with filename "${filename}" already exists. Use the new-version endpoint to add a version.`,
      });
    }

    const buffer = file?.buffer || Buffer.from(text_content || "", "utf-8");
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const s3Key = buildS3Key(filename, 1, originalFilename);

    // Upload to S3
    await uploadToS3(s3Key, buffer, mimeType);

    console.log(`[Admin Imports] Creating import: ${filename}`);

    const [record] = await db(IMPORTS_TABLE)
      .insert({
        filename,
        display_name: name,
        type,
        version: 1,
        status: "published",
        mime_type: mimeType,
        file_size: buffer.length,
        s3_key: s3Key,
        s3_bucket: bucket,
        content_hash: hash,
        text_content: isTextType(type) ? buffer.toString("utf-8") : null,
      })
      .returning("*");

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
});

// =====================================================================
// GET /imports/:id — Get a single import with all versions for its filename
// =====================================================================

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`[Admin Imports] Fetching import ID: ${id}`);

    const record = await db(IMPORTS_TABLE).where("id", id).first();

    if (!record) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Import not found",
      });
    }

    // Get all versions for this filename
    const versions = await db(IMPORTS_TABLE)
      .where("filename", record.filename)
      .orderBy("version", "desc");

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
});

// =====================================================================
// POST /imports/:id/new-version — Upload a new version of an existing import
// =====================================================================

router.post(
  "/:id/new-version",
  upload.single("file"),
  async (req: Request, res: Response) => {
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
      const existing = await db(IMPORTS_TABLE).where("id", id).first();
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: "Import not found",
        });
      }

      // Get the latest version number for this filename
      const latest = await db(IMPORTS_TABLE)
        .where("filename", existing.filename)
        .max("version as max_version")
        .first();

      const newVersion = (latest?.max_version || 0) + 1;

      const mimeType = file?.mimetype || existing.mime_type;
      const buffer = file?.buffer || Buffer.from(text_content || "", "utf-8");
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const originalFilename = file?.originalname || existing.filename;
      const s3Key = buildS3Key(existing.filename, newVersion, originalFilename);

      // Upload to S3
      await uploadToS3(s3Key, buffer, mimeType);

      console.log(
        `[Admin Imports] Creating version ${newVersion} for: ${existing.filename}`
      );

      // Downgrade any currently published version to "active"
      await db(IMPORTS_TABLE)
        .where({ filename: existing.filename, status: "published" })
        .update({ status: "active", updated_at: db.fn.now() });

      const [record] = await db(IMPORTS_TABLE)
        .insert({
          filename: existing.filename,
          display_name: existing.display_name,
          type: existing.type,
          version: newVersion,
          status: "published",
          mime_type: mimeType,
          file_size: buffer.length,
          s3_key: s3Key,
          s3_bucket: bucket,
          content_hash: hash,
          text_content: isTextType(existing.type)
            ? buffer.toString("utf-8")
            : null,
        })
        .returning("*");

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
);

// =====================================================================
// PATCH /imports/:id/status — Change version status
// =====================================================================

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["published", "active", "deprecated"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Status must be one of: published, active, deprecated",
      });
    }

    const record = await db(IMPORTS_TABLE).where("id", id).first();
    if (!record) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Import not found",
      });
    }

    // If publishing, check for existing published version and un-publish it
    let previouslyPublished = null;
    if (status === "published") {
      previouslyPublished = await db(IMPORTS_TABLE)
        .where({ filename: record.filename, status: "published" })
        .whereNot("id", id)
        .first();

      if (previouslyPublished) {
        await db(IMPORTS_TABLE)
          .where("id", previouslyPublished.id)
          .update({ status: "active", updated_at: db.fn.now() });
      }
    }

    const [updated] = await db(IMPORTS_TABLE)
      .where("id", id)
      .update({ status, updated_at: db.fn.now() })
      .returning("*");

    console.log(
      `[Admin Imports] Updated status of ${record.filename} v${record.version} to ${status}`
    );

    return res.json({
      success: true,
      data: updated,
      previouslyPublished: previouslyPublished
        ? { id: previouslyPublished.id, version: previouslyPublished.version }
        : null,
    });
  } catch (error: any) {
    console.error("[Admin Imports] Error updating status:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update status",
    });
  }
});

// =====================================================================
// DELETE /imports/:id — Delete all versions of an import
// =====================================================================

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const record = await db(IMPORTS_TABLE).where("id", id).first();
    if (!record) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Import not found",
      });
    }

    // Find all versions for this filename
    const allVersions = await db(IMPORTS_TABLE)
      .where("filename", record.filename)
      .select("id", "s3_key", "version");

    // Delete all S3 objects
    for (const version of allVersions) {
      if (version.s3_key) {
        try {
          await deleteFromS3(version.s3_key);
        } catch (s3Err) {
          console.warn(
            `[Admin Imports] Failed to delete S3 object ${version.s3_key}:`,
            s3Err
          );
        }
      }
    }

    // Delete all versions from database
    await db(IMPORTS_TABLE).where("filename", record.filename).del();

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
});

export default router;
