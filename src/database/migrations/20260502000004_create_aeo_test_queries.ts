import type { Knex } from "knex";

/**
 * AEO Test Queries table.
 *
 * Holds the 25 monitoring queries from the March 26 spec, plus per-
 * specialty filtering metadata. Phase 1 seeds the initial 25 from the
 * existing src/services/agents/aeoMonitor.ts hardcoded list (which is
 * itself the materialized version of the March 26 Notion page list).
 *
 * Schema:
 *  - query: the actual phrase to test
 *  - specialty: 'endodontics' | 'orthodontics' | 'general' (for filtering
 *    via vocabulary_configs at run time)
 *  - vertical: alias for specialty kept for forward-compat with the
 *    cold-outbound vertical column ("endodontist" / "orthodontist" / null)
 *  - active: true means run on the daily cycle
 *  - notes: free-text rationale per query
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("aeo_test_queries");
  if (exists) return;

  await knex.schema.createTable("aeo_test_queries", (table) => {
    table.bigIncrements("id").primary();
    table.text("query").notNullable().unique();
    table.text("specialty").notNullable().defaultTo("general");
    table.text("vertical").nullable();
    table.boolean("active").notNullable().defaultTo(true);
    table.text("notes").nullable();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // 25 queries seeded from the March 26 spec (currently hardcoded in
  // src/services/agents/aeoMonitor.ts).
  const seeds: Array<{
    query: string;
    specialty: string;
    vertical: string | null;
    notes: string;
  }> = [
    { query: "how do I know if my endodontist rankings are dropping", specialty: "endodontics", vertical: "endodontist", notes: "owner-facing diagnostic question" },
    { query: "best software to track GP referrals for endodontist", specialty: "endodontics", vertical: "endodontist", notes: "owner buying intent" },
    { query: "how to get more referrals for my specialty practice", specialty: "general", vertical: null, notes: "cross-specialty owner question" },
    { query: "what is business clarity for a medical practice", specialty: "general", vertical: null, notes: "category-creation query" },
    { query: "endodontist marketing software", specialty: "endodontics", vertical: "endodontist", notes: "category buying intent" },
    { query: "how to track which GPs send me the most patients", specialty: "general", vertical: null, notes: "owner buying intent" },
    { query: "best way to follow up with referring dentists", specialty: "general", vertical: null, notes: "operational question" },
    { query: "how do I know if my practice is losing referrals", specialty: "general", vertical: null, notes: "diagnostic question" },
    { query: "dental specialist practice management dashboard", specialty: "general", vertical: null, notes: "category buying intent" },
    { query: "automated referral tracking for dental specialists", specialty: "general", vertical: null, notes: "category buying intent" },
    { query: "how do patients find an endodontist near me", specialty: "endodontics", vertical: "endodontist", notes: "patient-shaped query (proxy)" },
    { query: "why is my dental practice not showing up on Google", specialty: "general", vertical: null, notes: "diagnostic question" },
    { query: "how to improve Google Business Profile for dentist", specialty: "general", vertical: null, notes: "operational question" },
    { query: "best way to get more Google reviews for dental practice", specialty: "general", vertical: null, notes: "operational question" },
    { query: "patient journey tracking for dental specialists", specialty: "general", vertical: null, notes: "category buying intent" },
    { query: "how to see what competitors rank for in dental marketing", specialty: "general", vertical: null, notes: "operational question" },
    { query: "endodontist competitor analysis tool", specialty: "endodontics", vertical: "endodontist", notes: "category buying intent" },
    { query: "how do I know if another practice is taking my referrals", specialty: "general", vertical: null, notes: "diagnostic question" },
    { query: "dental practice market share analysis", specialty: "general", vertical: null, notes: "category buying intent" },
    { query: "specialist practice benchmarking software", specialty: "general", vertical: null, notes: "category buying intent" },
    { query: "will AI replace dental marketing agencies", specialty: "general", vertical: null, notes: "category-creation query" },
    { query: "how to optimize dental practice for AI search", specialty: "general", vertical: null, notes: "AEO meta query" },
    { query: "Apple Business listing for dental practice", specialty: "general", vertical: null, notes: "platform-specific query" },
    { query: "how to claim Apple Business profile for dentist", specialty: "general", vertical: null, notes: "platform-specific query" },
    { query: "answer engine optimization for healthcare practices", specialty: "general", vertical: null, notes: "AEO meta query" },
  ];

  await knex("aeo_test_queries").insert(seeds);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("aeo_test_queries");
}
