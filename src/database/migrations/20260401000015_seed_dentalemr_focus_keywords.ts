/**
 * Seed focus keywords for DentalEMR (org 6).
 *
 * DentalEMR is a software company, not a practice. They compete in AI search
 * results and organic software queries, not local "near me" searches.
 * These keywords are derived from 10 months of weekly meeting transcripts
 * where the team discussed SEO strategy and competitive positioning.
 *
 * Key data points from transcripts:
 * - DentalEMR is #1 in 4/5 ChatGPT queries for endodontic software
 * - TDO is the primary competitor (server-based, Microsoft Access)
 * - They rank for "cloud endodontic software" and variations
 * - Merideth personally vetted every SEO keyword for FTC accuracy
 */

import { Knex } from "knex";

const ORG_ID = 6;

const KEYWORDS = [
  // Core product keywords (auto-generated from market position)
  { keyword: "cloud endodontic software", source: "auto" },
  { keyword: "endodontic practice management software", source: "auto" },
  { keyword: "endodontic emr software", source: "auto" },
  { keyword: "web based endodontic software", source: "auto" },
  { keyword: "best endodontic software", source: "auto" },

  // Competitive positioning (from ChatGPT dominance discussion Feb 26)
  { keyword: "software alternative to tdo for endodontist", source: "auto" },
  { keyword: "tdo alternative cloud", source: "auto" },
  { keyword: "endodontic software comparison", source: "auto" },

  // Product capability searches
  { keyword: "endodontic claims submission software", source: "auto" },
  { keyword: "hipaa compliant endodontic software", source: "auto" },
  { keyword: "endodontic patient management system", source: "auto" },

  // AI search / AEO (what they dominate in ChatGPT)
  { keyword: "best cloud software for endodontists", source: "auto" },
  { keyword: "dental specialty practice management", source: "auto" },
];

export async function up(knex: Knex): Promise<void> {
  const org = await knex("organizations").where({ id: ORG_ID }).first();
  if (!org) return;

  // Check if table exists
  const hasTable = await knex.schema.hasTable("focus_keywords");
  if (!hasTable) return;

  for (const kw of KEYWORDS) {
    const existing = await knex("focus_keywords")
      .where({ organization_id: ORG_ID, keyword: kw.keyword, is_active: true })
      .first();

    if (!existing) {
      await knex("focus_keywords").insert({
        organization_id: ORG_ID,
        keyword: kw.keyword,
        source: kw.source,
        is_active: true,
      });
    }
  }

  console.log(`[Migration] Seeded ${KEYWORDS.length} focus keywords for DentalEMR (org ${ORG_ID})`);
}

export async function down(knex: Knex): Promise<void> {
  const keywordValues = KEYWORDS.map((k) => k.keyword);
  await knex("focus_keywords")
    .where({ organization_id: ORG_ID })
    .whereIn("keyword", keywordValues)
    .del();
}
