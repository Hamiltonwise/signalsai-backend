import type { IWebsiteIntegrationSafe } from "../../models/website-builder/WebsiteIntegrationModel";

export interface ValidateHarvestResult {
  ok: boolean;
  error?: string;
  errorMessage?: string;
}

export interface HarvestResult {
  ok: boolean;
  data: unknown;
  rowCount: number;
  error?: string;
  errorDetails?: string;
}

export interface IDataHarvestAdapter {
  validateConnection(integration: IWebsiteIntegrationSafe): Promise<ValidateHarvestResult>;
  fetchData(integration: IWebsiteIntegrationSafe, date: string): Promise<HarvestResult>;
}
