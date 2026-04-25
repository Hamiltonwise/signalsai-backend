import { AuditProcessModel, IAuditProcess } from "../../../models/AuditProcessModel";
import {
  normalizeWebsiteAnalysis,
  normalizeSelfGBP,
  normalizeCompetitors,
  normalizeGBPAnalysis,
} from "../audit-utils/normalizationUtils";

export async function getAuditByIdWithStatus(auditId: string) {
  const audit = await AuditProcessModel.findById(auditId);

  if (!audit) {
    const error: any = new Error("Audit not found");
    error.statusCode = 404;
    throw error;
  }

  // Process and normalize data
  // Set success to false if error_message exists (n8n agent failed)
  return {
    success: !audit.error_message,
    id: audit.id,
    status: audit.status,
    realtime_status: audit.realtime_status,
    error_message: audit.error_message,
    created_at: audit.created_at,
    updated_at: audit.updated_at,

    // Step data (null if not yet available)
    screenshots: audit.step_screenshots,
    website_analysis: normalizeWebsiteAnalysis(audit.step_website_analysis),
    self_gbp: normalizeSelfGBP(audit.step_self_gbp),
    competitors: normalizeCompetitors(
      audit.step_competitors,
      audit.step_self_gbp
    ),
    gbp_analysis: normalizeGBPAnalysis(audit.step_gbp_analysis),

    // True when the homepage scrape was bot-blocked (Cloudflare etc.) and
    // both default + stealth methods exhausted. Frontend uses this to render
    // the "Your website blocks Alloro scanners" placeholder instead of the
    // generic "NO WEBSITE" placeholder. Defaults to false on legacy rows
    // via the column default, so always boolean (never undefined) in the
    // response.
    website_blocked: audit.website_blocked ?? false,
  };
}

export async function getAuditById(auditId: string) {
  const audit = await AuditProcessModel.findById(auditId);

  if (!audit) {
    const error: any = new Error("Audit not found");
    error.statusCode = 404;
    throw error;
  }

  // Set success to false if error_message exists (n8n agent failed)
  return {
    success: !audit.error_message,
    audit: {
      id: audit.id,
      domain: audit.domain,
      practice_search_string: audit.practice_search_string,
      status: audit.status,
      realtime_status: audit.realtime_status,
      error_message: audit.error_message,
      created_at: audit.created_at,
      updated_at: audit.updated_at,
      step_screenshots: audit.step_screenshots,
      step_website_analysis: audit.step_website_analysis,
      step_self_gbp: audit.step_self_gbp,
      step_competitors: audit.step_competitors,
      step_gbp_analysis: audit.step_gbp_analysis,
    },
  };
}
