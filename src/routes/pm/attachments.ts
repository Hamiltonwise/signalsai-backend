/**
 * PM Task Attachments Routes
 *
 * Per-task file attachments — upload to S3, list, get presigned download URL,
 * delete. Mounted at `/api/pm` (see src/routes/pm/index.ts); paths here are
 * absolute from that mount point.
 *
 * Multer: memory storage, 100 MB limit, single file per request. MIME
 * validation happens in the controller against the whitelist in
 * pm-attachments-utils/constants.ts.
 */

import express from "express";
import multer from "multer";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmAttachmentsController";
import { MAX_FILE_SIZE_BYTES } from "../../controllers/pm/pm-attachments-utils/constants";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

// POST /api/pm/tasks/:id/attachments
router.post(
  "/tasks/:id/attachments",
  authenticateToken,
  superAdminMiddleware,
  upload.single("file"),
  controller.uploadAttachment
);

// GET /api/pm/tasks/:id/attachments
router.get(
  "/tasks/:id/attachments",
  authenticateToken,
  superAdminMiddleware,
  controller.listAttachments
);

// GET /api/pm/tasks/:id/attachments/:attachmentId/url
router.get(
  "/tasks/:id/attachments/:attachmentId/url",
  authenticateToken,
  superAdminMiddleware,
  controller.getAttachmentDownloadUrl
);

// DELETE /api/pm/tasks/:id/attachments/:attachmentId
router.delete(
  "/tasks/:id/attachments/:attachmentId",
  authenticateToken,
  superAdminMiddleware,
  controller.deleteAttachment
);

export default router;
