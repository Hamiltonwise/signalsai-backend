import { AuditProcessModel } from "../../../models/AuditProcessModel";

export async function updateAuditFields(
  auditId: string,
  filteredData: Record<string, any>
): Promise<string[]> {
  console.log(`[Audit] Updating ${auditId} with:`, Object.keys(filteredData));

  await AuditProcessModel.updateById(auditId, filteredData);

  return Object.keys(filteredData);
}
