/**
 * Deployment Pipeline Service
 *
 * Triggers the N8N webhook for website generation pipeline.
 * Resolves template data and includes it inline in the payload.
 */

import { db } from "../../../database/connection";
import { normalizeSections } from "../feature-utils/util.section-normalizer";

const TEMPLATES_TABLE = "website_builder.templates";
const TEMPLATE_PAGES_TABLE = "website_builder.template_pages";

export interface PipelineStartParams {
  projectId: string;
  templateId?: string;
  templatePageId?: string;
  path?: string;
  placeId: string;
  websiteUrl?: string;
  pageContext?: string;
  practiceSearchString?: string;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
}

// ---------------------------------------------------------------------------
// Start deployment pipeline
// ---------------------------------------------------------------------------

export async function startPipeline(
  params: PipelineStartParams
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const {
    projectId,
    templateId,
    templatePageId,
    path: pagePath,
    placeId,
    websiteUrl,
    pageContext,
    practiceSearchString,
    businessName,
    formattedAddress,
    city,
    state,
    phone,
    category,
    rating,
    reviewCount,
  } = params;

  if (!projectId || !placeId) {
    return {
      error: {
        status: 400,
        code: "INVALID_INPUT",
        message: "projectId and placeId are required",
      },
    };
  }

  console.log(
    `[Admin Websites] Starting pipeline for project ID: ${projectId}`
  );

  // Resolve template ID
  let finalTemplateId = templateId;
  if (!finalTemplateId) {
    const activeTemplate = await db(TEMPLATES_TABLE)
      .where("is_active", true)
      .first();
    if (activeTemplate) {
      finalTemplateId = activeTemplate.id;
      console.log(
        `[Admin Websites] Using active template ID: ${finalTemplateId}`
      );
    } else {
      // Fallback to first published template
      const firstTemplate = await db(TEMPLATES_TABLE)
        .where("status", "published")
        .first();
      if (firstTemplate) {
        finalTemplateId = firstTemplate.id;
        console.log(
          `[Admin Websites] Using first published template ID: ${finalTemplateId}`
        );
      }
    }
  }

  if (!finalTemplateId) {
    console.warn("[Admin Websites] No template available");
    return {
      error: {
        status: 400,
        code: "NO_TEMPLATE",
        message:
          "No template available. Please create and publish a template first.",
      },
    };
  }

  const n8nWebhookUrl = process.env.N8N_WEBHOOK_START_PIPELINE;

  if (!n8nWebhookUrl) {
    console.warn(
      "[Admin Websites] N8N_WEBHOOK_START_PIPELINE not configured"
    );
    return {
      error: {
        status: 500,
        code: "CONFIG_ERROR",
        message: "Pipeline webhook not configured",
      },
    };
  }

  const finalPath = pagePath || "/";

  // Fetch template data to include inline so N8N doesn't need to query the DB
  const template = await db(TEMPLATES_TABLE)
    .where("id", finalTemplateId)
    .first();
  const templatePage = templatePageId
    ? await db(TEMPLATE_PAGES_TABLE).where("id", templatePageId).first()
    : null;

  const templateData = {
    wrapper: template.wrapper,
    header: template.header,
    footer: template.footer,
    sections: normalizeSections(templatePage?.sections),
  };

  console.log(`[Admin Websites] Triggering webhook: ${n8nWebhookUrl}`);
  console.log(`[Admin Websites] Payload:`, {
    projectId,
    templateId: finalTemplateId,
    templatePageId,
    path: finalPath,
    placeId,
    websiteUrl,
    businessName,
  });

  // Trigger the N8N webhook
  const webhookResponse = await fetch(n8nWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      templateId: finalTemplateId,
      templatePageId,
      templateData,
      path: finalPath,
      placeId,
      websiteUrl,
      pageContext,
      practiceSearchString,
      businessName,
      formattedAddress,
      city,
      state,
      phone,
      category,
      rating,
      reviewCount,
    }),
  });

  if (!webhookResponse.ok) {
    const errorText = await webhookResponse.text();
    console.error(
      `[Admin Websites] Pipeline webhook failed: ${webhookResponse.status} ${webhookResponse.statusText}`,
      errorText
    );
    return {
      error: {
        status: 500,
        code: "WEBHOOK_ERROR",
        message: "Failed to trigger pipeline",
      },
    };
  }

  console.log(
    `[Admin Websites] \u2713 Pipeline triggered for project ID: ${projectId}`
  );

  return {};
}
