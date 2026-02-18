import { Response } from "express";
import { IAlloroImport } from "../../../models/website-builder/AlloroImportModel";

interface ResponseHeaderOptions {
  includeStatus?: boolean;
}

export function setImportResponseHeaders(
  res: Response,
  record: IAlloroImport,
  options: ResponseHeaderOptions = {}
): void {
  res.setHeader("Content-Type", record.mime_type as string);
  res.setHeader("Content-Length", record.file_size as number);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("X-Import-Version", record.version);

  if (options.includeStatus) {
    res.setHeader("X-Import-Status", record.status);
  }

  if (record.content_hash) {
    res.setHeader("ETag", `"${record.content_hash}"`);
  }
}
