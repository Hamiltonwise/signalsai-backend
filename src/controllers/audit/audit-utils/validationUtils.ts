export interface StartAuditInput {
  domain: string;
  practice_search_string: string;
}

export function validateStartAuditInput(body: any): StartAuditInput {
  const { domain, practice_search_string } = body;

  if (!domain || !practice_search_string) {
    const error: any = new Error(
      "Missing required fields: domain, practice_search_string"
    );
    error.statusCode = 400;
    throw error;
  }

  return { domain, practice_search_string };
}

export function validateAuditIdParam(auditId: string | undefined): string {
  if (!auditId) {
    const error: any = new Error("Missing auditId");
    error.statusCode = 400;
    throw error;
  }

  return auditId;
}

const ALLOWED_UPDATE_FIELDS = [
  "status",
  "realtime_status",
  "error_message",
  "step_screenshots",
  "step_website_analysis",
  "step_self_gbp",
  "step_competitors",
  "step_gbp_analysis",
];

export function validateUpdateFields(
  updateData: Record<string, any>
): Record<string, any> {
  const filteredData: Record<string, any> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (field in updateData) {
      filteredData[field] = updateData[field];
    }
  }

  if (Object.keys(filteredData).length === 0) {
    const error: any = new Error("No valid fields to update");
    error.statusCode = 400;
    throw error;
  }

  return filteredData;
}
