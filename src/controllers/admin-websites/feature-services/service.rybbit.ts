/**
 * Rybbit Analytics Service
 *
 * Provisions a Rybbit site and injects the tracking script
 * into the project's header code when a custom domain is verified.
 */

import { db } from "../../../database/connection";
import { createProjectSnippet } from "./service.hfcm-manager";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";

const PROJECTS_TABLE = "website_builder.projects";
const HFC_TABLE = "website_builder.header_footer_code";

const RYBBIT_API_URL = process.env.RYBBIT_API_URL || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";
const RYBBIT_ORG_ID = process.env.RYBBIT_ORG_ID || "";

const SNIPPET_NAME = "Rybbit Analytics";

/**
 * Creates a Rybbit site for the given domain and injects the tracking
 * script into the project's header_footer_code.
 *
 * This is a non-blocking side effect — it logs errors but never throws.
 */
export async function provisionRybbitSite(
  projectId: string,
  domain: string
): Promise<void> {
  try {
    if (!RYBBIT_API_URL || !RYBBIT_API_KEY || !RYBBIT_ORG_ID) {
      console.warn("[Rybbit] Skipping — missing RYBBIT_API_URL, RYBBIT_API_KEY, or RYBBIT_ORG_ID env vars");
      return;
    }

    // Check if project already has a Rybbit site
    const project = await db(PROJECTS_TABLE)
      .select("rybbit_site_id")
      .where("id", projectId)
      .first();

    if (project?.rybbit_site_id) {
      console.log(`[Rybbit] Site already provisioned (${project.rybbit_site_id}) for project ${projectId}, skipping`);
      return;
    }

    // Create site in Rybbit
    console.log(`[Rybbit] Creating site for domain: ${domain}`);

    const response = await fetch(`${RYBBIT_API_URL}/api/organizations/${RYBBIT_ORG_ID}/sites`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RYBBIT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain,
        name: domain,
        blockBots: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[Rybbit] Failed to create site (${response.status}): ${body}`);
      return;
    }

    const site = await response.json();
    const siteId = site.siteId || site.id;

    if (!siteId) {
      console.error("[Rybbit] API returned success but no siteId:", JSON.stringify(site));
      return;
    }

    console.log(`[Rybbit] Site created: siteId=${siteId} for ${domain}`);

    // Store siteId on project
    await db(PROJECTS_TABLE).where("id", projectId).update({
      rybbit_site_id: String(siteId),
      updated_at: db.fn.now(),
    });

    // Create integration row (idempotent)
    const existingIntegration = await WebsiteIntegrationModel.findByProjectAndPlatform(projectId, "rybbit");
    if (!existingIntegration) {
      await WebsiteIntegrationModel.create({
        project_id: projectId,
        platform: "rybbit",
        type: "hybrid",
        metadata: { siteId: String(siteId) },
        status: "active",
        connected_by: "system",
      });
      console.log(`[Rybbit] Integration row created for project ${projectId}`);
    }

    // Check if tracking snippet already exists
    const existingSnippet = await db(HFC_TABLE)
      .where({ project_id: projectId, name: SNIPPET_NAME })
      .first();

    if (existingSnippet) {
      console.log(`[Rybbit] Tracking snippet already exists for project ${projectId}, skipping injection`);
      return;
    }

    // Inject tracking script
    const scriptTag = `<script src="${RYBBIT_API_URL}/api/script.js" async data-site-id="${siteId}"></script>`;

    await createProjectSnippet(projectId, {
      name: SNIPPET_NAME,
      location: "head_end",
      code: scriptTag,
    });

    console.log(`[Rybbit] Tracking script injected for project ${projectId}`);
  } catch (err: any) {
    console.error(`[Rybbit] Error provisioning site for project ${projectId}:`, err?.message || err);
  }
}
