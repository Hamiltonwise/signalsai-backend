import {
  AlloroImportModel,
  IAlloroImport,
} from "../../../models/website-builder/AlloroImportModel";

interface ServiceSuccess {
  success: true;
  data: IAlloroImport;
}

interface ServiceError {
  success: false;
  error: string;
  code: string;
  statusCode: number;
}

type ServiceResult = ServiceSuccess | ServiceError;

interface VersionValidation {
  valid: boolean;
  value?: number;
  error?: string;
}

export function validateVersionNumber(version: string): VersionValidation {
  const versionNum = parseInt(version, 10);

  if (isNaN(versionNum) || versionNum < 1) {
    return {
      valid: false,
      error: "Version must be a positive integer",
    };
  }

  return { valid: true, value: versionNum };
}

export async function getPublishedImport(
  filename: string
): Promise<ServiceResult> {
  const record = await AlloroImportModel.findByFilenameAndStatus(
    filename,
    "published"
  );

  if (!record) {
    return {
      success: false,
      error: "NOT_FOUND",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  return { success: true, data: record };
}

export async function getImportByVersion(
  filename: string,
  version: number
): Promise<ServiceResult> {
  const record = await AlloroImportModel.findByFilenameAndVersion(
    filename,
    version
  );

  if (!record) {
    return {
      success: false,
      error: "NOT_FOUND",
      code: "NOT_FOUND",
      statusCode: 404,
    };
  }

  if (record.status === "deprecated") {
    return {
      success: false,
      error: "DEPRECATED",
      code: "DEPRECATED",
      statusCode: 410,
    };
  }

  return { success: true, data: record };
}
