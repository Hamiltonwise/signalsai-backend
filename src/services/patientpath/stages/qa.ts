/**
 * Manifest v2 Card 2 — QA stage.
 *
 * Invokes the Site QA Agent (Card 1) on the copy output. Returns pass/fail
 * and the full report so the orchestrator can decide whether to retry the
 * Copy stage or escalate.
 */

import { db } from "../../../database/connection";
import { BehavioralEventModel } from "../../../models/BehavioralEventModel";
import { runSiteQa } from "../../siteQa/siteQaAgent";
import { dbCollisionFetcher } from "../../siteQa/dbCollisionFetcher";
import type { Section, SiteQaReport } from "../../siteQa/types";

export interface QaStageInput {
  orgId: number;
  copyId: string;
  copy: any;
  projectIdHint?: string;
  orgName?: string;
  footer?: string;
  qaEnabled?: boolean;
}

export interface QaStageResult {
  passed: boolean;
  report: SiteQaReport;
  durationMs: number;
}

function copyToSections(copy: any): Section[] {
  const sections = Array.isArray(copy?.sections) ? copy.sections : [];
  return sections.map((s: any) => ({
    id: s.name ?? undefined,
    type: s.name ?? "section",
    data: {
      headline: s.headline ?? "",
      body: s.body ?? "",
      imagePrompt: s.imagePrompt ?? "",
    },
  }));
}

export async function runQaStage(input: QaStageInput): Promise<QaStageResult> {
  const start = Date.now();
  const currentYear = new Date().getUTCFullYear();
  const sections = copyToSections(input.copy);

  const report = await runSiteQa(
    {
      orgId: input.orgId,
      projectId: input.projectIdHint ?? `orchestrator-${input.copyId}`,
      pagePath: "/",
      sections,
      orgName: input.orgName,
      currentYear,
      footer: input.footer,
      useLlm: Boolean(input.qaEnabled),
    },
    { collisionFetcher: dbCollisionFetcher }
  );

  await db("copy_outputs")
    .where({ id: input.copyId })
    .update({
      status: report.passed ? "qa_passed" : "qa_failed",
      qa_attempts: db.raw("qa_attempts + 1"),
      updated_at: new Date(),
    });

  await BehavioralEventModel.create({
    event_type: report.passed ? "copy.qa_passed" : "copy.qa_failed",
    org_id: input.orgId,
    properties: {
      copy_id: input.copyId,
      defect_count: report.defects.length,
      gate_failures: report.gates.filter((g) => !g.passed).map((g) => g.gate),
    },
  }).catch(() => {});

  return { passed: report.passed, report, durationMs: Date.now() - start };
}
