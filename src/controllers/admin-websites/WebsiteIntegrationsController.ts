/**
 * Website Integrations Controller
 *
 * CRUD + HubSpot operations for per-website CRM integrations.
 *
 * Endpoints (mounted under /api/admin/websites/:id):
 *   GET    /integrations                                      list
 *   POST   /integrations                                      create (validates token)
 *   GET    /detected-forms                                    list website forms from submissions
 *   GET    /detected-forms/:formName/field-shape              field shape sample
 *   GET    /integrations/:integrationId                       detail (SAFE)
 *   PUT    /integrations/:integrationId                       update
 *   DELETE /integrations/:integrationId                       hard delete
 *   POST   /integrations/:integrationId/revoke                soft revoke
 *   GET    /integrations/:integrationId/vendor-forms          live forms list (no cache)
 *   POST   /integrations/:integrationId/validate-mappings     cross-reference + update broken status
 *   POST   /integrations/:integrationId/infer-mapping         auto-default field map suggestion
 *   GET    /integrations/:integrationId/sync-logs             paginated push history
 *   GET    /integrations/:integrationId/mappings              list
 *   POST   /integrations/:integrationId/mappings              create
 *   PUT    /integrations/:integrationId/mappings/:mappingId   update
 *   DELETE /integrations/:integrationId/mappings/:mappingId   delete
 */

import { Request, Response } from "express";
import {
  WebsiteIntegrationModel,
  type IntegrationStatus,
} from "../../models/website-builder/WebsiteIntegrationModel";
import { IntegrationFormMappingModel } from "../../models/website-builder/IntegrationFormMappingModel";
import { CrmSyncLogModel } from "../../models/website-builder/CrmSyncLogModel";
import { getAdapter } from "../../services/integrations";
import { inferFieldMapping } from "../../services/integrations/fieldInference";
import * as formDetection from "./feature-services/service.form-detection";

const LOG_PREFIX = "[Website Integrations]";

function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
): Response {
  return res.status(status).json({ success: false, error: code, message });
}

/**
 * Verify that the integration belongs to the website project in the URL.
 * Returns the integration row on success, or sends a 404 and returns null.
 */
async function loadIntegrationForProject(
  req: Request,
  res: Response,
): Promise<Awaited<ReturnType<typeof WebsiteIntegrationModel.findById>> | null> {
  const projectId = String(req.params.id);
  const integrationId = String(req.params.integrationId);
  const integration = await WebsiteIntegrationModel.findById(integrationId);
  if (!integration || integration.project_id !== projectId) {
    fail(res, 404, "NOT_FOUND", "Integration not found for this website");
    return null;
  }
  return integration;
}

async function loadMappingForIntegration(
  req: Request,
  res: Response,
  integrationId: string,
) {
  const mappingId = String(req.params.mappingId);
  const mapping = await IntegrationFormMappingModel.findById(mappingId);
  if (!mapping || mapping.integration_id !== integrationId) {
    fail(res, 404, "NOT_FOUND", "Mapping not found for this integration");
    return null;
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Detected forms (read-only from form_submissions)
// ---------------------------------------------------------------------------

export async function listDetectedForms(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const data = await formDetection.listDetectedForms(projectId);
    return ok(res, data);
  } catch (error) {
    console.error(`${LOG_PREFIX} listDetectedForms failed:`, error);
    return fail(res, 500, "FETCH_ERROR", "Failed to list detected forms");
  }
}

export async function getDetectedFormFieldShape(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const formName = String(req.params.formName);
    const sampleSize = Math.min(
      parseInt(String(req.query.sampleSize ?? "20"), 10) || 20,
      100,
    );
    const data = await formDetection.getFormFieldShape(projectId, formName, sampleSize);
    return ok(res, data);
  } catch (error) {
    console.error(`${LOG_PREFIX} getDetectedFormFieldShape failed:`, error);
    return fail(res, 500, "FETCH_ERROR", "Failed to fetch form field shape");
  }
}

// ---------------------------------------------------------------------------
// Integrations CRUD
// ---------------------------------------------------------------------------

export async function listIntegrations(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const data = await WebsiteIntegrationModel.findByProjectId(projectId);
    return ok(res, data);
  } catch (error) {
    console.error(`${LOG_PREFIX} listIntegrations failed:`, error);
    return fail(res, 500, "FETCH_ERROR", "Failed to list integrations");
  }
}

export async function getIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    return ok(res, integration);
  } catch (error) {
    console.error(`${LOG_PREFIX} getIntegration failed:`, error);
    return fail(res, 500, "FETCH_ERROR", "Failed to fetch integration");
  }
}

export async function createIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const { platform, label, credentials } = req.body as {
      platform?: string;
      label?: string | null;
      credentials?: string;
    };

    if (!platform || typeof platform !== "string") {
      return fail(res, 400, "INVALID_INPUT", "platform is required");
    }
    if (!credentials || typeof credentials !== "string" || credentials.length < 8) {
      return fail(res, 400, "INVALID_INPUT", "credentials are required");
    }

    let adapter;
    try {
      adapter = getAdapter(platform);
    } catch {
      return fail(res, 400, "UNSUPPORTED_PLATFORM", `Platform '${platform}' is not supported`);
    }

    const validation = await adapter.validateConnection(credentials);
    if (!validation.ok) {
      return fail(
        res,
        400,
        "INVALID_CREDENTIALS",
        validation.errorMessage || "Vendor rejected credentials",
      );
    }

    const existing = await WebsiteIntegrationModel.findByProjectAndPlatform(projectId, platform);
    if (existing) {
      return fail(
        res,
        409,
        "ALREADY_CONNECTED",
        `An ${platform} integration already exists for this project`,
      );
    }

    const integration = await WebsiteIntegrationModel.create({
      project_id: projectId,
      platform,
      credentials,
      label: label ?? null,
      metadata: {
        portalId: validation.portalId,
        accountName: validation.accountName,
      },
      status: "active",
    });

    await WebsiteIntegrationModel.updateLastValidated(integration.id, new Date());

    return ok(res, integration, 201);
  } catch (error) {
    console.error(`${LOG_PREFIX} createIntegration failed:`, error);
    return fail(res, 500, "CREATE_ERROR", "Failed to create integration");
  }
}

export async function updateIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const { label, credentials } = req.body as {
      label?: string | null;
      credentials?: string;
    };

    const update: {
      label?: string | null;
      credentials?: string;
      metadata?: Record<string, unknown>;
      status?: IntegrationStatus;
      last_validated_at?: Date;
      last_error?: string | null;
    } = {};
    if (label !== undefined) update.label = label;

    if (credentials !== undefined) {
      if (typeof credentials !== "string" || credentials.length < 8) {
        return fail(res, 400, "INVALID_INPUT", "credentials must be a non-empty string");
      }
      const adapter = getAdapter(integration.platform);
      const validation = await adapter.validateConnection(credentials);
      if (!validation.ok) {
        return fail(
          res,
          400,
          "INVALID_CREDENTIALS",
          validation.errorMessage || "Vendor rejected credentials",
        );
      }
      update.credentials = credentials;
      update.metadata = {
        ...(integration.metadata ?? {}),
        portalId: validation.portalId,
        accountName: validation.accountName,
      };
      update.status = "active";
      update.last_validated_at = new Date();
      update.last_error = null;
    }

    const updated = await WebsiteIntegrationModel.update(integration.id, update);
    return ok(res, updated);
  } catch (error) {
    console.error(`${LOG_PREFIX} updateIntegration failed:`, error);
    return fail(res, 500, "UPDATE_ERROR", "Failed to update integration");
  }
}

export async function deleteIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    await WebsiteIntegrationModel.deleteById(integration.id);
    return ok(res, { deleted: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} deleteIntegration failed:`, error);
    return fail(res, 500, "DELETE_ERROR", "Failed to delete integration");
  }
}

export async function revokeIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    await WebsiteIntegrationModel.updateStatus(integration.id, "revoked");
    const updated = await WebsiteIntegrationModel.findById(integration.id);
    return ok(res, updated);
  } catch (error) {
    console.error(`${LOG_PREFIX} revokeIntegration failed:`, error);
    return fail(res, 500, "REVOKE_ERROR", "Failed to revoke integration");
  }
}

// ---------------------------------------------------------------------------
// Vendor forms (live, no cache)
// ---------------------------------------------------------------------------

export async function listVendorForms(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    if (integration.status !== "active") {
      return fail(res, 409, "INACTIVE", `Integration is ${integration.status}`);
    }

    const creds = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
    if (!creds) {
      return fail(res, 500, "MISSING_CREDENTIALS", "Could not decrypt credentials");
    }

    const adapter = getAdapter(integration.platform);
    const forms = await adapter.listForms(creds);
    return ok(res, forms);
  } catch (error) {
    console.error(`${LOG_PREFIX} listVendorForms failed:`, error);
    return fail(res, 502, "VENDOR_ERROR", "Failed to list vendor forms");
  }
}

export async function validateMappings(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const creds = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
    if (!creds) {
      return fail(res, 500, "MISSING_CREDENTIALS", "Could not decrypt credentials");
    }

    const adapter = getAdapter(integration.platform);

    const validation = await adapter.validateConnection(creds);
    if (!validation.ok) {
      await WebsiteIntegrationModel.updateStatus(
        integration.id,
        "revoked",
        validation.errorMessage ?? validation.error ?? "Token validation failed",
      );
      return fail(res, 401, "TOKEN_REJECTED", "Token rejected during validation");
    }

    const forms = await adapter.listForms(creds);
    const validVendorIds = forms.map((f) => f.id);

    await IntegrationFormMappingModel.bulkMarkBrokenForMissingVendorForms(
      integration.id,
      validVendorIds,
    );
    await IntegrationFormMappingModel.bulkMarkValidated(integration.id, validVendorIds);
    await WebsiteIntegrationModel.updateLastValidated(integration.id, new Date());

    const mappings = await IntegrationFormMappingModel.findByIntegrationId(integration.id);
    return ok(res, mappings);
  } catch (error) {
    console.error(`${LOG_PREFIX} validateMappings failed:`, error);
    return fail(res, 500, "VALIDATE_ERROR", "Failed to validate mappings");
  }
}

export async function inferMapping(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const projectId = String(req.params.id);
    const { website_form_name, vendor_form_id } = req.body as {
      website_form_name?: string;
      vendor_form_id?: string;
    };
    if (!website_form_name || !vendor_form_id) {
      return fail(
        res,
        400,
        "INVALID_INPUT",
        "website_form_name and vendor_form_id are required",
      );
    }

    const creds = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
    if (!creds) {
      return fail(res, 500, "MISSING_CREDENTIALS", "Could not decrypt credentials");
    }

    const adapter = getAdapter(integration.platform);
    const form = await adapter.getFormSchema(creds, vendor_form_id);
    if (!form) {
      return fail(res, 404, "VENDOR_FORM_NOT_FOUND", "Vendor form not found");
    }

    const fieldShape = await formDetection.getFormFieldShape(projectId, website_form_name);
    const websiteFieldKeys = fieldShape.map((f) => f.key);

    const inferred = inferFieldMapping(websiteFieldKeys, form.fields);
    return ok(res, {
      vendor_form: form,
      website_fields: fieldShape,
      inferred_mapping: inferred,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} inferMapping failed:`, error);
    return fail(res, 500, "INFER_ERROR", "Failed to infer field mapping");
  }
}

// ---------------------------------------------------------------------------
// Sync logs (paginated)
// ---------------------------------------------------------------------------

export async function listSyncLogs(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    const result = await CrmSyncLogModel.findByIntegrationId(integration.id, { limit, offset });
    return res.json({
      success: true,
      data: result.data,
      pagination: { limit, offset, total: result.total },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} listSyncLogs failed:`, error);
    return fail(res, 500, "FETCH_ERROR", "Failed to list sync logs");
  }
}

// ---------------------------------------------------------------------------
// Mappings CRUD
// ---------------------------------------------------------------------------

export async function listMappings(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    const data = await IntegrationFormMappingModel.findByIntegrationId(integration.id);
    return ok(res, data);
  } catch (error) {
    console.error(`${LOG_PREFIX} listMappings failed:`, error);
    return fail(res, 500, "FETCH_ERROR", "Failed to list mappings");
  }
}

export async function createMapping(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const {
      website_form_name,
      vendor_form_id,
      vendor_form_name,
      field_mapping,
    } = req.body as {
      website_form_name?: string;
      vendor_form_id?: string;
      vendor_form_name?: string | null;
      field_mapping?: Record<string, string>;
    };

    if (!website_form_name || !vendor_form_id) {
      return fail(
        res,
        400,
        "INVALID_INPUT",
        "website_form_name and vendor_form_id are required",
      );
    }

    const existing = await IntegrationFormMappingModel.findByIntegrationAndWebsiteForm(
      integration.id,
      website_form_name,
    );
    if (existing) {
      return fail(
        res,
        409,
        "ALREADY_MAPPED",
        "A mapping already exists for this website form",
      );
    }

    const mapping = await IntegrationFormMappingModel.create({
      integration_id: integration.id,
      website_form_name,
      vendor_form_id,
      vendor_form_name: vendor_form_name ?? null,
      field_mapping: field_mapping ?? {},
      status: "active",
    });

    return ok(res, mapping, 201);
  } catch (error) {
    console.error(`${LOG_PREFIX} createMapping failed:`, error);
    return fail(res, 500, "CREATE_ERROR", "Failed to create mapping");
  }
}

export async function updateMapping(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    const mapping = await loadMappingForIntegration(req, res, integration.id);
    if (!mapping) return res;

    const { vendor_form_id, vendor_form_name, field_mapping, status } = req.body as {
      vendor_form_id?: string;
      vendor_form_name?: string | null;
      field_mapping?: Record<string, string>;
      status?: "active" | "broken";
    };

    const updated = await IntegrationFormMappingModel.update(mapping.id, {
      vendor_form_id,
      vendor_form_name,
      field_mapping,
      status,
    });
    return ok(res, updated);
  } catch (error) {
    console.error(`${LOG_PREFIX} updateMapping failed:`, error);
    return fail(res, 500, "UPDATE_ERROR", "Failed to update mapping");
  }
}

export async function deleteMapping(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    const mapping = await loadMappingForIntegration(req, res, integration.id);
    if (!mapping) return res;
    await IntegrationFormMappingModel.deleteById(mapping.id);
    return ok(res, { deleted: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} deleteMapping failed:`, error);
    return fail(res, 500, "DELETE_ERROR", "Failed to delete mapping");
  }
}
