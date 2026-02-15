/**
 * Admin Media API Routes
 *
 * CRUD operations for website_builder.media - project media uploads
 * with S3 storage, quota enforcement, and usage tracking
 *
 * Features:
 * - Bulk upload (up to 20 files)
 * - Image processing (WebP conversion, thumbnails via Sharp)
 * - Video uploads (no thumbnail extraction, stored as-is)
 * - PDF uploads (stored as-is)
 * - 5 GB quota per project
 * - Usage tracking (which pages reference which media)
 * - Pagination (50 items per page)
 */

import express, { Request, Response } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../database/connection";
import { uploadToS3, deleteFromS3, bucket } from "../../services/s3";
import {
  processImage,
  isProcessableImage,
  isVideo,
  isPDF,
} from "../../services/mediaProcessor";

const router = express.Router({ mergeParams: true }); // Preserve :projectId param

const MEDIA_TABLE = "website_builder.media";
const PAGES_TABLE = "website_builder.pages";
const PROJECTS_TABLE = "website_builder.projects";

// Multer config: memory storage, 25 MB limit, accept all files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const PROJECT_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024; // 5 GB

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "video/mp4",
  "application/pdf",
];

// =====================================================================
// Helper Functions
// =====================================================================

/**
 * Validate MIME type against whitelist
 */
function validateMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * Check project storage quota
 */
async function checkProjectQuota(
  projectId: string,
  newFileSize: number
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const result = await db(MEDIA_TABLE)
    .where({ project_id: projectId })
    .sum("file_size as total")
    .first();

  const currentUsage = parseInt(result?.total || "0");
  const newTotal = currentUsage + newFileSize;

  return {
    allowed: newTotal <= PROJECT_STORAGE_LIMIT,
    used: currentUsage,
    limit: PROJECT_STORAGE_LIMIT,
  };
}

/**
 * Build S3 key for media file
 */
function buildMediaS3Key(
  projectId: string,
  filename: string,
  isThumb: boolean = false
): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniqueId = uuidv4().slice(0, 8);

  if (isThumb) {
    return `uploads/${projectId}/thumbs/${uniqueId}-thumb.webp`;
  }

  // For images: will be converted to .webp (extension handled after processing)
  // For videos/PDFs: keep original extension
  return `uploads/${projectId}/${uniqueId}-${sanitized}`;
}

/**
 * Build public S3 URL from key
 */
function buildS3Url(s3Key: string): string {
  const region = process.env.AWS_S3_IMPORTS_REGION || "us-east-1";
  const bucketName = bucket;
  return `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
}

/**
 * Find pages that reference a media URL
 */
async function findMediaUsage(
  projectId: string,
  s3Url: string
): Promise<string[]> {
  const pages = await db(PAGES_TABLE)
    .where({ project_id: projectId })
    .select("path", "sections");

  const usedInPages: string[] = [];

  for (const page of pages) {
    const sectionsArray = Array.isArray(page.sections)
      ? page.sections
      : page.sections?.sections || [];

    for (const section of sectionsArray) {
      if (section.content?.includes(s3Url)) {
        usedInPages.push(page.path);
        break; // Don't double-count same page
      }
    }
  }

  return usedInPages;
}

// =====================================================================
// POST /api/admin/websites/:projectId/media - Upload media (bulk)
// =====================================================================

router.post(
  "/",
  upload.array("files", 20),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "NO_FILES",
          message: "No files provided for upload",
        });
      }

      console.log(`[Media] Uploading ${files.length} files for project ${projectId}`);

      // Verify project exists (security check)
      const project = await db(PROJECTS_TABLE).where("id", projectId).first();
      if (!project) {
        return res.status(404).json({
          success: false,
          error: "PROJECT_NOT_FOUND",
          message: "Project not found",
        });
      }

      // Check quota BEFORE processing
      const totalNewSize = files.reduce((sum, f) => sum + f.size, 0);
      const quotaCheck = await checkProjectQuota(projectId, totalNewSize);

      if (!quotaCheck.allowed) {
        return res.status(507).json({
          success: false,
          error: "QUOTA_EXCEEDED",
          message: `Storage quota exceeded. Used: ${(quotaCheck.used / 1024 / 1024 / 1024).toFixed(2)} GB, Limit: 5 GB`,
          quota: {
            used: quotaCheck.used,
            limit: quotaCheck.limit,
            percentage: Math.round((quotaCheck.used / quotaCheck.limit) * 100),
          },
        });
      }

      // Process and upload files in parallel
      const uploadPromises = files.map(async (file) => {
        try {
          // Validate MIME type
          if (!validateMimeType(file.mimetype)) {
            throw new Error(`File type not supported: ${file.mimetype}`);
          }

          const originalFilename = file.originalname;
          const displayName = originalFilename;

          let s3Key: string;
          let s3Url: string;
          let thumbnailS3Key: string | null = null;
          let thumbnailS3Url: string | null = null;
          let width: number | null = null;
          let height: number | null = null;
          let finalMimeType = file.mimetype;
          let originalMimeType: string | null = null;
          let compressed = false;
          let finalBuffer = file.buffer;

          // Process based on file type
          if (isProcessableImage(file.mimetype)) {
            // Image: compress, convert to WebP, generate thumbnail
            const processed = await processImage(file.buffer, file.mimetype);

            finalBuffer = processed.buffer;
            finalMimeType = processed.mimeType;
            width = processed.width;
            height = processed.height;
            originalMimeType = processed.originalMimeType;
            compressed = processed.compressed;

            // Upload main file (WebP)
            s3Key = buildMediaS3Key(projectId, originalFilename) + ".webp";
            await uploadToS3(s3Key, finalBuffer, finalMimeType);
            s3Url = buildS3Url(s3Key);

            // Upload thumbnail
            if (processed.thumbnailBuffer) {
              thumbnailS3Key = buildMediaS3Key(projectId, originalFilename, true);
              await uploadToS3(
                thumbnailS3Key,
                processed.thumbnailBuffer,
                "image/webp"
              );
              thumbnailS3Url = buildS3Url(thumbnailS3Key);
            }
          } else if (isVideo(file.mimetype) || isPDF(file.mimetype)) {
            // Video/PDF: upload as-is (no processing)
            s3Key = buildMediaS3Key(projectId, originalFilename);
            await uploadToS3(s3Key, finalBuffer, finalMimeType);
            s3Url = buildS3Url(s3Key);
          } else {
            throw new Error(`Unsupported file type: ${file.mimetype}`);
          }

          // Insert DB record
          const [record] = await db(MEDIA_TABLE)
            .insert({
              project_id: projectId,
              filename: originalFilename,
              display_name: displayName,
              s3_key: s3Key,
              s3_url: s3Url,
              file_size: file.size,
              mime_type: finalMimeType,
              width,
              height,
              thumbnail_s3_key: thumbnailS3Key,
              thumbnail_s3_url: thumbnailS3Url,
              original_mime_type: originalMimeType,
              compressed,
            })
            .returning("*");

          console.log(`[Media] Uploaded ${originalFilename} → ${s3Key}`);

          return record;
        } catch (error) {
          console.error(`[Media] Error processing file ${file.originalname}:`, error);
          return {
            error: true,
            filename: file.originalname,
            message: error instanceof Error ? error.message : "Upload failed",
          };
        }
      });

      const results = await Promise.all(uploadPromises);

      // Separate successes and failures
      const succeeded = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);

      // Get updated quota
      const finalQuota = await checkProjectQuota(projectId, 0);

      return res.status(201).json({
        success: true,
        data: succeeded,
        failed: failed.length > 0 ? failed : undefined,
        quota: {
          used: finalQuota.used,
          limit: finalQuota.limit,
          percentage: Math.round((finalQuota.used / finalQuota.limit) * 100),
        },
      });
    } catch (error: any) {
      console.error("[Media] Upload error:", error);
      return res.status(500).json({
        success: false,
        error: "UPLOAD_ERROR",
        message: error?.message || "Failed to upload media",
      });
    }
  }
);

// =====================================================================
// GET /api/admin/websites/:projectId/media - List media (paginated)
// =====================================================================

router.get("/", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { type, search, page = "1", limit = "50" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    console.log(`[Media] Fetching media for project ${projectId} (page ${pageNum})`);

    // Build base query WITHOUT orderBy (for both count and data)
    let baseQuery = db(MEDIA_TABLE).where({ project_id: projectId });

    // Filter by type
    if (type && type !== "all") {
      if (type === "image") {
        baseQuery = baseQuery.where("mime_type", "like", "image/%");
      } else if (type === "video") {
        baseQuery = baseQuery.where("mime_type", "like", "video/%");
      } else if (type === "pdf") {
        baseQuery = baseQuery.where("mime_type", "application/pdf");
      }
    }

    // Search by filename or display_name
    if (search) {
      baseQuery = baseQuery.where(function () {
        this.where("filename", "ilike", `%${search}%`).orWhere(
          "display_name",
          "ilike",
          `%${search}%`
        );
      });
    }

    // Get total count (no ORDER BY needed for count)
    const countQuery = baseQuery.clone().count("* as count").first();

    // Get paginated media (with ORDER BY)
    const mediaQuery = baseQuery
      .clone()
      .orderBy("created_at", "desc")
      .limit(limitNum)
      .offset(offset);

    const [media, countResult] = await Promise.all([mediaQuery, countQuery]);

    const total = parseInt(countResult?.count as string || "0");
    const hasMore = offset + media.length < total;

    // Add usage tracking for each media item
    const mediaWithUsage = await Promise.all(
      media.map(async (item) => {
        const pagesUsing = await findMediaUsage(projectId, item.s3_url);
        return {
          ...item,
          usedInPages: pagesUsing.length,
        };
      })
    );

    // Get quota
    const quota = await checkProjectQuota(projectId, 0);

    return res.json({
      success: true,
      data: mediaWithUsage,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        hasMore,
      },
      quota: {
        used: quota.used,
        limit: quota.limit,
        percentage: Math.round((quota.used / quota.limit) * 100),
      },
    });
  } catch (error: any) {
    console.error("[Media] List error:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch media",
    });
  }
});

// =====================================================================
// PATCH /api/admin/websites/:projectId/media/:mediaId - Update metadata
// =====================================================================

router.patch("/:mediaId", async (req: Request, res: Response) => {
  try {
    const { projectId, mediaId } = req.params;
    const { display_name, alt_text } = req.body;

    console.log(`[Media] Updating media ${mediaId}`);

    // Verify media belongs to project
    const media = await db(MEDIA_TABLE)
      .where({ id: mediaId, project_id: projectId })
      .first();

    if (!media) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Media not found",
      });
    }

    // Update fields
    const updates: any = { updated_at: db.fn.now() };
    if (display_name !== undefined) updates.display_name = display_name;
    if (alt_text !== undefined) updates.alt_text = alt_text;

    const [updated] = await db(MEDIA_TABLE)
      .where({ id: mediaId })
      .update(updates)
      .returning("*");

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    console.error("[Media] Update error:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update media",
    });
  }
});

// =====================================================================
// DELETE /api/admin/websites/:projectId/media/:mediaId - Delete media
// =====================================================================

router.delete("/:mediaId", async (req: Request, res: Response) => {
  try {
    const { projectId, mediaId } = req.params;
    const { force } = req.query;

    console.log(`[Media] Deleting media ${mediaId}`);

    // Verify media belongs to project
    const media = await db(MEDIA_TABLE)
      .where({ id: mediaId, project_id: projectId })
      .first();

    if (!media) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Media not found",
      });
    }

    // Check usage (unless force=true)
    if (force !== "true") {
      const pagesUsing = await findMediaUsage(projectId, media.s3_url);

      if (pagesUsing.length > 0) {
        return res.status(400).json({
          success: false,
          error: "MEDIA_IN_USE",
          message: `Media is used in ${pagesUsing.length} page(s)`,
          pagesUsing,
        });
      }
    }

    // Delete from S3
    try {
      await deleteFromS3(media.s3_key);
    } catch (s3Err) {
      console.warn(`[Media] Failed to delete S3 object ${media.s3_key}:`, s3Err);
      // Non-blocking: continue with DB delete
    }

    // Delete thumbnail if exists
    if (media.thumbnail_s3_key) {
      try {
        await deleteFromS3(media.thumbnail_s3_key);
      } catch (s3Err) {
        console.warn(
          `[Media] Failed to delete S3 thumbnail ${media.thumbnail_s3_key}:`,
          s3Err
        );
      }
    }

    // Delete from DB
    await db(MEDIA_TABLE).where({ id: mediaId }).del();

    console.log(`[Media] Deleted ${media.filename}`);

    return res.json({
      success: true,
      message: "Media deleted successfully",
    });
  } catch (error: any) {
    console.error("[Media] Delete error:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete media",
    });
  }
});

export default router;
