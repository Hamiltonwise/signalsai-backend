/**
 * Media Quota Service
 *
 * Quota checking and calculation for project storage limits.
 * Enforces the 5 GB per-project storage cap.
 */

import { MediaModel } from "../../../models/website-builder/MediaModel";
import { PROJECT_STORAGE_LIMIT } from "../feature-utils/util.constants";

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
}

export interface QuotaInfo {
  used: number;
  limit: number;
  percentage: number;
}

/**
 * Check whether a project has enough storage quota for additional bytes.
 * Pass newFileSize=0 to just retrieve current usage.
 */
export async function checkQuota(
  projectId: string,
  newFileSize: number
): Promise<QuotaCheckResult> {
  const currentUsage = await MediaModel.getProjectStorageUsage(projectId);
  const newTotal = currentUsage + newFileSize;

  return {
    allowed: newTotal <= PROJECT_STORAGE_LIMIT,
    used: currentUsage,
    limit: PROJECT_STORAGE_LIMIT,
  };
}

/**
 * Get current storage usage with percentage for response formatting.
 */
export async function getCurrentUsage(
  projectId: string
): Promise<QuotaInfo> {
  const currentUsage = await MediaModel.getProjectStorageUsage(projectId);

  return {
    used: currentUsage,
    limit: PROJECT_STORAGE_LIMIT,
    percentage: Math.round((currentUsage / PROJECT_STORAGE_LIMIT) * 100),
  };
}
