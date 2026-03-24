/**
 * NPI Verification Service
 *
 * T3-E: Validates NPI numbers against the NPI Registry API.
 * Generates MedicalOrganization JSON-LD schema with NPI when verified.
 *
 * NPI Registry: https://npiregistry.cms.hhs.gov/api/?number={npi}&version=2.1
 */

import axios from "axios";
import { db } from "../database/connection";

const NPI_REGISTRY_URL = "https://npiregistry.cms.hhs.gov/api/";

// ─── Types ──────────────────────────────────────────────────────────

export interface NpiVerificationResult {
  valid: boolean;
  npi: string;
  providerName: string | null;
  providerType: string | null;
  address: string | null;
  error: string | null;
}

export interface MedicalOrganizationSchema {
  "@context": string;
  "@type": string;
  name: string;
  url?: string;
  telephone?: string;
  address?: object;
  identifier?: object;
  [key: string]: any;
}

// ─── Verify NPI ─────────────────────────────────────────────────────

/**
 * Validate an NPI number against the NPI Registry API.
 * Returns provider details if valid, error if not.
 */
export async function verifyNpi(npi: string): Promise<NpiVerificationResult> {
  // Basic format check: must be exactly 10 digits
  if (!/^\d{10}$/.test(npi)) {
    return {
      valid: false,
      npi,
      providerName: null,
      providerType: null,
      address: null,
      error: "NPI must be exactly 10 digits",
    };
  }

  try {
    const response = await axios.get(NPI_REGISTRY_URL, {
      params: { number: npi, version: "2.1" },
      timeout: 10000,
    });

    const data = response.data;

    if (!data.results || data.results.length === 0) {
      return {
        valid: false,
        npi,
        providerName: null,
        providerType: null,
        address: null,
        error: "NPI not found in the registry",
      };
    }

    const result = data.results[0];
    const basic = result.basic || {};
    const addresses = result.addresses || [];
    const primaryAddress = addresses.find((a: any) => a.address_purpose === "LOCATION") || addresses[0];

    // Build provider name
    let providerName: string | null = null;
    if (result.enumeration_type === "NPI-2") {
      // Organization
      providerName = basic.organization_name || null;
    } else {
      // Individual
      providerName = [basic.first_name, basic.last_name].filter(Boolean).join(" ") || null;
    }

    const providerType = result.enumeration_type === "NPI-2" ? "Organization" : "Individual";

    const address = primaryAddress
      ? [
          primaryAddress.address_1,
          primaryAddress.city,
          primaryAddress.state,
          primaryAddress.postal_code,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

    return {
      valid: true,
      npi,
      providerName,
      providerType,
      address,
      error: null,
    };
  } catch (error: any) {
    console.error("[NPI] Verification API error:", error.message);
    return {
      valid: false,
      npi,
      providerName: null,
      providerType: null,
      address: null,
      error: "Failed to reach NPI Registry. Try again.",
    };
  }
}

// ─── Save NPI to Org ────────────────────────────────────────────────

/**
 * Verify and save an NPI number for an organization.
 * Sets npi and npi_verified on the organizations record.
 */
export async function verifyAndSaveNpi(
  orgId: number,
  npi: string,
): Promise<NpiVerificationResult> {
  const result = await verifyNpi(npi);

  if (result.valid) {
    await db("organizations")
      .where({ id: orgId })
      .update({ npi, npi_verified: true });
    console.log(`[NPI] Verified and saved NPI ${npi} for org ${orgId}: ${result.providerName}`);
  } else {
    // Save the NPI but mark as unverified
    await db("organizations")
      .where({ id: orgId })
      .update({ npi, npi_verified: false });
    console.log(`[NPI] Saved unverified NPI ${npi} for org ${orgId}: ${result.error}`);
  }

  return result;
}

// ─── MedicalOrganization JSON-LD ────────────────────────────────────

/**
 * Generate MedicalOrganization JSON-LD schema for PatientPath <head>.
 * Includes NPI as identifier when npi_verified = true.
 * Omits NPI field (but still emits schema) when NPI not set.
 */
export function buildMedicalOrganizationSchema(org: {
  name: string;
  npi?: string | null;
  npi_verified?: boolean;
  phone?: string | null;
  websiteUri?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  specialty?: string | null;
}): MedicalOrganizationSchema {
  const schema: MedicalOrganizationSchema = {
    "@context": "https://schema.org",
    "@type": "MedicalOrganization",
    name: org.name,
  };

  if (org.websiteUri) {
    schema.url = org.websiteUri;
  }

  if (org.phone) {
    schema.telephone = org.phone;
  }

  if (org.address || org.city || org.state) {
    schema.address = {
      "@type": "PostalAddress",
      ...(org.address ? { streetAddress: org.address } : {}),
      ...(org.city ? { addressLocality: org.city } : {}),
      ...(org.state ? { addressRegion: org.state } : {}),
      addressCountry: "US",
    };
  }

  if (org.specialty) {
    schema.medicalSpecialty = org.specialty;
  }

  // Include NPI as identifier when verified
  if (org.npi && org.npi_verified) {
    schema.identifier = {
      "@type": "PropertyValue",
      propertyID: "NPI",
      value: org.npi,
    };
  }

  return schema;
}

/**
 * Generate the <script> tag for injection into PatientPath HTML <head>.
 */
export function buildMedicalOrganizationScriptTag(org: Parameters<typeof buildMedicalOrganizationSchema>[0]): string {
  const schema = buildMedicalOrganizationSchema(org);
  return `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>`;
}

// T2 registers the settings update route
