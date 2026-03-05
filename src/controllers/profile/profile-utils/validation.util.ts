export function validateOrganizationId(
  organizationId: number | undefined
): asserts organizationId is number {
  if (!organizationId) {
    const error = new Error("Missing organization ID");
    (error as any).statusCode = 400;
    throw error;
  }
}

export function validateUpdateFields(
  operational_jurisdiction?: string
): { operational_jurisdiction?: string } {
  const fields: { operational_jurisdiction?: string } = {};

  if (operational_jurisdiction !== undefined) {
    fields.operational_jurisdiction = operational_jurisdiction;
  }

  if (Object.keys(fields).length === 0) {
    const error = new Error("No valid fields provided for update");
    (error as any).statusCode = 400;
    throw error;
  }

  return fields;
}
