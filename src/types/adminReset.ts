/**
 * Admin Reset Agent Outputs — shared types
 *
 * These types are used by:
 *   - Backend service (feature-services/service.reset-org-data.ts)
 *   - Backend controller (AdminOrganizationsController.ts)
 *   - Frontend API client + modal (mirror copy in frontend if no shared module)
 *
 * v1 scope: 2 reset groups (`pms_ingestion`, `agent_referral`).
 * The PMS -> Referral Engine cascade is enforced in the UI, NOT the server —
 * the backend deletes literally what's in the `groups` array.
 */

export type ResetGroupKey = "pms_ingestion" | "agent_referral";

export const RESET_GROUP_KEYS: readonly ResetGroupKey[] = [
  "pms_ingestion",
  "agent_referral",
] as const;

export type ResetGroupCounts = Record<ResetGroupKey, number>;

export interface ResetPreviewResponse {
  orgId: number;
  orgName: string;
  counts: ResetGroupCounts;
}

export interface ResetRequest {
  groups: ResetGroupKey[];
  confirmName: string;
}

export interface ResetResponse {
  success: true;
  groupsExecuted: ResetGroupKey[];
  deletedCounts: Record<string, number>;
}
