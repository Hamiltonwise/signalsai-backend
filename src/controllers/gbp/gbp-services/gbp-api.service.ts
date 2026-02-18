import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
import { businessprofileperformance_v1 } from "@googleapis/businessprofileperformance";
import { AuthenticatedRequest } from "../../../middleware/tokenRefresh";

/** API clients (no legacy google.mybusiness calls) */
export function createClients(req: AuthenticatedRequest) {
  if (!req.oauth2Client) {
    throw new Error("OAuth2 client not initialized");
  }

  const auth = req.oauth2Client;

  const acctMgmt =
    new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({ auth });
  const bizInfo =
    new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
      auth,
    });
  const perf = new businessprofileperformance_v1.Businessprofileperformance({
    auth,
  });

  // Optional calls client; comment out entirely if you didn't install the package
  // const calls =
  //   new mybusinessbusinesscalls_v1.Mybusinessbusinesscalls({ auth });

  return { acctMgmt, bizInfo, perf, /* calls, */ auth };
}

export async function buildAuthHeaders(auth: any): Promise<Record<string, string>> {
  // Safest: construct from access token directly (avoids any Headers/iterable weirdness)
  const tokenResp = await auth.getAccessToken();
  const token =
    typeof tokenResp === "string" ? tokenResp : (tokenResp?.token ?? "");
  return { Authorization: `Bearer ${token}` };
}
