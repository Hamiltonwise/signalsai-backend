import { google } from "googleapis";
import type { IDataHarvestAdapter, ValidateHarvestResult, HarvestResult } from "./harvest-types";
import type { IWebsiteIntegrationSafe } from "../../models/website-builder/WebsiteIntegrationModel";
import { getValidOAuth2ClientByConnection } from "../../auth/oauth2Helper";

interface GscMetadata {
  googleConnectionId?: number;
  siteUrl?: string;
}

export class GscHarvestAdapter implements IDataHarvestAdapter {
  async validateConnection(integration: IWebsiteIntegrationSafe): Promise<ValidateHarvestResult> {
    const meta = integration.metadata as GscMetadata;
    if (!meta.googleConnectionId) {
      return { ok: false, error: "missing_connection", errorMessage: "No googleConnectionId in integration metadata" };
    }
    if (!meta.siteUrl) {
      return { ok: false, error: "missing_site_url", errorMessage: "No siteUrl in integration metadata" };
    }

    try {
      const auth = await getValidOAuth2ClientByConnection(meta.googleConnectionId);
      const searchconsole = google.searchconsole({ version: "v1", auth });
      const res = await searchconsole.sites.list();
      const sites = res.data.siteEntry || [];
      const found = sites.some((s) => s.siteUrl === meta.siteUrl);

      if (!found) {
        return { ok: false, error: "site_not_found", errorMessage: `Site ${meta.siteUrl} not found in this Google account` };
      }
      return { ok: true };
    } catch (err: any) {
      if (err?.code === 401 || err?.code === 403) {
        return { ok: false, error: "auth_failed", errorMessage: "Google OAuth token is invalid or missing Search Console scope" };
      }
      return { ok: false, error: "network", errorMessage: err?.message || String(err) };
    }
  }

  async fetchData(integration: IWebsiteIntegrationSafe, date: string): Promise<HarvestResult> {
    const meta = integration.metadata as GscMetadata;
    if (!meta.googleConnectionId || !meta.siteUrl) {
      return { ok: false, data: null, rowCount: 0, error: "Missing googleConnectionId or siteUrl in metadata" };
    }

    try {
      const auth = await getValidOAuth2ClientByConnection(meta.googleConnectionId);
      const searchconsole = google.searchconsole({ version: "v1", auth });

      const res = await searchconsole.searchanalytics.query({
        siteUrl: meta.siteUrl,
        requestBody: {
          startDate: date,
          endDate: date,
          dimensions: ["query", "page"],
          rowLimit: 1000,
        },
      });

      const rows = res.data.rows || [];
      return { ok: true, data: res.data, rowCount: rows.length };
    } catch (err: any) {
      const status = err?.code || err?.response?.status;
      const body = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 4096) : undefined;
      return { ok: false, data: null, rowCount: 0, error: err?.message || String(err), errorDetails: body };
    }
  }
}
