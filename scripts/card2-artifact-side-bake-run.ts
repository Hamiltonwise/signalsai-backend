/**
 * Card 2 (artifact-side) live exercise.
 *
 * Drives the metaTagBake generators against:
 *   1. Garrison (org_id 5, real DB row)
 *   2. Coastal (synthetic facts; the org row is not yet in DB)
 *
 * Output: JSON artifact per page for each practice, including validation
 * verdicts. Used to populate the /tmp proof file.
 */

import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import { buildPageMetaTags } from "../src/services/patientpath/stages/metaTagBake";

async function main() {
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const orgRow = await c.query(
    "SELECT id, name, business_data, patientpath_preview_url FROM organizations WHERE id = 5",
  );
  const vocabRow = await c.query(
    "SELECT vertical FROM vocabulary_configs WHERE org_id = 5",
  );
  const org = orgRow.rows[0];
  const bd = (org?.business_data as Record<string, any>) || {};
  const vertical = (vocabRow.rows[0]?.vertical as string) || "general_dentistry";

  const garrisonFacts = {
    practiceName: "Garrison Orthodontics",
    vertical,
    city: bd?.address?.city as string | undefined,
    state: bd?.address?.state as string | undefined,
    description: bd?.description as string | undefined,
    baseUrl:
      (org?.patientpath_preview_url as string | null) ||
      (typeof bd.website === "string" ? bd.website : "") ||
      `https://garrison-orthodontics-${org?.id}.sites.getalloro.com`,
    ogImage:
      (typeof bd.logo_url === "string" ? bd.logo_url : undefined) ||
      (typeof bd.photo_url === "string" ? bd.photo_url : undefined),
  };

  console.log("=========================================================");
  console.log("GARRISON (live DB, org_id=5)");
  console.log("=========================================================");
  console.log("source facts:", JSON.stringify(garrisonFacts, null, 2));
  for (const pagePath of ["/", "/services", "/about", "/contact"]) {
    const result = buildPageMetaTags({ facts: garrisonFacts, pagePath });
    console.log(`\n--- page: ${pagePath} ---`);
    console.log(JSON.stringify(result, null, 2));
  }

  const coastalFacts = {
    practiceName: "Coastal Endodontic Studio",
    vertical: "endodontics",
    city: "San Luis Obispo",
    state: "CA",
    description:
      "Board-certified endodontist Dr. Jonathan Fu serves the Central Coast with Aloha-spirit care, GentleWave technology, and same-day emergency appointments.",
    baseUrl: "https://calm-beauty-2180.sites.getalloro.com",
    ogImage: "https://calm-beauty-2180.sites.getalloro.com/favicon.png",
  };

  console.log("\n=========================================================");
  console.log("COASTAL (synthetic; org row not yet in DB)");
  console.log("=========================================================");
  console.log("source facts:", JSON.stringify(coastalFacts, null, 2));
  for (const pagePath of ["/", "/services", "/about", "/contact"]) {
    const result = buildPageMetaTags({ facts: coastalFacts, pagePath });
    console.log(`\n--- page: ${pagePath} ---`);
    console.log(JSON.stringify(result, null, 2));
  }

  await c.end();
}

main().catch((err) => {
  console.error("ERR", err);
  process.exit(1);
});
