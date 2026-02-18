export const coerceBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const stringValue = String(value).toLowerCase();
  if (["1", "true", "yes"].includes(stringValue)) {
    return true;
  }
  if (["0", "false", "no"].includes(stringValue)) {
    return false;
  }

  return undefined;
};

export const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const ensureArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
};

export function validateJobId(id: unknown): number {
  const jobId = Number(id);
  if (Number.isNaN(jobId) || jobId <= 0) {
    throw Object.assign(new Error("Invalid job id provided"), {
      statusCode: 400,
    });
  }
  return jobId;
}
