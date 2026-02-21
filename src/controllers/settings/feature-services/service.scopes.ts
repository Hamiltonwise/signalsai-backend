import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import {
  SCOPE_MAP,
  parseScopes,
  buildScopeStatus,
  getMissingScopes,
} from "../feature-utils/util.scope-parser";

export async function getGrantedScopes(organizationId: number) {
  if (!organizationId) {
    const error = new Error("Missing organization ID") as any;
    error.statusCode = 400;
    error.body = { error: "Missing organization ID" };
    throw error;
  }

  const googleConnection = await GoogleConnectionModel.findOneByOrganization(organizationId);

  if (!googleConnection) {
    const error = new Error("Account not found") as any;
    error.statusCode = 404;
    error.body = { error: "Account not found" };
    throw error;
  }

  const scopeString = googleConnection.scopes || "";
  const normalizedScopes = parseScopes(scopeString);

  // Debug logging
  console.log("[Settings] Scopes for organization", organizationId, ":", {
    raw: scopeString,
    parsed: normalizedScopes,
    checkingFor: Object.values(SCOPE_MAP),
  });

  const scopeStatus = buildScopeStatus(normalizedScopes);
  const missingScopes = getMissingScopes(scopeStatus);

  return {
    scopes: scopeStatus,
    missingCount: missingScopes.length,
    missingScopes,
    allGranted: missingScopes.length === 0,
  };
}
