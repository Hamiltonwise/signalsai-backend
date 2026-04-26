/**
 * HubSpot adapter — implements ICrmAdapter for HubSpot.
 *
 * Uses raw fetch (no SDK dependency) — the SDK adds little for our four call
 * paths and would pull a transitive dependency tree for one adapter. If
 * additional HubSpot features are needed later (batch contacts, custom
 * objects), reconsider adopting `@hubspot/api-client`.
 *
 * Endpoints:
 *   - GET https://api.hubapi.com/account-info/v3/details   (validateConnection)
 *   - GET https://api.hubapi.com/marketing/v3/forms        (listForms)
 *   - GET https://api.hubapi.com/marketing/v3/forms/{id}   (getFormSchema)
 *   - POST https://api.hsforms.com/submissions/v3/integration/submit/{portalId}/{formGuid}
 *                                                          (submitForm — auth-less for non-sensitive)
 */

import type {
  ICrmAdapter,
  MappedFieldPayload,
  PushResult,
  SubmitFormContext,
  ValidateConnectionResult,
  VendorForm,
  VendorFormField,
} from "./types";

const HUBAPI = "https://api.hubapi.com";
const HSFORMS = "https://api.hsforms.com";
const RESPONSE_BODY_TRUNCATE_BYTES = 4096;

interface HubSpotFormFieldRaw {
  name?: string;
  label?: string;
  fieldType?: string;
  required?: boolean;
}

interface HubSpotFormFieldGroup {
  fields?: HubSpotFormFieldRaw[];
}

interface HubSpotFormRaw {
  id?: string;
  name?: string;
  fieldGroups?: HubSpotFormFieldGroup[];
}

interface HubSpotFormsListResponse {
  results?: HubSpotFormRaw[];
  paging?: { next?: { after?: string } };
}

interface HubSpotAccountDetails {
  portalId?: number;
  accountType?: string;
  companyName?: string;
  uiDomain?: string;
}

function truncateBody(body: string): string {
  if (body.length <= RESPONSE_BODY_TRUNCATE_BYTES) return body;
  return body.slice(0, RESPONSE_BODY_TRUNCATE_BYTES) + "…[truncated]";
}

function mapFormToVendorForm(raw: HubSpotFormRaw): VendorForm {
  const fields: VendorFormField[] = [];
  for (const group of raw.fieldGroups ?? []) {
    for (const f of group.fields ?? []) {
      if (!f.name) continue;
      fields.push({
        name: f.name,
        label: f.label ?? f.name,
        fieldType: f.fieldType ?? "single_line_text",
        required: Boolean(f.required),
      });
    }
  }
  return {
    id: String(raw.id ?? ""),
    name: raw.name ?? "(unnamed form)",
    fields,
  };
}

class HubSpotAdapter implements ICrmAdapter {
  async validateConnection(decryptedCreds: string): Promise<ValidateConnectionResult> {
    try {
      const res = await fetch(`${HUBAPI}/account-info/v3/details`, {
        headers: {
          Authorization: `Bearer ${decryptedCreds}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 401) {
        return { ok: false, error: "invalid_token", errorMessage: "Token rejected by HubSpot" };
      }
      if (res.status === 429) {
        return { ok: false, error: "rate_limited", errorMessage: "HubSpot rate limit hit during validation" };
      }
      if (!res.ok) {
        const body = truncateBody(await res.text());
        return { ok: false, error: "unknown", errorMessage: `HubSpot ${res.status}: ${body}` };
      }

      const data = (await res.json()) as HubSpotAccountDetails;
      return {
        ok: true,
        portalId: data.portalId !== undefined ? String(data.portalId) : undefined,
        accountName: data.companyName ?? data.uiDomain ?? undefined,
      };
    } catch (err) {
      return {
        ok: false,
        error: "network",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listForms(decryptedCreds: string): Promise<VendorForm[]> {
    const all: VendorForm[] = [];
    let after: string | undefined;
    // Cap at 10 pages (1000 forms) to bound this call. Customers with more
    // than 1000 active forms are exotic; if it becomes real, paginate further.
    for (let page = 0; page < 10; page++) {
      const url = new URL(`${HUBAPI}/marketing/v3/forms`);
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${decryptedCreds}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const body = truncateBody(await res.text());
        throw new Error(`HubSpot listForms failed (${res.status}): ${body}`);
      }

      const data = (await res.json()) as HubSpotFormsListResponse;
      for (const raw of data.results ?? []) {
        all.push(mapFormToVendorForm(raw));
      }

      after = data.paging?.next?.after;
      if (!after) break;
    }
    return all;
  }

  async getFormSchema(decryptedCreds: string, formId: string): Promise<VendorForm | null> {
    const res = await fetch(`${HUBAPI}/marketing/v3/forms/${encodeURIComponent(formId)}`, {
      headers: {
        Authorization: `Bearer ${decryptedCreds}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      const body = truncateBody(await res.text());
      throw new Error(`HubSpot getFormSchema failed (${res.status}): ${body}`);
    }

    const raw = (await res.json()) as HubSpotFormRaw;
    return mapFormToVendorForm(raw);
  }

  async submitForm(
    _decryptedCreds: string,
    formId: string,
    mappedFields: MappedFieldPayload[],
    context: SubmitFormContext,
    vendorMeta: Record<string, unknown>,
  ): Promise<PushResult> {
    const portalId = vendorMeta?.portalId;
    if (!portalId || (typeof portalId !== "string" && typeof portalId !== "number")) {
      return {
        outcome: "vendor_error",
        error: "Missing portalId in integration metadata",
      };
    }

    const url = `${HSFORMS}/submissions/v3/integration/submit/${encodeURIComponent(String(portalId))}/${encodeURIComponent(formId)}`;
    const body = {
      fields: mappedFields.map((f) => ({ name: f.name, value: f.value })),
      context: {
        ...(context.pageUri ? { pageUri: context.pageUri } : {}),
        ...(context.pageName ? { pageName: context.pageName } : {}),
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
        ...(context.hutk ? { hutk: context.hutk } : {}),
      },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const responseText = truncateBody(await res.text());

      if (res.ok) {
        return {
          outcome: "success",
          vendorResponseStatus: res.status,
          vendorResponseBody: responseText,
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          outcome: "auth_failed",
          vendorResponseStatus: res.status,
          vendorResponseBody: responseText,
          error: "HubSpot rejected credentials",
        };
      }
      if (res.status === 404) {
        return {
          outcome: "form_not_found",
          vendorResponseStatus: res.status,
          vendorResponseBody: responseText,
          error: "HubSpot form not found (deleted or moved)",
        };
      }
      if (res.status === 429) {
        // Throw so BullMQ retries with backoff.
        const err = new Error(`HubSpot rate limited (429): ${responseText}`);
        (err as Error & { statusCode?: number }).statusCode = 429;
        throw err;
      }
      if (res.status >= 500) {
        // Throw so BullMQ retries.
        const err = new Error(`HubSpot ${res.status}: ${responseText}`);
        (err as Error & { statusCode?: number }).statusCode = res.status;
        throw err;
      }

      return {
        outcome: "vendor_error",
        vendorResponseStatus: res.status,
        vendorResponseBody: responseText,
        error: `HubSpot ${res.status}`,
      };
    } catch (err) {
      // Re-throw rate-limit and 5xx (already wrapped above).
      if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode) {
        throw err;
      }
      return {
        outcome: "network_error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const hubspotAdapter: ICrmAdapter = new HubSpotAdapter();
