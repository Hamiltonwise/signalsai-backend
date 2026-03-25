import { db } from "../database/connection";

/**
 * Audit Logger -- compliance and trust mechanism.
 *
 * Writes to audit_log table. Non-blocking (fire and forget).
 * Never throws -- audit logging failure must not break the request.
 *
 * Usage:
 *   logAuditEvent({
 *     actorType: "admin",
 *     actorId: "corey@getalloro.com",
 *     action: "org.impersonated",
 *     targetType: "organization",
 *     targetId: "42",
 *     afterState: { impersonated_org_id: 42 },
 *     req,
 *   });
 */

export interface AuditEvent {
  actorType: "admin" | "agent" | "system";
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  req?: { ip?: string; headers?: Record<string, unknown> };
}

/**
 * Log an audit event. Fire-and-forget -- never throws.
 */
export function logAuditEvent(params: AuditEvent): void {
  const {
    actorType,
    actorId,
    action,
    targetType,
    targetId,
    beforeState,
    afterState,
    req,
  } = params;

  // Fire and forget -- catch all errors silently
  db("audit_log")
    .insert({
      actor_type: actorType,
      actor_id: actorId || null,
      action,
      target_type: targetType || null,
      target_id: targetId || null,
      before_state: beforeState ? JSON.stringify(beforeState) : null,
      after_state: afterState ? JSON.stringify(afterState) : null,
      ip_address: req?.ip || null,
      user_agent:
        (req?.headers?.["user-agent"] as string) ||
        null,
    })
    .then(() => {
      // Silent success
    })
    .catch((err) => {
      console.warn(`[AUDIT] Failed to log event "${action}":`, err.message);
    });
}

// ── Convenience helpers for common actions ───────────────────────

export function logImpersonationStart(
  adminEmail: string,
  targetOrgId: number,
  req?: AuditEvent["req"],
): void {
  logAuditEvent({
    actorType: "admin",
    actorId: adminEmail,
    action: "org.impersonation_started",
    targetType: "organization",
    targetId: String(targetOrgId),
    req,
  });
}

export function logImpersonationEnd(
  adminEmail: string,
  targetOrgId: number,
  req?: AuditEvent["req"],
): void {
  logAuditEvent({
    actorType: "admin",
    actorId: adminEmail,
    action: "org.impersonation_ended",
    targetType: "organization",
    targetId: String(targetOrgId),
    req,
  });
}

export function logBillingChange(
  actorId: string,
  orgId: number,
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
  req?: AuditEvent["req"],
): void {
  logAuditEvent({
    actorType: "admin",
    actorId,
    action: "billing.modified",
    targetType: "organization",
    targetId: String(orgId),
    beforeState,
    afterState,
    req,
  });
}

export function logBaaSigned(
  actorId: string,
  orgId: number,
  req?: AuditEvent["req"],
): void {
  logAuditEvent({
    actorType: "admin",
    actorId,
    action: "baa.signed",
    targetType: "organization",
    targetId: String(orgId),
    afterState: { baa_signed: true, baa_signed_at: new Date().toISOString() },
    req,
  });
}

export function logOrgDeleted(
  actorId: string,
  orgId: number,
  orgName: string,
  req?: AuditEvent["req"],
): void {
  logAuditEvent({
    actorType: "admin",
    actorId,
    action: "organization.deleted",
    targetType: "organization",
    targetId: String(orgId),
    beforeState: { name: orgName },
    req,
  });
}

export function logUserRoleChange(
  actorId: string,
  userId: number,
  beforeRole: string,
  afterRole: string,
  req?: AuditEvent["req"],
): void {
  logAuditEvent({
    actorType: "admin",
    actorId,
    action: "user.role_changed",
    targetType: "user",
    targetId: String(userId),
    beforeState: { role: beforeRole },
    afterState: { role: afterRole },
    req,
  });
}
