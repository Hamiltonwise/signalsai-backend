import {
  AlloroImportModel,
  IAlloroImport,
} from "../../../models/website-builder/AlloroImportModel";

const VALID_STATUSES = ["published", "active", "deprecated"];

export interface StatusChangeResult {
  updated: IAlloroImport;
  previouslyPublished: { id: string; version: number } | null;
}

/** Validate that a status value is one of: published, active, deprecated */
export function validateStatus(status: string): boolean {
  return VALID_STATUSES.includes(status);
}

/**
 * Change the status of an import version.
 * If publishing, demotes any existing published version for the same filename.
 */
export async function changeStatus(
  id: string,
  newStatus: string
): Promise<StatusChangeResult> {
  const record = await AlloroImportModel.findById(id);
  if (!record) {
    const error = new Error("Import not found") as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    throw error;
  }

  let previouslyPublished: { id: string; version: number } | null = null;

  if (newStatus === "published") {
    const existing = await AlloroImportModel.findPublishedVersionExcludingId(
      record.filename,
      id
    );

    if (existing) {
      await AlloroImportModel.updateStatusReturning(existing.id, "active");
      previouslyPublished = { id: existing.id, version: existing.version };
    }
  }

  const updated = await AlloroImportModel.updateStatusReturning(id, newStatus);

  return { updated, previouslyPublished };
}
