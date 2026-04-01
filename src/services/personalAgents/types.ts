/**
 * Personal Agent Types
 *
 * Shared interfaces for all personal team agents.
 */

export interface BriefSection {
  title: string;
  items: string[];
}

export interface PersonalBrief {
  headline: string;
  sections: BriefSection[];
  signoff: string;
  urgentCount: number;
}

export interface AgentHandoff {
  sourceAgent: string;
  targetAgent: string;
  context: string;
  requestedAction: string;
  timestamp: Date;
}

export type TeamRole = "visionary" | "integrator" | "build";
