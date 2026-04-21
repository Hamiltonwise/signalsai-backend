import type { GuidaraTier } from "./guidara95_5";
import type { OrgSnapshot } from "../economic/economicCalc";

export interface NarratorEvent {
  id?: string;
  eventType: string;
  orgId: number | null;
  properties: Record<string, unknown>;
  createdAt?: Date | string;
}

export interface TemplateContext {
  event: NarratorEvent;
  org: OrgSnapshot;
  nowIso: string;
}

export interface NarratorOutput {
  emit: boolean;
  finding: string;
  dollar: string | null;
  action: string;
  tier: GuidaraTier;
  template: string;
  dataGapReason: string | null;
  confidence: number;
  voiceCheckPassed: boolean;
  voiceViolations: string[];
  /**
   * Optional channel hints — the emit surface may not honor these. Phase 4 wiring.
   */
  surfaces?: {
    dashboard?: boolean;
    email?: boolean;
    notification?: boolean;
  };
}

export type TemplateFn = (ctx: TemplateContext) => NarratorOutput;
