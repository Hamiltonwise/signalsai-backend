/**
 * Vendor-agnostic CRM adapter interface.
 *
 * Each supported vendor (HubSpot, future: Salesforce, Pipedrive) implements
 * ICrmAdapter. The adapter receives an already-decrypted credential string
 * (typically a Bearer token) and is responsible for all vendor-specific URL,
 * payload, and error-shape concerns.
 *
 * Adapters NEVER throw on expected error responses (4xx). They return
 * structured PushResult / ValidateConnectionResult objects so the worker can
 * decide whether to retry, mark broken, etc. Network failures and 5xx may
 * throw to trigger BullMQ retry.
 */

export type CrmPlatform = "hubspot";

export interface VendorFormField {
  /** Internal name used as the key in form submissions. */
  name: string;
  /** Human-readable label (for UI). */
  label: string;
  /** Vendor-specific field type (e.g. "single_line_text", "email", "phone"). */
  fieldType: string;
  required: boolean;
}

export interface VendorForm {
  id: string;
  name: string;
  fields: VendorFormField[];
}

export interface ValidateConnectionResult {
  ok: boolean;
  /** Vendor-specific account/portal identifier. HubSpot: portalId (Hub ID). */
  portalId?: string;
  /** Human-readable account/portal name for UI display. */
  accountName?: string;
  /** Short error code on failure: 'invalid_token' | 'rate_limited' | 'network' | 'unknown'. */
  error?: string;
  /** Additional error context. */
  errorMessage?: string;
}

/**
 * One mapped field — keyed by VENDOR field name (the side we're submitting to),
 * with the value pulled from a website submission.
 */
export interface MappedFieldPayload {
  name: string;
  value: string;
}

export interface SubmitFormContext {
  /** URL of the page the form was submitted from (for HubSpot analytics). */
  pageUri?: string;
  /** Page name for HubSpot analytics. */
  pageName?: string;
  /** Submitter's IP, when known. */
  ipAddress?: string;
  /** HubSpot tracking cookie (hubspotutk), when present. */
  hutk?: string;
}

export type PushOutcome = "success" | "form_not_found" | "auth_failed" | "rate_limited" | "vendor_error" | "network_error";

export interface PushResult {
  outcome: PushOutcome;
  /** HTTP status from vendor, if a response was received. */
  vendorResponseStatus?: number;
  /** Truncated body of the vendor response (max ~4KB). */
  vendorResponseBody?: string;
  /** Short error description for logs. */
  error?: string;
}

export interface ICrmAdapter {
  /**
   * Validate that the given credentials are usable. Returns portalId and
   * accountName on success for storage in integration metadata.
   */
  validateConnection(decryptedCreds: string): Promise<ValidateConnectionResult>;

  /**
   * List all forms available in the connected account.
   * Used by the Integrations UI to populate the "map to which HubSpot form?"
   * dropdown and by the daily validation job to detect deleted forms.
   */
  listForms(decryptedCreds: string): Promise<VendorForm[]>;

  /**
   * Fetch a single form's schema. Returns null if the form does not exist
   * (used as the broken-form signal at submission time and during validation).
   */
  getFormSchema(decryptedCreds: string, formId: string): Promise<VendorForm | null>;

  /**
   * Submit form data to the vendor.
   *
   * @param decryptedCreds  Bearer token (used by vendors that require auth on submit;
   *                        HubSpot's Forms Submissions API does NOT require auth for
   *                        non-sensitive fields, but the parameter is accepted for
   *                        adapters that do).
   * @param formId          Vendor form identifier (HubSpot: form GUID).
   * @param mappedFields    Already-translated field list keyed by vendor field names.
   * @param context         Optional context (page URL, IP, etc.) for vendor analytics.
   * @param vendorMeta      Vendor-specific metadata from the integration row
   *                        (HubSpot needs portalId from here).
   */
  submitForm(
    decryptedCreds: string,
    formId: string,
    mappedFields: MappedFieldPayload[],
    context: SubmitFormContext,
    vendorMeta: Record<string, unknown>,
  ): Promise<PushResult>;
}
