/**
 * Webhook Orchestrator Service
 *
 * Centralized agent webhook calls. All external webhook communication
 * goes through this service. Includes the generic callAgentWebhook
 * function, the identifyLocationMeta function, and webhook URL constants.
 */

import axios from "axios";
import { log } from "../feature-utils/agentLogger";

// =====================================================================
// WEBHOOK URL CONSTANTS
// =====================================================================

export const PROOFLINE_WEBHOOK = process.env.PROOFLINE_AGENT_WEBHOOK || "";
export const SUMMARY_WEBHOOK = process.env.SUMMARY_AGENT_WEBHOOK || "";
export const REFERRAL_ENGINE_WEBHOOK =
  process.env.REFERRAL_ENGINE_AGENT_WEBHOOK || "";
export const OPPORTUNITY_WEBHOOK = process.env.OPPORTUNITY_AGENT_WEBHOOK || "";
export const CRO_OPTIMIZER_WEBHOOK =
  process.env.CRO_OPTIMIZER_AGENT_WEBHOOK || "";
export const COPY_COMPANION_WEBHOOK =
  process.env.COPY_COMPANION_AGENT_WEBHOOK || "";
export const GUARDIAN_AGENT_WEBHOOK =
  process.env.GUARDIAN_AGENT_WEBHOOK || "";
export const GOVERNANCE_AGENT_WEBHOOK =
  process.env.GOVERNANCE_AGENT_WEBHOOK || "";
export const IDENTIFIER_AGENT_WEBHOOK =
  process.env.IDENTIFIER_AGENT_WEBHOOK || "";

// =====================================================================
// GENERIC WEBHOOK CALLER
// =====================================================================

/**
 * Call an agent webhook with payload
 */
export async function callAgentWebhook(
  webhookUrl: string,
  payload: any,
  agentName: string,
): Promise<any> {
  if (!webhookUrl) {
    throw new Error(`No webhook URL configured for ${agentName}`);
  }

  log(`  \u2192 Calling ${agentName} webhook: ${webhookUrl}`);

  try {
    const response = await axios.post(webhookUrl, payload, {
      timeout: 600000, // 10 minutes timeout
      headers: {
        "Content-Type": "application/json",
      },
    });

    log(`  \u2713 ${agentName} webhook responded successfully`);
    return response.data;
  } catch (error: any) {
    log(`  \u2717 ${agentName} webhook failed: ${error?.message || String(error)}`);
    throw error;
  }
}

// =====================================================================
// IDENTIFIER AGENT
// =====================================================================

/**
 * Call Identifier Agent to determine specialty and market location from GBP profile
 */
export async function identifyLocationMeta(
  gbpData: any,
  domain: string,
): Promise<{ specialty: string; marketLocation: string }> {
  log(`  [IDENTIFIER] Identifying specialty and market for ${domain}`);

  if (!IDENTIFIER_AGENT_WEBHOOK) {
    log(
      `  [IDENTIFIER] \u26a0 IDENTIFIER_AGENT_WEBHOOK not configured, using fallbacks`,
    );
    return getFallbackMeta(gbpData);
  }

  try {
    const payload = {
      domain,
      gbp_profile: gbpData.profile || {},
      // Include full storefront address fields for better location identification
      storefront_address: gbpData.profile?.storefrontAddress || {},
      address: {
        locality: gbpData.profile?.storefrontAddress?.locality || "",
        administrativeArea:
          gbpData.profile?.storefrontAddress?.administrativeArea || "",
        postalCode: gbpData.profile?.storefrontAddress?.postalCode || "",
        addressLines: gbpData.profile?.storefrontAddress?.addressLines || [],
      },
    };

    const response = await axios.post(IDENTIFIER_AGENT_WEBHOOK, payload, {
      timeout: 60000,
      headers: { "Content-Type": "application/json" },
    });

    let data = response.data;
    if (Array.isArray(data)) data = data[0] || {};

    const specialty = data.specialty || "orthodontist";
    const marketLocation = data.marketLocation || getFallbackMarket(gbpData);

    log(`  [IDENTIFIER] \u2713 Identified: ${specialty} in ${marketLocation}`);

    return { specialty, marketLocation };
  } catch (error: any) {
    log(`  [IDENTIFIER] \u2717 Webhook failed: ${error.message}. Using fallbacks.`);
    return getFallbackMeta(gbpData);
  }
}

/**
 * Fallback logic for location metadata
 */
export function getFallbackMeta(gbpData: any): {
  specialty: string;
  marketLocation: string;
} {
  return {
    specialty: "orthodontist",
    marketLocation: getFallbackMarket(gbpData),
  };
}

/**
 * Extract city, state from GBP profile storefront address
 */
export function getFallbackMarket(gbpData: any): string {
  const addr = gbpData.profile?.storefrontAddress;
  if (addr && addr.locality && addr.administrativeArea) {
    return `${addr.locality}, ${addr.administrativeArea}`;
  }
  return "Unknown, US";
}
