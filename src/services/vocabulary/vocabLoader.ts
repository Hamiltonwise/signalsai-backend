/**
 * Vertical Vocabulary Loader — Card J (builds on Card K capabilities).
 *
 * Single entry point every downstream service uses to resolve the
 * customer-facing nouns (patient/client, doctor/practitioner, referral source,
 * schema.org sub-type) and the capability flags (referral_tracking, gp_network,
 * hipaa_mode) for a given org.
 *
 * Storage model:
 *   - vocabulary_configs.overrides (JSONB) — per-org vocabulary overrides.
 *   - vocabulary_configs.capabilities (JSONB) — per-org capability flags
 *     (added by the Card K 20260424 migration).
 *   - Any missing field ⇒ healthcare default.
 *   - Unknown org, DB error, or Redis error ⇒ pure healthcare defaults.
 *
 * Cache: per-orgId Redis key `vocab:org:<orgId>`, 5-minute TTL. The shared
 * IORedis client is used (see services/redis.ts). Cache failures never
 * crash the loader — we fall through to the DB read.
 */

import { db } from "../../database/connection";
import { getSharedRedis } from "../redis";

export interface VocabCapabilities {
  referral_tracking: boolean;
  gp_network: boolean;
  hipaa_mode: boolean;
  [extra: string]: boolean | undefined;
}

/** Back-compat alias — pre-Card-J code imports `Capabilities`. */
export type Capabilities = VocabCapabilities;

export interface VocabConfig {
  customerTerm: string;
  customerTermPlural: string;
  providerTerm: string;
  identitySection: string;
  schemaSubType: string;
  referralSourceTerm: string;
  capabilities: VocabCapabilities;
}

export const HEALTHCARE_DEFAULT_VOCAB: VocabConfig = Object.freeze({
  customerTerm: "patient",
  customerTermPlural: "patients",
  providerTerm: "doctor",
  identitySection: "doctor_story",
  schemaSubType: "Dentist",
  referralSourceTerm: "referring GP",
  capabilities: Object.freeze({
    referral_tracking: true,
    gp_network: true,
    hipaa_mode: true,
  }) as VocabCapabilities,
}) as VocabConfig;

export const DEFAULT_CAPABILITIES: VocabCapabilities = {
  ...HEALTHCARE_DEFAULT_VOCAB.capabilities,
};

const CACHE_TTL_SECONDS = 300;
const CACHE_KEY_PREFIX = "vocab:org:";

function cacheKey(orgId: number): string {
  return `${CACHE_KEY_PREFIX}${orgId}`;
}

function cloneDefault(): VocabConfig {
  return {
    ...HEALTHCARE_DEFAULT_VOCAB,
    capabilities: { ...HEALTHCARE_DEFAULT_VOCAB.capabilities },
  };
}

function parseJsonb(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

function mergeCapabilities(
  raw: Record<string, unknown> | null
): VocabCapabilities {
  const merged: VocabCapabilities = { ...HEALTHCARE_DEFAULT_VOCAB.capabilities };
  if (!raw) return merged;
  for (const key of ["referral_tracking", "gp_network", "hipaa_mode"]) {
    const v = raw[key];
    if (typeof v === "boolean") merged[key] = v;
  }
  return merged;
}

function buildVocab(
  overrides: Record<string, unknown> | null,
  capabilities: Record<string, unknown> | null
): VocabConfig {
  const o = overrides ?? {};
  const stringOr = (key: string, fallback: string): string => {
    const v = o[key];
    return typeof v === "string" && v.length > 0 ? v : fallback;
  };
  return {
    customerTerm: stringOr("customerTerm", HEALTHCARE_DEFAULT_VOCAB.customerTerm),
    customerTermPlural: stringOr(
      "customerTermPlural",
      HEALTHCARE_DEFAULT_VOCAB.customerTermPlural
    ),
    providerTerm: stringOr("providerTerm", HEALTHCARE_DEFAULT_VOCAB.providerTerm),
    identitySection: stringOr(
      "identitySection",
      HEALTHCARE_DEFAULT_VOCAB.identitySection
    ),
    schemaSubType: stringOr("schemaSubType", HEALTHCARE_DEFAULT_VOCAB.schemaSubType),
    referralSourceTerm: stringOr(
      "referralSourceTerm",
      HEALTHCARE_DEFAULT_VOCAB.referralSourceTerm
    ),
    capabilities: mergeCapabilities(capabilities),
  };
}

async function readFromCache(orgId: number): Promise<VocabConfig | null> {
  try {
    const redis = getSharedRedis();
    const raw = await redis.get(cacheKey(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return buildVocab(parsed, parsed?.capabilities ?? null);
  } catch {
    return null;
  }
}

async function writeToCache(orgId: number, vocab: VocabConfig): Promise<void> {
  try {
    const redis = getSharedRedis();
    await redis.set(cacheKey(orgId), JSON.stringify(vocab), "EX", CACHE_TTL_SECONDS);
  } catch {
    /* best-effort */
  }
}

async function readFromDb(orgId: number): Promise<VocabConfig> {
  try {
    const row = await db("vocabulary_configs").where({ org_id: orgId }).first();
    if (!row) return cloneDefault();
    const overrides = parseJsonb(row.overrides);
    const capabilities = parseJsonb(row.capabilities);
    return buildVocab(overrides, capabilities);
  } catch {
    return cloneDefault();
  }
}

/**
 * Resolve the full vocabulary config for an org. Never throws.
 */
export async function getVocab(
  orgId: number | null | undefined
): Promise<VocabConfig> {
  if (orgId == null || !Number.isFinite(orgId)) return cloneDefault();

  const cached = await readFromCache(orgId);
  if (cached) return cached;

  const fresh = await readFromDb(orgId);
  await writeToCache(orgId, fresh);
  return fresh;
}

/**
 * Back-compat export for Card K consumers. Now delegates to getVocab so the
 * cache and the data source stay unified.
 */
export async function getCapabilities(
  orgId: number | null | undefined
): Promise<VocabCapabilities> {
  const vocab = await getVocab(orgId);
  return { ...vocab.capabilities };
}

/** Test-only: clear the Redis entry for a specific orgId. */
export async function _invalidateVocabCache(orgId: number): Promise<void> {
  try {
    const redis = getSharedRedis();
    await redis.del(cacheKey(orgId));
  } catch {
    /* swallow */
  }
}
