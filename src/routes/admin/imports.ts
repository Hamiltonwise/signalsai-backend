/**
 * Admin Imports API Routes
 *
 * CRUD for website_builder.alloro_imports — self-hosted CSS, JS,
 * images, and other assets that templates can reference via URL.
 *
 * Each import supports versioning: edits create new versions.
 * Statuses: published (one per filename), active, deprecated.
 */

import express from "express";
import * as controller from "../../controllers/admin-imports/AdminImportsController";
import { upload } from "../../controllers/admin-imports/feature-utils/fileUploadConfig";

const router = express.Router();

// GET /imports — List all imports with filtering and grouping
router.get("/", controller.listImports);

// POST /imports — Create new import (first version)
router.post("/", upload.single("file"), controller.createImport);

// GET /imports/:id — Get single import with all versions
router.get("/:id", controller.getImport);

// POST /imports/:id/new-version — Upload new version of existing import
router.post("/:id/new-version", upload.single("file"), controller.createNewVersion);

// PATCH /imports/:id/status — Change version status
router.patch("/:id/status", controller.updateStatus);

// DELETE /imports/:id — Delete all versions of an import
router.delete("/:id", controller.deleteImport);

export default router;
