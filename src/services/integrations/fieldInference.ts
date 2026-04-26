/**
 * Auto-inferred field mappings for the Integrations UI.
 *
 * Given a list of website-side field keys (extracted from past submissions)
 * and the vendor form's field schema, returns a partial mapping
 * { websiteFieldKey: vendorFieldName } seeded by exact match, fuzzy match,
 * and dental-domain synonym rules.
 *
 * The user adjusts the result manually in the UI. Returned mappings should
 * NEVER overwrite explicit user choices in the controller layer — call this
 * ONLY when the user clicks "Auto-fill defaults", and merge over empty slots.
 */

import type { VendorFormField } from "./types";

/** Normalize a field name for matching: lowercase, strip non-alphanumeric. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Aliases for common website field names → canonical vendor field name.
 * The vendor field name on the right MUST match a HubSpot internal name
 * (or vendor equivalent); if the vendor form doesn't have it, the suggestion
 * is dropped.
 */
const ALIASES: Record<string, string> = {
  // email
  email: "email",
  emailaddress: "email",
  yourEmail: "email",
  contactemail: "email",
  // phone
  phone: "phone",
  phonenumber: "phone",
  tel: "phone",
  telephone: "phone",
  mobile: "phone",
  cell: "phone",
  // first name
  firstname: "firstname",
  fname: "firstname",
  givenname: "firstname",
  // last name
  lastname: "lastname",
  lname: "lastname",
  surname: "lastname",
  familyname: "lastname",
  // company / practice
  company: "company",
  practice: "company",
  practicename: "company",
  organization: "company",
  organisation: "company",
  business: "company",
  businessname: "company",
  // message / inquiry / notes
  message: "message",
  inquiry: "message",
  enquiry: "message",
  comments: "message",
  notes: "message",
  question: "message",
  details: "message",
  concern: "message",
  // website
  website: "website",
  url: "website",
  // job title
  jobtitle: "jobtitle",
  title: "jobtitle",
  position: "jobtitle",
  role: "jobtitle",
  // address
  address: "address",
  street: "address",
  streetaddress: "address",
  city: "city",
  state: "state",
  zip: "zip",
  zipcode: "zip",
  postalcode: "zip",
  country: "country",
};

/**
 * Build a lookup of vendor field names by their normalized form for fast
 * comparison. The returned map preserves the original (non-normalized) name
 * so we map back to what HubSpot expects.
 */
function buildVendorIndex(vendorFields: VendorFormField[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const v of vendorFields) {
    idx.set(normalize(v.name), v.name);
    // Also index by label, in case a vendor exposes a friendlier label that
    // matches website-side naming better than the internal name.
    idx.set(normalize(v.label), v.name);
  }
  return idx;
}

/**
 * Returns a partial mapping { websiteFieldKey: vendorFieldName }.
 * - websiteFieldKey is the original website-side key (case preserved).
 * - vendorFieldName is the original HubSpot internal name (case preserved).
 * - Only fields that resolve to a vendor field present on the form are included.
 */
export function inferFieldMapping(
  websiteFields: string[],
  vendorFields: VendorFormField[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const vendorIdx = buildVendorIndex(vendorFields);
  const seenWebsiteFields = new Set<string>();

  for (const websiteField of websiteFields) {
    if (!websiteField || seenWebsiteFields.has(websiteField)) continue;
    seenWebsiteFields.add(websiteField);

    const norm = normalize(websiteField);
    if (!norm) continue;

    // 1) Direct match on vendor field name or label.
    const direct = vendorIdx.get(norm);
    if (direct) {
      out[websiteField] = direct;
      continue;
    }

    // 2) Alias match → look up canonical vendor name in the vendor form.
    const aliased = ALIASES[norm];
    if (aliased) {
      const vendor = vendorIdx.get(normalize(aliased));
      if (vendor) {
        out[websiteField] = vendor;
        continue;
      }
    }

    // 3) Fuzzy substring fallback (e.g., "your_phone" → "phone").
    //    Only apply if exactly one vendor field's normalized form is a
    //    substring of the website field's normalized form (or vice versa).
    //    Avoids ambiguity (e.g., "name" matching both "firstname" and "lastname").
    let fuzzyMatch: string | null = null;
    let fuzzyAmbiguous = false;
    for (const [vendorNorm, vendorName] of vendorIdx.entries()) {
      if (!vendorNorm) continue;
      // Skip very short normalized forms to reduce false positives.
      if (vendorNorm.length < 4) continue;
      if (norm.includes(vendorNorm) || vendorNorm.includes(norm)) {
        if (fuzzyMatch && fuzzyMatch !== vendorName) {
          fuzzyAmbiguous = true;
          break;
        }
        fuzzyMatch = vendorName;
      }
    }
    if (fuzzyMatch && !fuzzyAmbiguous) {
      out[websiteField] = fuzzyMatch;
    }
  }

  return out;
}
