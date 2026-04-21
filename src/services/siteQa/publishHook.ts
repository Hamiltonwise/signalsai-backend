import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { runSiteQa } from "./siteQaAgent";
import { dbCollisionFetcher } from "./dbCollisionFetcher";
import type { SiteQaReport, Section } from "./types";

export interface PublishHookInput {
  projectId: string;
  pagePath?: string;
  sections: Section[];
  orgId?: number;
  footer?: string;
}

export interface PublishHookResult {
  allowed: boolean;
  mode: "enforced" | "shadow" | "disabled";
  report: SiteQaReport;
}

/**
 * Runs the Site QA gate on incoming publish content.
 *
 * - If org.patientpath_qa_enabled=true: hard gate. Returns allowed=false if any
 *   blocker defect is found and writes a dream_team_task of type
 *   'site_qa_block' with the full defect list.
 * - If org.patientpath_qa_enabled=false: shadow mode. Returns allowed=true but
 *   logs behavioral_event 'site.qa_shadow_run' with the defect count.
 *
 * Callers must check result.allowed before writing to website_builder.pages.
 */
export async function runPublishQaHook(input: PublishHookInput): Promise<PublishHookResult> {
  const currentYear = new Date().getUTCFullYear();

  let qaEnabled = false;
  let orgName: string | undefined;

  if (input.orgId != null) {
    try {
      const org = await db("organizations")
        .where({ id: input.orgId })
        .first("id", "name", "patientpath_qa_enabled");
      if (org) {
        qaEnabled = Boolean(org.patientpath_qa_enabled);
        orgName = org.name;
      }
    } catch {
      qaEnabled = false;
    }
  }

  const report = await runSiteQa(
    {
      orgId: input.orgId,
      projectId: input.projectId,
      pagePath: input.pagePath,
      sections: input.sections,
      orgName,
      currentYear,
      footer: input.footer,
      useLlm: qaEnabled,
    },
    { collisionFetcher: dbCollisionFetcher }
  );

  if (qaEnabled && !report.passed) {
    await createBlockTask(input, report).catch((err) => {
      console.error("[site-qa] Failed to write dream_team_task:", err?.message);
    });

    return { allowed: false, mode: "enforced", report };
  }

  if (qaEnabled && report.passed) {
    await BehavioralEventModel.create({
      event_type: "site.qa_passed",
      org_id: input.orgId ?? null,
      properties: {
        projectId: input.projectId,
        pagePath: input.pagePath ?? null,
        gatesRun: report.gates.length,
      },
    }).catch(() => {});
    return { allowed: true, mode: "enforced", report };
  }

  // Shadow mode: always allow, always log defect count for rollout telemetry
  await BehavioralEventModel.create({
    event_type: "site.qa_shadow_run",
    org_id: input.orgId ?? null,
    properties: {
      projectId: input.projectId,
      pagePath: input.pagePath ?? null,
      defectCount: report.defects.length,
      gateFailures: report.gates.filter((g) => !g.passed).map((g) => g.gate),
    },
  }).catch(() => {});

  return { allowed: true, mode: "shadow", report };
}

async function createBlockTask(input: PublishHookInput, report: SiteQaReport): Promise<void> {
  const title = `Site QA blocked publish for project ${input.projectId}${
    input.pagePath ? ` (${input.pagePath})` : ""
  }`;
  const description = formatDefectsForTask(report);

  await db("dream_team_tasks").insert({
    owner_name: "siteQa",
    title,
    description,
    status: "open",
    priority: "high",
    source_type: "site_qa_block",
    source_meeting_id: input.projectId,
    source_meeting_title: input.pagePath || null,
  });
}

export function formatDefectsForTask(report: SiteQaReport): string {
  const lines: string[] = [];
  lines.push(`Site QA halted publish. ${report.defects.length} defect(s) caught across ${report.gates.length} gate(s).`);
  lines.push("");
  for (const defect of report.defects) {
    const loc =
      defect.evidence.pagePath ??
      (defect.evidence.sectionType ? `section ${defect.evidence.sectionType}` : "");
    const where = [loc, defect.evidence.field].filter(Boolean).join(" / ");
    lines.push(`- [${defect.gate}] ${defect.message}`);
    if (where) lines.push(`    where: ${where}`);
    if (defect.evidence.text) {
      lines.push(`    text: ${truncate(defect.evidence.text, 160)}`);
    }
  }
  return lines.join("\n");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
