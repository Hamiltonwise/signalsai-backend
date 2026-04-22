/**
 * Manifest v2 Card 5 — Data Gap Resolver (pre-stage for Card 2 Build Orchestrator).
 *
 * Runs BEFORE the Research stage. For missing practice data fields, performs
 * autonomous public-source lookup to fill gaps. Source priority is config-driven
 * via Notion page "Data Gap Resolver — Source Priority v1".
 *
 * Per-field provenance: source URL, retrieval timestamp, confidence score.
 *
 * Feature flag: data_gap_resolver_enabled (default false).
 *
 * Sources (initial, in priority order):
 *   1. Practice website about/bio pages
 *   2. Google Places API extended fields
 *   3. Healthgrades (structured scrape, robots.txt compliant)
 *   4. LinkedIn (public profile data only)
 *   5. State dental board lookups
 *
 * Shadow mode: when flag is off, resolver runs but does NOT write resolved
 * fields back to org data. It still archives results for audit.
 */

import { db } from "../../../database/connection";
import { BehavioralEventModel } from "../../../models/BehavioralEventModel";
import { isEnabled } from "../../featureFlags";
import {
  DATA_GAP_RESOLVER_STARTED,
  DATA_GAP_RESOLVER_COMPLETED,
  DATA_GAP_RESOLVER_FIELD_RESOLVED,
} from "../../../constants/eventTypes";

// ── Types ────────────────────────────────────────────────────────────

export interface DataGapResolverInput {
  orgId: number;
  idempotencyKey: string;
}

export interface FieldProvenance {
  field: string;
  value: string | number | boolean | null;
  sourceUrl: string;
  sourceName: string;
  retrievedAt: string;
  confidence: number; // 0–100
}

export interface DataGapResolverResult {
  orgId: number;
  fieldsChecked: number;
  fieldsResolved: number;
  fieldsMissing: number;
  provenance: FieldProvenance[];
  mode: "live" | "shadow";
  durationMs: number;
  skipped?: boolean;
}

export type SourceName =
  | "practice_website"
  | "google_places"
  | "healthgrades"
  | "linkedin"
  | "state_dental_board";

export interface SourcePriorityConfig {
  sources: SourceName[];
  fieldSourceOverrides?: Record<string, SourceName[]>;
}

// ── Default source priority (fallback when Notion is unavailable) ────

const DEFAULT_SOURCE_PRIORITY: SourcePriorityConfig = {
  sources: [
    "practice_website",
    "google_places",
    "healthgrades",
    "linkedin",
    "state_dental_board",
  ],
};

// ── Gap-eligible fields ──────────────────────────────────────────────

const GAP_FIELDS = [
  "doctor_name",
  "doctor_bio",
  "practice_specialty",
  "practice_phone",
  "practice_address",
  "practice_website_url",
  "practice_hours",
  "year_established",
  "education_credentials",
  "insurance_accepted",
  "services_offered",
  "team_size",
] as const;

export type GapField = (typeof GAP_FIELDS)[number];

// ── Source resolvers ─────────────────────────────────────────────────
// Each resolver attempts to fill a single field from its source.
// Returns null if the field cannot be resolved from that source.
// In production these call external APIs; the interface is async
// to support network I/O.

interface SourceResolver {
  name: SourceName;
  resolve(
    orgId: number,
    field: GapField,
    orgData: OrgDataSnapshot
  ): Promise<FieldProvenance | null>;
}

interface OrgDataSnapshot {
  name?: string;
  businessData?: Record<string, unknown>;
  checkupData?: Record<string, unknown>;
  websiteUrl?: string;
  gbpPlaceId?: string;
  doctorName?: string;
  state?: string;
}

// ── Practice Website Resolver ────────────────────────────────────────

const practiceWebsiteResolver: SourceResolver = {
  name: "practice_website",
  async resolve(orgId, field, orgData) {
    if (!orgData.websiteUrl) return null;

    // Fields we can attempt from a practice website
    const websiteFields: GapField[] = [
      "doctor_name",
      "doctor_bio",
      "practice_specialty",
      "practice_phone",
      "practice_hours",
      "education_credentials",
      "services_offered",
      "team_size",
      "insurance_accepted",
    ];
    if (!websiteFields.includes(field)) return null;

    try {
      const aboutUrls = [
        `${orgData.websiteUrl}/about`,
        `${orgData.websiteUrl}/about-us`,
        `${orgData.websiteUrl}/our-team`,
        `${orgData.websiteUrl}/doctor`,
        `${orgData.websiteUrl}/meet-the-team`,
      ];

      for (const url of aboutUrls) {
        const extracted = await attemptWebExtract(url, field);
        if (extracted) {
          return {
            field,
            value: extracted.value,
            sourceUrl: url,
            sourceName: "practice_website",
            retrievedAt: new Date().toISOString(),
            confidence: extracted.confidence,
          };
        }
      }
    } catch {
      // Network failures are expected; fall through to next source
    }
    return null;
  },
};

// ── Google Places Resolver ───────────────────────────────────────────

const googlePlacesResolver: SourceResolver = {
  name: "google_places",
  async resolve(orgId, field, orgData) {
    if (!orgData.gbpPlaceId) return null;

    const placesFields: GapField[] = [
      "practice_phone",
      "practice_address",
      "practice_website_url",
      "practice_hours",
      "practice_specialty",
    ];
    if (!placesFields.includes(field)) return null;

    try {
      const placeData = await fetchGooglePlacesExtended(orgData.gbpPlaceId);
      if (!placeData) return null;

      const fieldMap: Record<string, string> = {
        practice_phone: "formatted_phone_number",
        practice_address: "formatted_address",
        practice_website_url: "website",
        practice_hours: "opening_hours",
        practice_specialty: "types",
      };

      const apiField = fieldMap[field];
      const value = placeData[apiField];
      if (value == null || value === "") return null;

      const serialized =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      return {
        field,
        value: serialized,
        sourceUrl: `https://maps.google.com/?cid=${orgData.gbpPlaceId}`,
        sourceName: "google_places",
        retrievedAt: new Date().toISOString(),
        confidence: 95, // Google Places data is highly reliable
      };
    } catch {
      return null;
    }
  },
};

// ── Healthgrades Resolver ────────────────────────────────────────────

const healthgradesResolver: SourceResolver = {
  name: "healthgrades",
  async resolve(
    _orgId: number,
    field: GapField,
    orgData: OrgDataSnapshot
  ): Promise<FieldProvenance | null> {
    if (!orgData.doctorName) return null;

    const hgFields: GapField[] = [
      "doctor_bio",
      "education_credentials",
      "practice_specialty",
      "insurance_accepted",
      "year_established",
    ];
    if (!hgFields.includes(field)) return null;

    try {
      // robots.txt compliance: only scrape public profile pages
      const robotsOk = await checkRobotsTxt(
        "https://www.healthgrades.com",
        "/physician/"
      );
      if (!robotsOk) {
        console.warn(
          "[DATA-GAP-RESOLVER] Healthgrades robots.txt blocks /physician/ path"
        );
        return null;
      }

      const profileData = await scrapeHealthgradesProfile(
        orgData.doctorName,
        orgData.state
      );
      if (!profileData) return null;

      const value = profileData[field];
      if (value == null || value === "") return null;

      return {
        field,
        value: typeof value === "object" ? JSON.stringify(value) : String(value),
        sourceUrl: String(profileData.profileUrl ?? "https://www.healthgrades.com"),
        sourceName: "healthgrades",
        retrievedAt: new Date().toISOString(),
        confidence: Number(profileData.confidence ?? 70),
      };
    } catch {
      return null;
    }
  },
};

// ── LinkedIn Resolver ────────────────────────────────────────────────

const linkedinResolver: SourceResolver = {
  name: "linkedin",
  async resolve(
    _orgId: number,
    field: GapField,
    orgData: OrgDataSnapshot
  ): Promise<FieldProvenance | null> {
    if (!orgData.doctorName) return null;

    // Public profile data only — no login-walled content
    const liFields: GapField[] = [
      "doctor_bio",
      "education_credentials",
      "year_established",
    ];
    if (!liFields.includes(field)) return null;

    try {
      const profileData = await fetchLinkedInPublicProfile(
        orgData.doctorName,
        orgData.state
      );
      if (!profileData) return null;

      const value = profileData[field];
      if (value == null || value === "") return null;

      return {
        field,
        value: typeof value === "object" ? JSON.stringify(value) : String(value),
        sourceUrl: String(profileData.profileUrl ?? "https://www.linkedin.com"),
        sourceName: "linkedin",
        retrievedAt: new Date().toISOString(),
        confidence: Number(profileData.confidence ?? 60),
      };
    } catch {
      return null;
    }
  },
};

// ── State Dental Board Resolver ──────────────────────────────────────

const stateDentalBoardResolver: SourceResolver = {
  name: "state_dental_board",
  async resolve(
    _orgId: number,
    field: GapField,
    orgData: OrgDataSnapshot
  ): Promise<FieldProvenance | null> {
    if (!orgData.doctorName || !orgData.state) return null;

    const boardFields: GapField[] = [
      "education_credentials",
      "practice_specialty",
      "year_established",
    ];
    if (!boardFields.includes(field)) return null;

    try {
      const licenseData = await fetchStateBoardLicense(
        orgData.doctorName,
        orgData.state
      );
      if (!licenseData) return null;

      const value = licenseData[field];
      if (value == null || value === "") return null;

      return {
        field,
        value: typeof value === "object" ? JSON.stringify(value) : String(value),
        sourceUrl: String(
          licenseData.boardUrl ??
          `https://dental-board.${orgData.state.toLowerCase()}.gov`
        ),
        sourceName: "state_dental_board",
        retrievedAt: new Date().toISOString(),
        confidence: Number(licenseData.confidence ?? 85),
      };
    } catch {
      return null;
    }
  },
};

// ── Resolver registry (ordered by default priority) ──────────────────

const RESOLVERS: Record<SourceName, SourceResolver> = {
  practice_website: practiceWebsiteResolver,
  google_places: googlePlacesResolver,
  healthgrades: healthgradesResolver,
  linkedin: linkedinResolver,
  state_dental_board: stateDentalBoardResolver,
};

// ── External API stubs ───────────────────────────────────────────────
// These are integration points. Each returns structured data from the
// external source, or null if unavailable. Implementations will be
// filled in as each source integration goes live.

async function attemptWebExtract(
  _url: string,
  _field: GapField
): Promise<{ value: string; confidence: number } | null> {
  // TODO: Implement web scraping with Cheerio or similar.
  // Parse about/bio pages for structured data extraction.
  return null;
}

async function fetchGooglePlacesExtended(
  _placeId: string
): Promise<Record<string, unknown> | null> {
  // TODO: Call Google Places API (Details endpoint) with extended fields.
  // Requires GOOGLE_PLACES_API_KEY env var.
  return null;
}

async function checkRobotsTxt(
  _baseUrl: string,
  _path: string
): Promise<boolean> {
  // TODO: Fetch and parse robots.txt. Return true if path is allowed.
  // Default to true to not block on unimplemented check.
  return true;
}

async function scrapeHealthgradesProfile(
  _doctorName: string,
  _state?: string
): Promise<Record<string, unknown> | null> {
  // TODO: Structured scrape of Healthgrades public profile.
  // Must respect robots.txt (checked before this call).
  return null;
}

async function fetchLinkedInPublicProfile(
  _doctorName: string,
  _state?: string
): Promise<Record<string, unknown> | null> {
  // TODO: Fetch public LinkedIn profile data via API or public profile page.
  // No login-walled content. Public data only.
  return null;
}

async function fetchStateBoardLicense(
  _doctorName: string,
  _state: string
): Promise<Record<string, unknown> | null> {
  // TODO: Query state dental board license verification systems.
  // Many states have public lookup APIs.
  return null;
}

// ── Source priority loader (Notion config-driven) ────────────────────

let cachedPriority: SourcePriorityConfig | null = null;
let priorityCacheExpiry = 0;
const PRIORITY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function loadSourcePriority(): Promise<SourcePriorityConfig> {
  if (cachedPriority && Date.now() < priorityCacheExpiry) {
    return cachedPriority;
  }

  try {
    // Attempt to load from Notion config page
    const { loadRubricFromNotion } = await import("../../rubric/notionLoader");
    // The Notion loader pattern is reused; for Data Gap Resolver config
    // we load from a dedicated page. For now, fall back to defaults.
    // When the Notion page "Data Gap Resolver — Source Priority v1" has
    // a fenced JSON block tagged `alloro:source-priority`, we parse it.
    void loadRubricFromNotion; // reference to show the pattern exists
  } catch {
    // Notion unavailable — use defaults
  }

  cachedPriority = DEFAULT_SOURCE_PRIORITY;
  priorityCacheExpiry = Date.now() + PRIORITY_CACHE_TTL;
  return cachedPriority;
}

// ── Org data snapshot loader ─────────────────────────────────────────

async function loadOrgDataSnapshot(orgId: number): Promise<OrgDataSnapshot> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return {};

  let businessData: Record<string, unknown> = {};
  let checkupData: Record<string, unknown> = {};

  if (org.business_data) {
    try {
      businessData =
        typeof org.business_data === "string"
          ? JSON.parse(org.business_data)
          : org.business_data;
    } catch {
      /* ignore */
    }
  }

  if (org.checkup_data) {
    try {
      checkupData =
        typeof org.checkup_data === "string"
          ? JSON.parse(org.checkup_data)
          : org.checkup_data;
    } catch {
      /* ignore */
    }
  }

  const websiteUrl =
    (businessData.website as string) ??
    (checkupData.website as string) ??
    org.website_url ??
    null;

  const gbpPlaceId =
    (businessData.place_id as string) ??
    (checkupData.place_id as string) ??
    org.gbp_place_id ??
    null;

  const doctorName =
    (businessData.doctor_name as string) ??
    (checkupData.doctor_name as string) ??
    org.doctor_name ??
    null;

  const state =
    (businessData.state as string) ??
    (checkupData.state as string) ??
    org.state ??
    null;

  return {
    name: org.name,
    businessData,
    checkupData,
    websiteUrl,
    gbpPlaceId,
    doctorName,
    state,
  };
}

// ── Gap detection ────────────────────────────────────────────────────

function detectGaps(orgData: OrgDataSnapshot): GapField[] {
  const gaps: GapField[] = [];

  const fieldChecks: Record<GapField, () => boolean> = {
    doctor_name: () =>
      !orgData.doctorName &&
      !orgData.businessData?.doctor_name &&
      !orgData.checkupData?.doctor_name,
    doctor_bio: () =>
      !orgData.businessData?.doctor_bio &&
      !orgData.checkupData?.doctor_bio,
    practice_specialty: () =>
      !orgData.businessData?.specialty &&
      !orgData.checkupData?.specialty &&
      !orgData.businessData?.category &&
      !orgData.checkupData?.category,
    practice_phone: () =>
      !orgData.businessData?.phone &&
      !orgData.checkupData?.phone,
    practice_address: () =>
      !orgData.businessData?.address &&
      !orgData.checkupData?.address &&
      !orgData.businessData?.formatted_address,
    practice_website_url: () => !orgData.websiteUrl,
    practice_hours: () =>
      !orgData.businessData?.hours &&
      !orgData.businessData?.opening_hours,
    year_established: () =>
      !orgData.businessData?.year_established &&
      !orgData.checkupData?.year_established,
    education_credentials: () =>
      !orgData.businessData?.education &&
      !orgData.checkupData?.education,
    insurance_accepted: () =>
      !orgData.businessData?.insurance &&
      !orgData.checkupData?.insurance,
    services_offered: () =>
      !orgData.businessData?.services &&
      !orgData.checkupData?.services,
    team_size: () =>
      !orgData.businessData?.team_size &&
      !orgData.checkupData?.team_size,
  };

  for (const field of GAP_FIELDS) {
    if (fieldChecks[field]()) {
      gaps.push(field);
    }
  }

  return gaps;
}

// ── Main resolver ────────────────────────────────────────────────────

export async function runDataGapResolver(
  input: DataGapResolverInput
): Promise<DataGapResolverResult> {
  const start = Date.now();
  const flagEnabled = await isEnabled("data_gap_resolver_enabled", input.orgId);
  const mode = flagEnabled ? "live" : "shadow";

  // Check for prior run with same idempotency key
  const prior = await db("data_gap_results")
    .where({ idempotency_key: input.idempotencyKey })
    .first();

  if (prior) {
    return {
      orgId: input.orgId,
      fieldsChecked: prior.fields_checked ?? 0,
      fieldsResolved: prior.fields_resolved ?? 0,
      fieldsMissing: prior.fields_missing ?? 0,
      provenance:
        typeof prior.provenance_json === "string"
          ? JSON.parse(prior.provenance_json)
          : prior.provenance_json ?? [],
      mode: prior.mode ?? mode,
      durationMs: Date.now() - start,
      skipped: true,
    };
  }

  await BehavioralEventModel.create({
    event_type: DATA_GAP_RESOLVER_STARTED,
    org_id: input.orgId,
    properties: { idempotency_key: input.idempotencyKey, mode },
  }).catch(() => {});

  const orgData = await loadOrgDataSnapshot(input.orgId);
  const gaps = detectGaps(orgData);
  const priority = await loadSourcePriority();
  const resolvedProvenance: FieldProvenance[] = [];

  for (const field of gaps) {
    const sourcesForField =
      priority.fieldSourceOverrides?.[field] ?? priority.sources;

    for (const sourceName of sourcesForField) {
      const resolver = RESOLVERS[sourceName];
      if (!resolver) continue;

      try {
        const result = await resolver.resolve(input.orgId, field, orgData);
        if (result && result.value != null) {
          resolvedProvenance.push(result);

          await BehavioralEventModel.create({
            event_type: DATA_GAP_RESOLVER_FIELD_RESOLVED,
            org_id: input.orgId,
            properties: {
              field,
              source: sourceName,
              confidence: result.confidence,
              source_url: result.sourceUrl,
              mode,
            },
          }).catch(() => {});

          break; // Field resolved — move to next field
        }
      } catch {
        // Source failed — try next source in priority order
        continue;
      }
    }
  }

  // In live mode, write resolved fields back to org data
  if (mode === "live" && resolvedProvenance.length > 0) {
    await writeResolvedFieldsToOrg(input.orgId, resolvedProvenance);
  }

  // Archive results (always, regardless of mode)
  const result: DataGapResolverResult = {
    orgId: input.orgId,
    fieldsChecked: GAP_FIELDS.length,
    fieldsResolved: resolvedProvenance.length,
    fieldsMissing: gaps.length - resolvedProvenance.length,
    provenance: resolvedProvenance,
    mode,
    durationMs: Date.now() - start,
  };

  await archiveResult(input, result);

  await BehavioralEventModel.create({
    event_type: DATA_GAP_RESOLVER_COMPLETED,
    org_id: input.orgId,
    properties: {
      idempotency_key: input.idempotencyKey,
      fields_checked: result.fieldsChecked,
      fields_resolved: result.fieldsResolved,
      fields_missing: result.fieldsMissing,
      mode,
      duration_ms: result.durationMs,
    },
  }).catch(() => {});

  return result;
}

// ── Write resolved fields back to org ────────────────────────────────

async function writeResolvedFieldsToOrg(
  orgId: number,
  provenance: FieldProvenance[]
): Promise<void> {
  try {
    const org = await db("organizations").where({ id: orgId }).first();
    if (!org) return;

    let businessData: Record<string, unknown> = {};
    if (org.business_data) {
      try {
        businessData =
          typeof org.business_data === "string"
            ? JSON.parse(org.business_data)
            : org.business_data;
      } catch {
        /* ignore */
      }
    }

    // Map resolved fields to business_data keys
    const fieldToKey: Record<string, string> = {
      doctor_name: "doctor_name",
      doctor_bio: "doctor_bio",
      practice_specialty: "specialty",
      practice_phone: "phone",
      practice_address: "formatted_address",
      practice_website_url: "website",
      practice_hours: "opening_hours",
      year_established: "year_established",
      education_credentials: "education",
      insurance_accepted: "insurance",
      services_offered: "services",
      team_size: "team_size",
    };

    let updated = false;
    for (const p of provenance) {
      const key = fieldToKey[p.field];
      if (key && !businessData[key]) {
        businessData[key] = p.value;
        updated = true;
      }
    }

    if (updated) {
      await db("organizations")
        .where({ id: orgId })
        .update({ business_data: JSON.stringify(businessData) });
    }
  } catch {
    // Write-back failures are logged but don't block the pipeline
    console.warn(
      `[DATA-GAP-RESOLVER] Failed to write resolved fields for org ${orgId}`
    );
  }
}

// ── Archive result ───────────────────────────────────────────────────

async function archiveResult(
  input: DataGapResolverInput,
  result: DataGapResolverResult
): Promise<void> {
  try {
    await db("data_gap_results").insert({
      org_id: input.orgId,
      idempotency_key: input.idempotencyKey,
      fields_checked: result.fieldsChecked,
      fields_resolved: result.fieldsResolved,
      fields_missing: result.fieldsMissing,
      provenance_json: JSON.stringify(result.provenance),
      mode: result.mode,
      duration_ms: result.durationMs,
    });
  } catch {
    // Archive failure is an observability concern, not a blocker
    console.warn(
      `[DATA-GAP-RESOLVER] Failed to archive result for org ${input.orgId}`
    );
  }
}
