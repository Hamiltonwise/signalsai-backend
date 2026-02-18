/**
 * Status mapping utilities for admin agent insights.
 *
 * Handles the IGNORE -> NULL conversion and completed_at timestamp
 * logic for recommendation status updates.
 */

export interface StatusUpdatePayload {
  status: string | null;
  completed_at: Date | null;
  updated_at: Date;
}

const VALID_STATUSES = ["PASS", "REJECT", "IGNORE"];

/**
 * Validate that a status string is one of PASS, REJECT, or IGNORE.
 *
 * @param status - The status to validate
 * @returns true if valid
 */
export function isValidStatus(status: string): boolean {
  return VALID_STATUSES.includes(status);
}

/**
 * Map a user-facing status to the database value.
 * IGNORE is converted to null in the database.
 *
 * @param status - PASS, REJECT, or IGNORE
 * @returns The database status value (PASS, REJECT, or null)
 */
export function mapStatusToDb(status: string): string | null {
  return status === "IGNORE" ? null : status;
}

/**
 * Build the full update payload for a status change.
 *
 * - PASS: sets completed_at to now
 * - REJECT/IGNORE: clears completed_at to null
 * - IGNORE: converts status to null in database
 *
 * @param status - PASS, REJECT, or IGNORE
 * @returns StatusUpdatePayload ready for database update
 */
export function buildStatusUpdatePayload(status: string): StatusUpdatePayload {
  const dbStatus = mapStatusToDb(status);

  const payload: StatusUpdatePayload = {
    status: dbStatus,
    updated_at: new Date(),
    completed_at: null,
  };

  if (status === "PASS") {
    payload.completed_at = new Date();
  }

  return payload;
}
