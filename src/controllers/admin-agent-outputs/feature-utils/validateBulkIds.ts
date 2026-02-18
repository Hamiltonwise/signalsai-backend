export interface BulkIdsValidation {
  valid: boolean;
  error?: string;
  ids?: number[];
}

export function validateBulkIds(
  requestBody: any
): BulkIdsValidation {
  const { ids } = requestBody;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return {
      valid: false,
      error: "Must provide an array of output IDs",
    };
  }

  return {
    valid: true,
    ids,
  };
}
