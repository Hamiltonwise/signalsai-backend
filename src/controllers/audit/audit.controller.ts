import { Request, Response } from "express";
import { validateStartAuditInput, validateAuditIdParam, validateUpdateFields } from "./audit-utils/validationUtils";
import { triggerAuditWorkflow } from "./audit-services/auditWorkflowService";
import { getAuditByIdWithStatus, getAuditById } from "./audit-services/auditRetrievalService";
import { updateAuditFields } from "./audit-services/auditUpdateService";

export async function startAudit(req: Request, res: Response) {
  try {
    const { domain, practice_search_string } = validateStartAuditInput(req.body);

    console.log(`[Audit] Starting audit for domain: ${domain}`);

    const auditId = await triggerAuditWorkflow(domain, practice_search_string);

    console.log(`[Audit] Received audit_id from n8n: ${auditId}`);

    return res.json({
      success: true,
      audit_id: auditId,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Audit] Start error:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

export async function getAuditStatus(req: Request, res: Response) {
  try {
    const auditId = validateAuditIdParam(req.params.auditId);

    const response = await getAuditByIdWithStatus(auditId);

    return res.json(response);
  } catch (error: any) {
    console.error("[Audit] Status error:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

export async function getAuditDetails(req: Request, res: Response) {
  try {
    const auditId = validateAuditIdParam(req.params.auditId);

    const response = await getAuditById(auditId);

    return res.json(response);
  } catch (error: any) {
    console.error("[Audit] Get error:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

export async function updateAudit(req: Request, res: Response) {
  try {
    const auditId = validateAuditIdParam(req.params.auditId);
    const filteredData = validateUpdateFields(req.body);

    const updatedFields = await updateAuditFields(auditId, filteredData);

    return res.json({
      success: true,
      updated_fields: updatedFields,
    });
  } catch (error: any) {
    console.error("[Audit] Update error:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}
