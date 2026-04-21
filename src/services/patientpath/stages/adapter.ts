/**
 * Manifest v2 Card 2 — Adapter stage (Path B, locked April 21 2026).
 *
 * Directly writes the Copy stage output to website_builder.pages.sections[].
 * Bypasses N8N entirely. N8N is being retired.
 *
 * Schema match: service.project-manager.ts#createAllFromTemplate and
 * service.ai-command.ts insert paths. Page rows carry path, version, status,
 * generation_status, and sections (JSONB).
 */

import { db } from "../../../database/connection";
import { BehavioralEventModel } from "../../../models/BehavioralEventModel";

const PROJECTS_TABLE = "website_builder.projects";
const PAGES_TABLE = "website_builder.pages";

export interface AdapterStageInput {
  orgId: number;
  copyId: string;
  copy: any;
  idempotencyKey: string;
}

export interface AdapterStageResult {
  projectId: string;
  pageIds: string[];
  siteUrl: string;
  pageCount: number;
  reused: boolean;
  durationMs: number;
}

interface CopySection {
  name: string;
  headline: string;
  body: string;
  imagePrompt?: string;
}

function slugForSection(name: string): string {
  if (!name) return "/";
  const lower = name.toLowerCase();
  if (lower === "hero" || lower === "home") return "/";
  return `/${lower.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function hostnameFor(orgId: number, key: string): string {
  const tail = key.replace(/[^a-z0-9]+/gi, "-").slice(-12) || "site";
  return `alloro-org-${orgId}-${tail}`.toLowerCase();
}

export async function runAdapterStage(
  input: AdapterStageInput
): Promise<AdapterStageResult> {
  const start = Date.now();

  const sections: CopySection[] = Array.isArray(input.copy?.sections)
    ? input.copy.sections
    : [];

  if (sections.length === 0) {
    throw new Error(`Adapter: no copy sections for org ${input.orgId}`);
  }

  let project = await db(PROJECTS_TABLE)
    .where({ organization_id: input.orgId })
    .first();

  let reused = true;
  if (!project) {
    reused = false;
    const hostname = hostnameFor(input.orgId, input.idempotencyKey);
    const [row] = await db(PROJECTS_TABLE)
      .insert({
        user_id: "orchestrator",
        generated_hostname: hostname,
        display_name: hostname,
        organization_id: input.orgId,
        status: "IN_PROGRESS",
      })
      .returning("*");
    project = row;
  }

  const projectId: string = project.id;

  const existingPages = await db(PAGES_TABLE)
    .where({ project_id: projectId });

  const existingByPath = new Map<string, any>();
  for (const p of existingPages) {
    existingByPath.set(p.path, p);
  }

  const pageIds: string[] = [];

  for (const section of sections) {
    const path = slugForSection(section.name);
    const sectionsJson = [
      {
        type: section.name,
        data: {
          headline: section.headline,
          body: section.body,
          imagePrompt: section.imagePrompt ?? "",
        },
      },
    ];

    const existing = existingByPath.get(path);
    if (existing) {
      await db(PAGES_TABLE)
        .where({ id: existing.id })
        .update({
          sections: JSON.stringify(sectionsJson),
          status: "draft",
          generation_status: "ready",
          updated_at: db.fn.now(),
        });
      pageIds.push(existing.id);
    } else {
      const [row] = await db(PAGES_TABLE)
        .insert({
          project_id: projectId,
          path,
          version: 1,
          status: "draft",
          generation_status: "ready",
          sections: JSON.stringify(sectionsJson),
        })
        .returning("id");
      pageIds.push(typeof row === "string" ? row : row.id);
    }
  }

  await db(PROJECTS_TABLE)
    .where({ id: projectId })
    .update({ status: "LIVE", updated_at: db.fn.now() });

  const siteUrl = `https://${project.generated_hostname}.alloro.site`;

  await BehavioralEventModel.create({
    event_type: "site.published",
    org_id: input.orgId,
    properties: {
      org_id: input.orgId,
      site_url: siteUrl,
      page_count: pageIds.length,
      project_id: projectId,
      copy_id: input.copyId,
      timestamp: new Date().toISOString(),
    },
  }).catch(() => {});

  return {
    projectId,
    pageIds,
    siteUrl,
    pageCount: pageIds.length,
    reused,
    durationMs: Date.now() - start,
  };
}
