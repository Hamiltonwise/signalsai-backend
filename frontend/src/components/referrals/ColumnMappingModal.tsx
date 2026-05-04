/**
 * Card E (May 4 2026, re-scoped) — path-shim for the column mapping modal.
 *
 * The actual implementation lives at frontend/src/components/PMS/MappingConfirmStep.tsx
 * and was committed April 24 alongside the LLM column suggester service.
 * Re-scoped Card E references this path; this file re-exports the
 * canonical component so anything wired against /referrals/ColumnMappingModal
 * resolves cleanly. Do not duplicate logic here — single source of truth
 * stays at MappingConfirmStep.
 */

export { MappingConfirmStep as ColumnMappingModal } from "../PMS/MappingConfirmStep";
export type {
  MappingPreviewData,
  ReferralColumnMapping,
  ReferralMappingTarget,
} from "../../api/pms";
