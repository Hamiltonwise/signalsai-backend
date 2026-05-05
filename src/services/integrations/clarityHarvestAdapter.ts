import axios from "axios";
import type { IDataHarvestAdapter, ValidateHarvestResult, HarvestResult } from "./harvest-types";
import type { IWebsiteIntegrationSafe } from "../../models/website-builder/WebsiteIntegrationModel";
import { WebsiteIntegrationModel } from "../../models/website-builder/WebsiteIntegrationModel";

const CLARITY_API_BASE_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

export class ClarityHarvestAdapter implements IDataHarvestAdapter {
  async validateConnection(integration: IWebsiteIntegrationSafe): Promise<ValidateHarvestResult> {
    const projectId = (integration.metadata as { projectId?: string }).projectId;
    if (!projectId) {
      return { ok: false, error: "missing_project_id", errorMessage: "No projectId in integration metadata" };
    }

    const token = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
    if (!token) {
      return { ok: false, error: "missing_credentials", errorMessage: "No credentials found for this integration" };
    }

    try {
      const resp = await axios.get(CLARITY_API_BASE_URL, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        params: { projectId, numOfDays: "1" },
      });
      if (resp.status === 200) return { ok: true };
      return { ok: false, error: "unknown", errorMessage: `Clarity returned ${resp.status}` };
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) return { ok: false, error: "invalid_token", errorMessage: "Clarity API token is invalid or expired" };
      if (status === 429) return { ok: false, error: "rate_limited", errorMessage: "Clarity daily API limit exceeded (10/day)" };
      return { ok: false, error: "network", errorMessage: err?.message || String(err) };
    }
  }

  async fetchData(integration: IWebsiteIntegrationSafe, _date: string): Promise<HarvestResult> {
    const projectId = (integration.metadata as { projectId?: string }).projectId;
    if (!projectId) {
      return { ok: false, data: null, rowCount: 0, error: "No projectId in metadata" };
    }

    const token = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
    if (!token) {
      return { ok: false, data: null, rowCount: 0, error: "Failed to decrypt credentials" };
    }

    try {
      const resp = await axios.get(CLARITY_API_BASE_URL, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        params: { projectId, numOfDays: "1" },
      });

      return { ok: true, data: resp.data, rowCount: Array.isArray(resp.data) ? resp.data.length : 1 };
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 4096) : undefined;
      if (status === 429) {
        return { ok: false, data: null, rowCount: 0, error: "Clarity daily API limit exceeded", errorDetails: body };
      }
      return { ok: false, data: null, rowCount: 0, error: err?.message || String(err), errorDetails: body };
    }
  }
}
