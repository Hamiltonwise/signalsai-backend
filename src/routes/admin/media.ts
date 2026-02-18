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

import express from "express";
import multer from "multer";
import * as controller from "../../controllers/admin-media/AdminMediaController";

const router = express.Router({ mergeParams: true }); // Preserve :projectId param

// Multer config: memory storage, 25 MB limit, accept all files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// POST /api/admin/websites/:projectId/media — Bulk media upload
router.post("/", upload.array("files", 20), controller.uploadMedia);

// GET /api/admin/websites/:projectId/media — List media (paginated)
router.get("/", controller.listMedia);

// PATCH /api/admin/websites/:projectId/media/:mediaId — Update metadata
router.patch("/:mediaId", controller.updateMedia);

// DELETE /api/admin/websites/:projectId/media/:mediaId — Delete media
router.delete("/:mediaId", controller.deleteMedia);

export default router;
