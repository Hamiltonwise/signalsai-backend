export type GateSeverity = "blocker" | "warning";

export interface Defect {
  gate: string;
  severity: GateSeverity;
  message: string;
  evidence: {
    text?: string;
    sectionIndex?: number;
    sectionType?: string;
    field?: string;
    pagePath?: string;
  };
}

export interface GateResult {
  gate: string;
  passed: boolean;
  defects: Defect[];
  reasoning?: string;
}

export interface SiteQaContext {
  orgId?: number;
  projectId: string;
  pagePath?: string;
  sections: Section[];
  orgName?: string;
  currentYear: number;
  footer?: string;
  useLlm?: boolean;
}

export interface Section {
  id?: string;
  type?: string;
  html?: string;
  data?: Record<string, unknown>;
  children?: Section[];
  [key: string]: unknown;
}

export interface SiteQaReport {
  projectId: string;
  pagePath?: string;
  passed: boolean;
  gates: GateResult[];
  defects: Defect[];
  ranAt: string;
}
