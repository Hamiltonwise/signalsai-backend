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
  phone?: string,
  operational_jurisdiction?: string
): { phone?: string; operational_jurisdiction?: string } {
  const fields: { phone?: string; operational_jurisdiction?: string } = {};

  if (phone !== undefined) {
    fields.phone = phone;
  }

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
