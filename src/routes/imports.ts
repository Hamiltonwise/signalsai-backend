/**
 * Public Imports Serving Routes
 *
 * Serves files from website_builder.alloro_imports via:
 *   GET /api/imports/:filename        — published version
 *   GET /api/imports/:filename/v/:ver — specific version (if active or published)
 *
 * Deprecated versions return 410 Gone.
 */

import express from "express";
import {
  servePublishedImport,
  serveVersionedImport,
} from "../controllers/imports/importsController";

const router = express.Router();

router.get("/:filename", servePublishedImport);
router.get("/:filename/v/:version", serveVersionedImport);

export default router;
