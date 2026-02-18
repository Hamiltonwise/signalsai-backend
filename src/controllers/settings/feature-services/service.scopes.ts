import { GoogleAccountModel } from "../../../models/GoogleAccountModel";
import {
  SCOPE_MAP,
  parseScopes,
  buildScopeStatus,
  getMissingScopes,
} from "../feature-utils/util.scope-parser";

export async function getGrantedScopes(googleAccountId: number) {
  if (!googleAccountId) {
    const error = new Error("Missing google account ID") as any;
    error.statusCode = 400;
    error.body = { error: "Missing google account ID" };
    throw error;
  }

  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount) {
    const error = new Error("Account not found") as any;
    error.statusCode = 404;
    error.body = { error: "Account not found" };
    throw error;
  }

  const scopeString = googleAccount.scopes || "";
  const normalizedScopes = parseScopes(scopeString);

  // Debug logging
  console.log("[Settings] Scopes for account", googleAccountId, ":", {
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
