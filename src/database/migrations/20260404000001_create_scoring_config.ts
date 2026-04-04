import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("scoring_config", (table) => {
    table.increments("id").primary();
    table.string("key").notNullable().unique();
    table.float("value").notNullable();
    table.string("label").notNullable();
    table.text("description").nullable();
    table.string("updated_by").nullable();
    table.timestamps(true, true);
  });

  // Seed with napkin-math defaults from clarityScoring.ts
  // Every key maps to one calculation. Every calculation is one sentence.
  await knex("scoring_config").insert([
    // Sub-score maxes (must sum to 100)
    { key: "review_health_max", value: 33, label: "Review Health max points", description: "Maximum points for Review Health factor. Three factor maxes must sum to 100." },
    { key: "gbp_completeness_max", value: 33, label: "GBP Completeness max points", description: "Maximum points for GBP Completeness factor." },
    { key: "online_activity_max", value: 34, label: "Online Activity max points", description: "Maximum points for Online Activity factor." },

    // Review Health components
    { key: "rating_max_pts", value: 8, label: "Rating points (max)", description: "Formula: (rating / 5) * this value. 5 stars = full points." },
    { key: "count_vs_competitor_max_pts", value: 10, label: "Count vs competitor points (max)", description: "Formula: min(1, yourReviews / competitorReviews) * this value." },
    { key: "response_rate_max_pts", value: 10, label: "Response rate points (max)", description: "Formula: (responsesPosted / totalReviews) * this value. DFY: Alloro does this." },
    { key: "recency_pts", value: 5, label: "Recent review bonus", description: "Points if at least one review exists in the last 30 days. 0 if not." },

    // GBP Completeness components (weighted by DFY controllability)
    { key: "description_pts", value: 10, label: "Description present points", description: "DFY: Alloro writes the GBP description." },
    { key: "photos_pts", value: 8, label: "Photos present points", description: "DFY: Alloro can post from existing photo library." },
    { key: "website_pts", value: 8, label: "Website present points", description: "DFY: PatientPath builds the website automatically." },
    { key: "phone_pts", value: 4, label: "Phone present points", description: "DWY: Owner enters phone number in GBP." },
    { key: "hours_pts", value: 3, label: "Hours present points", description: "DWY: Owner enters business hours in GBP." },

    // Online Activity components (all DFY)
    { key: "posts_1_pts", value: 8, label: "1 GBP post in 30 days", description: "Points for 1 GBP post in last 30 days. DFY when post engine is active." },
    { key: "posts_2_plus_pts", value: 14, label: "2+ GBP posts in 30 days", description: "Points for 2+ GBP posts in last 30 days." },
    { key: "review_responses_pts", value: 10, label: "Review responses in 30 days", description: "Points for any review responses posted in last 30 days. DFY: Alloro does this." },
    { key: "content_freshness_pts", value: 10, label: "Website content fresh", description: "Points if website content was updated in last 30 days. DFY: SEO content pipeline." },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("scoring_config");
}
