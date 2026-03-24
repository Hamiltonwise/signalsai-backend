/**
 * HIPAA Gate Service
 *
 * WO-HIPAA-GATE: Checks and manages BAA status for PMS upload gating.
 *
 * The moment a user can upload a file that might contain patient names,
 * Alloro becomes a Business Associate under HIPAA. This gate must exist
 * before the PMS parser ships to production.
 *
 * baa_signed and baa_signed_at columns already exist on organizations.
 */

import { db } from "../database/connection";

// ─── Types ──────────────────────────────────────────────────────────

export interface BAAStatus {
  baaSigned: boolean;
  baaSignedAt: string | null;
  canUploadPMS: boolean;
}

// ─── Check BAA Status ───────────────────────────────────────────────

/**
 * Check if an org has a signed BAA on file.
 * Must return true before any PMS data upload is allowed.
 */
export async function checkBAAStatus(orgId: number): Promise<BAAStatus> {
  const org = await db("organizations")
    .where({ id: orgId })
    .select("baa_signed", "baa_signed_at")
    .first();

  if (!org) {
    return { baaSigned: false, baaSignedAt: null, canUploadPMS: false };
  }

  return {
    baaSigned: !!org.baa_signed,
    baaSignedAt: org.baa_signed_at ? new Date(org.baa_signed_at).toISOString() : null,
    canUploadPMS: !!org.baa_signed,
  };
}

// ─── Sign BAA (superAdmin only) ─────────────────────────────────────

/**
 * Mark an org's BAA as signed.
 * Called by Corey after attorney review and client signature.
 * superAdmin-gated at the route level.
 */
export async function signBAA(orgId: number): Promise<BAAStatus> {
  await db("organizations")
    .where({ id: orgId })
    .update({
      baa_signed: true,
      baa_signed_at: new Date(),
    });

  console.log(`[HIPAA] BAA signed for org ${orgId}`);

  return {
    baaSigned: true,
    baaSignedAt: new Date().toISOString(),
    canUploadPMS: true,
  };
}

// ─── Revoke BAA (superAdmin only) ───────────────────────────────────

/**
 * Revoke an org's BAA. Used if agreement needs to be re-signed.
 */
export async function revokeBAA(orgId: number): Promise<BAAStatus> {
  await db("organizations")
    .where({ id: orgId })
    .update({
      baa_signed: false,
      baa_signed_at: null,
    });

  console.log(`[HIPAA] BAA revoked for org ${orgId}`);

  return {
    baaSigned: false,
    baaSignedAt: null,
    canUploadPMS: false,
  };
}

// ─── PMS Upload Guard ───────────────────────────────────────────────

/**
 * Guard function for PMS upload endpoints.
 * Returns true if upload is allowed, false if BAA gate blocks it.
 * Use this in the PMS upload route handler before processing any file.
 *
 * Usage:
 *   if (!await canUploadPMS(orgId)) {
 *     return res.status(403).json({
 *       success: false,
 *       error: "BAA_REQUIRED",
 *       message: "A signed Business Associate Agreement is required before uploading patient data.",
 *       action_url: "/settings/baa",
 *     });
 *   }
 */
export async function canUploadPMS(orgId: number): Promise<boolean> {
  const status = await checkBAAStatus(orgId);
  return status.canUploadPMS;
}

// T2 registers PATCH /api/user/baa-signed
