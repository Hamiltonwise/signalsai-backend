export interface PropertyIds {
  ga4: any;
  gsc: any;
  gbp: any[];
}

const DEFAULT_PROPERTIES: PropertyIds = { ga4: null, gsc: null, gbp: [] };

export function parsePropertyIds(
  raw: string | Record<string, unknown> | null | undefined
): PropertyIds {
  if (!raw) {
    return { ...DEFAULT_PROPERTIES };
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error("Error parsing property IDs:", e);
      return { ...DEFAULT_PROPERTIES };
    }
  }

  return raw as unknown as PropertyIds;
}

export function updatePropertyByType(
  currentProperties: PropertyIds,
  type: string,
  data: any,
  action: string
): PropertyIds {
  const updated = { ...currentProperties };

  if (type === "ga4") {
    updated.ga4 = action === "connect" ? data : null;
  } else if (type === "gsc") {
    updated.gsc = action === "connect" ? data : null;
  } else if (type === "gbp") {
    if (action === "connect") {
      updated.gbp = data;
    } else {
      updated.gbp = [];
    }
  }

  return updated;
}
