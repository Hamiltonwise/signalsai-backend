import type { IDataHarvestAdapter } from "./harvest-types";
import type { IntegrationPlatform } from "../../models/website-builder/WebsiteIntegrationModel";
import { RybbitHarvestAdapter } from "./rybbitHarvestAdapter";
import { ClarityHarvestAdapter } from "./clarityHarvestAdapter";
import { GscHarvestAdapter } from "./gscHarvestAdapter";

const HARVEST_REGISTRY: Partial<Record<IntegrationPlatform, IDataHarvestAdapter>> = {
  rybbit: new RybbitHarvestAdapter(),
  clarity: new ClarityHarvestAdapter(),
  gsc: new GscHarvestAdapter(),
};

export function getHarvestAdapter(platform: string): IDataHarvestAdapter {
  const adapter = HARVEST_REGISTRY[platform as IntegrationPlatform];
  if (!adapter) {
    throw new Error(`No harvest adapter registered for platform: ${platform}`);
  }
  return adapter;
}
