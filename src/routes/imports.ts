/**
 * Public Imports Serving Routes
 *
 * Serves files from website_builder.alloro_imports via:
 *   GET /api/imports/:filename        — published version
 *   GET /api/imports/:filename/v/:ver — specific version (if active or published)
 *
 * Deprecated versions return 410 Gone.
 */

import express, { Request, Response } from "express";
import { Readable } from "stream";
import { db } from "../database/connection";
import { getFromS3 } from "../services/s3";

const router = express.Router();

const IMPORTS_TABLE = "website_builder.alloro_imports";

/**
 * GET /api/imports/:filename
 * Serve the published version of an import
 */
router.get("/:filename", async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    const record = await db(IMPORTS_TABLE)
      .where({ filename, status: "published" })
      .first();

    if (!record) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: `No published version found for "${filename}"`,
      });
    }

    // Set appropriate headers
    res.setHeader("Content-Type", record.mime_type);
    res.setHeader("Content-Length", record.file_size);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Import-Version", record.version);

    if (record.content_hash) {
      res.setHeader("ETag", `"${record.content_hash}"`);
    }

    // For text types, serve directly from DB
    if (record.text_content) {
      return res.send(record.text_content);
    }

    // Stream from S3
    const { body } = await getFromS3(record.s3_key);
    if (body instanceof Readable) {
      return body.pipe(res);
    }
    // Web ReadableStream fallback
    const reader = (body as ReadableStream).getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(value);
      return pump();
    };
    await pump();
  } catch (error: any) {
    console.error(`[Imports] Error serving ${req.params.filename}:`, error);
    return res.status(500).json({
      error: "SERVE_ERROR",
      message: "Failed to serve import",
    });
  }
});

/**
 * GET /api/imports/:filename/v/:version
 * Serve a specific version of an import
 */
router.get("/:filename/v/:version", async (req: Request, res: Response) => {
  try {
    const { filename, version } = req.params;
    const versionNum = parseInt(version, 10);

    if (isNaN(versionNum) || versionNum < 1) {
      return res.status(400).json({
        error: "INVALID_VERSION",
        message: "Version must be a positive integer",
      });
    }

    const record = await db(IMPORTS_TABLE)
      .where({ filename, version: versionNum })
      .first();

    if (!record) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: `Version ${versionNum} not found for "${filename}"`,
      });
    }

    // Deprecated versions return 410 Gone
    if (record.status === "deprecated") {
      return res.status(410).json({
        error: "DEPRECATED",
        message: `Version ${versionNum} of "${filename}" has been deprecated`,
      });
    }

    // Set appropriate headers
    res.setHeader("Content-Type", record.mime_type);
    res.setHeader("Content-Length", record.file_size);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Import-Version", record.version);
    res.setHeader("X-Import-Status", record.status);

    if (record.content_hash) {
      res.setHeader("ETag", `"${record.content_hash}"`);
    }

    // For text types, serve directly from DB
    if (record.text_content) {
      return res.send(record.text_content);
    }

    // Stream from S3
    const { body } = await getFromS3(record.s3_key);
    if (body instanceof Readable) {
      return body.pipe(res);
    }
    const reader = (body as ReadableStream).getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(value);
      return pump();
    };
    await pump();
  } catch (error: any) {
    console.error(
      `[Imports] Error serving ${req.params.filename}/v/${req.params.version}:`,
      error
    );
    return res.status(500).json({
      error: "SERVE_ERROR",
      message: "Failed to serve import",
    });
  }
});

export default router;
