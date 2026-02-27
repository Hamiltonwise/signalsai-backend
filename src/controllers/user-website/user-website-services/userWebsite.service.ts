/**
 * User Website Service
 *
 * Business logic for user-facing website operations.
 * No req/res objects — pure data in, data out.
 *
 * Handles:
 * - Website data aggregation (GET endpoint)
 * - Page component editing with AI (POST endpoint)
 * - DFY tier enforcement
 * - Rate limiting (50 edits/day per org)
 * - Media context building for AI prompts
 */

import { v4 as uuid } from "uuid";
import { db } from "../../../database/connection";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { MediaModel } from "../../../models/website-builder/MediaModel";
import { UserEditModel } from "../../../models/website-builder/UserEditModel";

// =====================================================================
// Constants
// =====================================================================

const DAILY_EDIT_LIMIT = 50;
const USER_STORAGE_LIMIT = 1 * 1024 * 1024 * 1024; // 1 GB

// =====================================================================
// Types
// =====================================================================

export interface EditPageParams {
  orgId: number;
  userId: number;
  pageId: string;
  alloroClass: string;
  currentHtml: string;
  instruction: string;
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface EditPageResult {
  success: boolean;
  editedHtml: string | null;
  message: string;
  rejected: boolean;
  edits_remaining: number;
}

// =====================================================================
// Shared: DFY tier check
// =====================================================================

async function getOrgAndValidateTier(orgId: number) {
  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    const err: any = new Error("Organization not found");
    err.statusCode = 400;
    throw err;
  }
  if (org.subscription_tier !== "DFY") {
    const err: any = new Error(
      "Your organization does not have access to the website feature."
    );
    err.statusCode = 403;
    err.errorCode = "DFY_TIER_REQUIRED";
    throw err;
  }
  return org;
}

async function getProjectForOrg(orgId: number) {
  return ProjectModel.findByOrganizationId(orgId);
}

// =====================================================================
// GET /api/user/website — Fetch website data
// =====================================================================

export async function fetchUserWebsiteData(orgId: number) {
  await getOrgAndValidateTier(orgId);

  const project = await getProjectForOrg(orgId);

  if (!project) {
    return {
      preparing: true as const,
      status: "PREPARING",
      message:
        "We are preparing your website. You'll be notified when it's ready.",
    };
  }

  // Fetch published pages (ordered by path)
  const pages = await PageModel.findPublishedByProjectId(project.id);

  // Fetch all media
  const media = await MediaModel.findAllByProjectId(project.id);

  // Calculate storage usage
  const storageUsed = media.reduce(
    (sum: number, m: any) => sum + (m.file_size || 0),
    0
  );

  // Get edit count for today
  const editsToday = await UserEditModel.countTodayByOrg(orgId);

  return {
    preparing: false as const,
    project: {
      id: project.id,
      hostname: (project as any).generated_hostname,
      status: project.status,
      is_read_only: (project as any).is_read_only,
      custom_domain: project.custom_domain,
      domain_verified_at: (project as any).domain_verified_at,
      wrapper: (project as any).wrapper,
      header: (project as any).header,
      footer: (project as any).footer,
    },
    pages,
    media,
    usage: {
      storage_used: storageUsed,
      storage_limit: USER_STORAGE_LIMIT,
      storage_percentage: (storageUsed / USER_STORAGE_LIMIT) * 100,
      edits_today: editsToday,
      edits_limit: DAILY_EDIT_LIMIT,
    },
  };
}

// =====================================================================
// POST /api/user/website/pages/:pageId/edit — AI page edit
// =====================================================================

export async function editPageComponent(
  params: EditPageParams
): Promise<EditPageResult> {
  const {
    orgId,
    userId,
    pageId,
    alloroClass,
    currentHtml,
    instruction,
    chatHistory = [],
  } = params;

  // 1. Tier check
  await getOrgAndValidateTier(orgId);

  // 2. Project check
  const project = await getProjectForOrg(orgId);
  if (!project) {
    const err: any = new Error("Website not found");
    err.statusCode = 404;
    throw err;
  }

  // 3. Read-only check
  if ((project as any).is_read_only) {
    const err: any = new Error(
      "Your website is in read-only mode. Please upgrade to continue editing."
    );
    err.statusCode = 403;
    err.errorCode = "READ_ONLY";
    throw err;
  }

  // 4. Rate limiting: 50 edits per day per org
  const currentCount = await UserEditModel.countTodayByOrg(orgId);
  if (currentCount >= DAILY_EDIT_LIMIT) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const err: any = new Error(
      `You've reached your daily limit of ${DAILY_EDIT_LIMIT} edits. Try again tomorrow.`
    );
    err.statusCode = 429;
    err.errorCode = "RATE_LIMIT_EXCEEDED";
    err.limit = DAILY_EDIT_LIMIT;
    err.reset_at = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    throw err;
  }

  // 5. Verify page exists and belongs to project
  const page = await PageModel.findByIdAndProject(pageId, project.id);
  if (!page) {
    const err: any = new Error("Page not found");
    err.statusCode = 404;
    throw err;
  }

  // 6. Build media context for AI
  const mediaContext = await buildMediaContext(project.id);

  console.log(
    `[User/Website] Edit request for page ${pageId}, class: ${alloroClass}`
  );

  // 7. Lazy import and call AI service
  const { editHtmlComponent } = await import(
    "../../../utils/website-utils/pageEditorService"
  );

  const result = await editHtmlComponent({
    alloroClass,
    currentHtml,
    instruction,
    chatHistory,
    mediaContext,
    promptType: "user",
  });

  // 8. Log edit (using db() directly — the table has more columns than IUserEdit)
  await db("website_builder.user_edits").insert({
    id: uuid(),
    organization_id: orgId,
    user_id: userId,
    project_id: project.id,
    page_id: pageId,
    component_class: alloroClass,
    instruction,
    tokens_used: 0, // TODO: get from result if available
    success: !result.rejected,
    error_message: result.rejected ? result.message : null,
    created_at: new Date(),
  });

  console.log(
    `[User/Website] \u2713 Edit completed for class: ${alloroClass}`
  );

  return {
    success: true,
    editedHtml: result.editedHtml,
    message: result.message,
    rejected: result.rejected,
    edits_remaining: DAILY_EDIT_LIMIT - currentCount - 1,
  };
}

// =====================================================================
// Media context builder
// =====================================================================

async function buildMediaContext(projectId: string): Promise<string> {
  const mediaItems = await MediaModel.findForAIContext(projectId);

  if (mediaItems.length === 0) {
    return "";
  }

  let mediaContext = `\n\n## Available Media Library\n\nYou have access to the following uploaded media. You can reference these images/videos by their URLs in your HTML:\n\n`;

  for (const media of mediaItems) {
    const dimensions =
      media.width && media.height ? ` (${media.width}x${media.height})` : "";
    const altText = media.alt_text ? ` - ${media.alt_text}` : "";
    mediaContext += `- **${media.display_name}**${altText}${dimensions}\n  URL: ${media.s3_url}\n  Type: ${media.mime_type}\n\n`;
  }

  return mediaContext;
}
