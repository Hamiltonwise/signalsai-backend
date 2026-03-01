/**
 * Flood Detection Service
 *
 * Detects spam patterns on the /form-submission endpoint:
 * 1. Too many submissions from the same IP within a time window
 * 2. Duplicate content submissions (any IP) within a time window
 */

import { createHash } from "crypto";
import { FormSubmissionModel } from "../../../models/website-builder/FormSubmissionModel";

const WINDOW_MINUTES = 15;
const MAX_PER_IP = 5;

/**
 * Check if the sender IP has exceeded the submission limit within the window.
 */
export async function isIpFlooding(senderIp: string): Promise<boolean> {
  const count = await FormSubmissionModel.countRecentByIp(senderIp, WINDOW_MINUTES);
  return count >= MAX_PER_IP;
}

/**
 * Build a SHA-256 hash of the form contents for duplicate detection.
 */
export function hashContents(contents: Record<string, string>): string {
  const sorted = Object.keys(contents)
    .sort()
    .map((k) => `${k}:${contents[k]}`)
    .join("|");
  return createHash("sha256").update(sorted).digest("hex");
}

/**
 * Check if identical content was already submitted recently.
 */
export async function isDuplicateContent(
  projectId: string,
  contentHash: string,
): Promise<boolean> {
  const count = await FormSubmissionModel.countRecentByContentHash(
    projectId,
    contentHash,
    WINDOW_MINUTES,
  );
  return count > 0;
}
