/**
 * Compliance Gate Service
 *
 * Vertical-aware data upload gating.
 * Healthcare verticals: BAA required before uploading data with PHI.
 * Non-healthcare verticals: upload allowed without BAA (no PHI involved).
 *
 * baa_signed and baa_signed_at columns exist on organizations.
 */

import { db } from "../database/connection";
import { logAuditEvent } from "./auditLogger";

// ─── Vertical Classification ────────────────────────────────────────

const HEALTHCARE_VERTICALS = new Set([
  "endodontics",
  "orthodontics",
  "general_dentistry",
  "chiropractic",
  "physical_therapy",
  "optometry",
  "medical",
  "dental",
  "veterinary",
]);

function isHealthcareVertical(vertical: string | null | undefined): boolean {
  if (!vertical) return false;
  return HEALTHCARE_VERTICALS.has(vertical.toLowerCase());
}

// ─── Types ──────────────────────────────────────────────────────────

export interface BAAStatus {
  baaSigned: boolean;
  baaSignedAt: string | null;
  canUploadData: boolean;
  requiresBAA: boolean;
  vertical: string | null;
}

// ─── Check BAA Status ───────────────────────────────────────────────

export async function checkBAAStatus(orgId: number): Promise<BAAStatus> {
  const org = await db("organizations")
    .where({ id: orgId })
    .select("baa_signed", "baa_signed_at", "id")
    .first();

  if (!org) {
    return { baaSigned: false, baaSignedAt: null, canUploadData: false, requiresBAA: true, vertical: null };
  }

  // Check vertical from vocabulary config
  const vocabConfig = await db("vocabulary_configs").where({ org_id: orgId }).first();
  const vertical = vocabConfig?.vertical || null;
  const requiresBAA = isHealthcareVertical(vertical);

  return {
    baaSigned: !!org.baa_signed,
    baaSignedAt: org.baa_signed_at ? new Date(org.baa_signed_at).toISOString() : null,
    canUploadData: requiresBAA ? !!org.baa_signed : true,
    requiresBAA,
    vertical,
  };
}

// ─── Sign BAA (superAdmin only) ─────────────────────────────────────

export async function signBAA(orgId: number, actorEmail?: string): Promise<BAAStatus> {
  await db("organizations")
    .where({ id: orgId })
    .update({
      baa_signed: true,
      baa_signed_at: new Date(),
    });

  await logAuditEvent({
    actorType: "admin",
    actorId: actorEmail || "system",
    action: "baa.signed",
    targetType: "organization",
    targetId: String(orgId),
  });

  const status = await checkBAAStatus(orgId);
  return status;
}

// ─── Revoke BAA (superAdmin only) ───────────────────────────────────

export async function revokeBAA(orgId: number, actorEmail?: string): Promise<BAAStatus> {
  await db("organizations")
    .where({ id: orgId })
    .update({
      baa_signed: false,
      baa_signed_at: null,
    });

  logAuditEvent({
    actorType: "admin",
    actorId: actorEmail || "system",
    action: "baa.revoked",
    targetType: "organization",
    targetId: String(orgId),
  });

  const status = await checkBAAStatus(orgId);
  return status;
}

// ─── Data Upload Guard ──────────────────────────────────────────────

/**
 * Guard function for data upload endpoints.
 * Healthcare verticals: requires signed BAA before upload.
 * Non-healthcare verticals: always allowed.
 */
export async function canUploadPMS(orgId: number): Promise<boolean> {
  const status = await checkBAAStatus(orgId);
  return status.canUploadData;
}
