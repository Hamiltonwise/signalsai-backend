/**
 * Partnerships Agent -- Execution Service
 *
 * The Partnerships Playbook has no owner. This agent fills that gap.
 * Runs monthly (1st Monday 11 AM PT).
 *
 * Tracks partnership pipeline: DentalEMR agreement status,
 * potential PMS integrations, association partnerships.
 * Monitors for partnership opportunities via webFetch.
 * Creates dream_team_tasks for partnership follow-ups.
 *
 * Writes "growth.partnership_opportunity" event.
 */

import { db } from "../../database/connection";
import { fetchPage } from "../webFetch";

// -- Types ------------------------------------------------------------------

interface PartnershipOpportunity {
  partnerName: string;
  type:
    | "pms_integration"
    | "association"
    | "technology"
    | "referral"
    | "distribution";
  headline: string;
  details: string;
  source: string;
  priority: "low" | "medium" | "high";
}

interface PartnershipPipelineItem {
  partnerName: string;
  status: "prospecting" | "contacted" | "negotiating" | "agreed" | "active" | "stalled";
  type: string;
  lastActivity?: string;
  nextAction?: string;
}

interface PartnershipSummary {
  scannedAt: string;
  pipelineItems: number;
  newOpportunities: number;
  opportunities: PartnershipOpportunity[];
  pipeline: PartnershipPipelineItem[];
  tasksCreated: number;
}

// -- Constants --------------------------------------------------------------

/**
 * Known partnership targets and monitoring URLs.
 */
const PARTNERSHIP_TARGETS: Array<{
  name: string;
  type: PartnershipOpportunity["type"];
  urls: string[];
}> = [
  {
    name: "Dentrix (Henry Schein)",
    type: "pms_integration",
    urls: [
      "https://www.dentrix.com/products/eservices/developer-program",
      "https://www.dentrix.com/partners",
    ],
  },
  {
    name: "Eaglesoft (Patterson)",
    type: "pms_integration",
    urls: ["https://www.eaglesoft.net/partners"],
  },
  {
    name: "Open Dental",
    type: "pms_integration",
    urls: [
      "https://www.opendental.com/site/thirdparty.html",
      "https://www.opendental.com/site/apikeys.html",
    ],
  },
  {
    name: "AAE (American Association of Endodontists)",
    type: "association",
    urls: ["https://www.aae.org/specialty/member-center/"],
  },
  {
    name: "ADA (American Dental Association)",
    type: "association",
    urls: ["https://www.ada.org/resources/practice"],
  },
  {
    name: "AADOM",
    type: "association",
    urls: ["https://www.dentalmanagers.com/partners/"],
  },
];

// -- Core -------------------------------------------------------------------

/**
 * Run the monthly partnerships scan.
 * Checks pipeline status, monitors partnership URLs, and creates tasks.
 */
export async function runPartnershipsAgent(): Promise<PartnershipSummary> {
  // 1. Load existing pipeline from dream_team_tasks
  const pipeline = await loadPipeline();

  // 2. Scan partnership target URLs for opportunities
  const opportunities = await scanPartnershipTargets();

  // 3. Create tasks for new opportunities not already in pipeline
  let tasksCreated = 0;
  for (const opp of opportunities) {
    const alreadyTracked = pipeline.some(
      (p) => p.partnerName.toLowerCase() === opp.partnerName.toLowerCase()
    );
    const alreadyDetected = await checkExistingOpportunityTask(opp.partnerName);

    if (!alreadyTracked && !alreadyDetected) {
      await createPartnershipTask(opp);
      await writePartnershipEvent(opp);
      tasksCreated++;
    }
  }

  // 4. Check for stalled pipeline items (no activity in 30 days)
  for (const item of pipeline) {
    if (item.status !== "active" && item.status !== "agreed") {
      const stalledDays = item.lastActivity
        ? Math.floor(
            (Date.now() - new Date(item.lastActivity).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 999;

      if (stalledDays >= 30) {
        await createFollowUpTask(item);
        tasksCreated++;
      }
    }
  }

  const summary: PartnershipSummary = {
    scannedAt: new Date().toISOString(),
    pipelineItems: pipeline.length,
    newOpportunities: opportunities.length,
    opportunities,
    pipeline,
    tasksCreated,
  };

  console.log(
    `[PartnershipsAgent] Scan complete: ${pipeline.length} pipeline items, ${opportunities.length} opportunities, ${tasksCreated} tasks created`
  );

  return summary;
}

// -- Pipeline ---------------------------------------------------------------

async function loadPipeline(): Promise<PartnershipPipelineItem[]> {
  try {
    const tasks = await db("dream_team_tasks")
      .where("source_agent", "partnerships")
      .orderBy("updated_at", "desc");

    return tasks.map((t: any) => {
      const props = typeof t.description === "string"
        ? extractPipelineStatus(t.description)
        : { status: "prospecting" as const, type: "technology" };

      return {
        partnerName: t.title.replace(/^Partnership:\s*/, ""),
        status: props.status,
        type: props.type,
        lastActivity: t.updated_at,
        nextAction: t.status === "done" ? undefined : "Follow up",
      };
    });
  } catch (err: any) {
    console.error(
      `[PartnershipsAgent] Failed to load pipeline:`,
      err.message
    );
    return [];
  }
}

function extractPipelineStatus(description: string): {
  status: PartnershipPipelineItem["status"];
  type: string;
} {
  const statusMatch = description.match(
    /Status:\s*(prospecting|contacted|negotiating|agreed|active|stalled)/i
  );
  const typeMatch = description.match(
    /Type:\s*(pms_integration|association|technology|referral|distribution)/i
  );
  return {
    status: (statusMatch?.[1]?.toLowerCase() as PartnershipPipelineItem["status"]) || "prospecting",
    type: typeMatch?.[1] || "technology",
  };
}

// -- Scanning ---------------------------------------------------------------

async function scanPartnershipTargets(): Promise<PartnershipOpportunity[]> {
  const opportunities: PartnershipOpportunity[] = [];

  for (const target of PARTNERSHIP_TARGETS) {
    for (const url of target.urls) {
      try {
        const result = await fetchPage(url);
        if (!result.success || !result.html) continue;

        const text = extractTextContent(result.html).toLowerCase();

        // Check for partnership program indicators
        const hasPartnerProgram =
          /(?:partner program|developer program|api access|integration|marketplace|third.?party|app store)/i.test(
            text
          );
        const hasOpenApplication =
          /(?:apply|sign up|register|get started|join|submit|contact us)/i.test(
            text
          );
        const hasNewAnnouncement =
          /(?:new partner|announcing|launch|now accepting|open for)/i.test(
            text
          );

        if (hasPartnerProgram && (hasOpenApplication || hasNewAnnouncement)) {
          opportunities.push({
            partnerName: target.name,
            type: target.type,
            headline: `${target.name} has an active partnership/integration program`,
            details: `Found partnership program indicators at ${url}. ${hasNewAnnouncement ? "New announcements detected." : "Application process appears open."}`,
            source: url,
            priority:
              target.type === "pms_integration" ? "high" : "medium",
          });
        }
      } catch (err: any) {
        console.error(
          `[PartnershipsAgent] Failed to scan ${url}:`,
          err.message
        );
      }
    }
  }

  return opportunities;
}

// -- Task Creation ----------------------------------------------------------

async function checkExistingOpportunityTask(
  partnerName: string
): Promise<boolean> {
  const existing = await db("dream_team_tasks")
    .where("source_agent", "partnerships")
    .andWhere("status", "!=", "done")
    .andWhere("title", "like", `%${partnerName}%`)
    .first();
  return !!existing;
}

async function createPartnershipTask(
  opp: PartnershipOpportunity
): Promise<void> {
  try {
    await db("dream_team_tasks").insert({
      title: `Partnership: ${opp.partnerName}`,
      description: [
        opp.headline,
        "",
        `Type: ${opp.type}`,
        `Status: prospecting`,
        `Priority: ${opp.priority}`,
        `Source: ${opp.source}`,
        "",
        opp.details,
      ].join("\n"),
      source_agent: "partnerships",
      priority: opp.priority === "high" ? 1 : opp.priority === "medium" ? 2 : 3,
      status: "open",
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: any) {
    console.error(
      `[PartnershipsAgent] Failed to create task for ${opp.partnerName}:`,
      err.message
    );
  }
}

async function createFollowUpTask(
  item: PartnershipPipelineItem
): Promise<void> {
  const alreadyExists = await db("dream_team_tasks")
    .where("source_agent", "partnerships")
    .andWhere("status", "!=", "done")
    .andWhere("title", "like", `%Follow up%${item.partnerName}%`)
    .first();

  if (alreadyExists) return;

  try {
    await db("dream_team_tasks").insert({
      title: `Follow up: ${item.partnerName} partnership (stalled)`,
      description: [
        `Partnership with ${item.partnerName} has stalled.`,
        "",
        `Type: ${item.type}`,
        `Last status: ${item.status}`,
        `Last activity: ${item.lastActivity || "Unknown"}`,
        "",
        "Action: Review this partnership and decide whether to pursue, pause, or close.",
      ].join("\n"),
      source_agent: "partnerships",
      priority: 3,
      status: "open",
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: any) {
    console.error(
      `[PartnershipsAgent] Failed to create follow-up task for ${item.partnerName}:`,
      err.message
    );
  }
}

// -- Utilities --------------------------------------------------------------

function extractTextContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// -- Writers ----------------------------------------------------------------

async function writePartnershipEvent(
  opp: PartnershipOpportunity
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "growth.partnership_opportunity",
      properties: JSON.stringify({
        partner_name: opp.partnerName,
        type: opp.type,
        headline: opp.headline,
        priority: opp.priority,
        source: opp.source,
        detected_at: new Date().toISOString(),
      }),
    });
  } catch (err: any) {
    console.error(
      `[PartnershipsAgent] Failed to write partnership event:`,
      err.message
    );
  }
}
