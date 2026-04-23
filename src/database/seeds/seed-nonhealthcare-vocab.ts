/**
 * Seed: Non-healthcare vocabulary test org (Card J Done Gate).
 *
 * Creates (idempotent) an organizations row for a LegalService test org
 * and inserts a matching vocabulary_configs row with non-healthcare vocab
 * and capabilities.
 *
 * Usage:
 *   npx ts-node src/database/seeds/seed-nonhealthcare-vocab.ts
 *
 * What it does:
 *   1. Upserts an org named "Alloro Legal Test" (never overwrites existing
 *      data — if the row exists, its id is reused).
 *   2. Upserts a vocabulary_configs row for that org with:
 *        vertical:              "legal"
 *        overrides:             customerTerm "client", customerTermPlural
 *                                "clients", providerTerm "practitioner",
 *                                schemaSubType "LegalService",
 *                                referralSourceTerm "referring attorney".
 *        capabilities:          referral_tracking=true, gp_network=false,
 *                                hipaa_mode=false.
 *   3. Prints the resulting org_id and the merged vocab payload.
 *
 * Safe to run multiple times.
 */
import dotenv from "dotenv";
dotenv.config();

import db from "../connection";

export const LEGAL_TEST_ORG_NAME = "Alloro Legal Test";

export const LEGAL_VOCAB_OVERRIDES = {
  customerTerm: "client",
  customerTermPlural: "clients",
  providerTerm: "practitioner",
  identitySection: "practitioner_story",
  schemaSubType: "LegalService",
  referralSourceTerm: "referring attorney",
};

export const LEGAL_CAPABILITIES = {
  referral_tracking: true,
  gp_network: false,
  hipaa_mode: false,
};

export async function seedNonHealthcareVocab(): Promise<{
  orgId: number;
  created: boolean;
}> {
  const existingOrg = await db("organizations")
    .where({ name: LEGAL_TEST_ORG_NAME })
    .first();

  let orgId: number;
  let created = false;
  if (existingOrg) {
    orgId = existingOrg.id;
  } else {
    const [row] = await db("organizations")
      .insert({ name: LEGAL_TEST_ORG_NAME })
      .returning("id");
    orgId = typeof row === "object" ? (row as { id: number }).id : (row as number);
    created = true;
  }

  const existingVocab = await db("vocabulary_configs")
    .where({ org_id: orgId })
    .first();

  if (existingVocab) {
    await db("vocabulary_configs")
      .where({ org_id: orgId })
      .update({
        vertical: "legal",
        overrides: JSON.stringify(LEGAL_VOCAB_OVERRIDES),
        capabilities: JSON.stringify(LEGAL_CAPABILITIES),
      });
  } else {
    await db("vocabulary_configs").insert({
      org_id: orgId,
      vertical: "legal",
      overrides: JSON.stringify(LEGAL_VOCAB_OVERRIDES),
      capabilities: JSON.stringify(LEGAL_CAPABILITIES),
    });
  }

  return { orgId, created };
}

async function main(): Promise<void> {
  const { orgId, created } = await seedNonHealthcareVocab();
  console.log(
    `[seed] ${created ? "Created" : "Updated"} org "${LEGAL_TEST_ORG_NAME}" (id=${orgId})`
  );
  console.log(`[seed] overrides:`, LEGAL_VOCAB_OVERRIDES);
  console.log(`[seed] capabilities:`, LEGAL_CAPABILITIES);
  await db.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
