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

  // Seed with current hardcoded defaults from clarityScoring.ts
  await knex("scoring_config").insert([
    // Sub-score max weights
    {
      key: "google_position_max",
      value: 34,
      label: "Google Position Weight (max points)",
      description: "Maximum points for the Google Position sub-score. The three sub-score maxes should sum to 100.",
    },
    {
      key: "review_health_max",
      value: 33,
      label: "Review Health Weight (max points)",
      description: "Maximum points for the Review Health sub-score. The three sub-score maxes should sum to 100.",
    },
    {
      key: "gbp_completeness_max",
      value: 33,
      label: "GBP Completeness Weight (max points)",
      description: "Maximum points for the GBP Completeness sub-score. The three sub-score maxes should sum to 100.",
    },

    // Google position scoring tiers
    {
      key: "position_tier_1",
      value: 34,
      label: "Position #1 Score",
      description: "Points awarded for ranking #1 in Google search results.",
    },
    {
      key: "position_tier_2",
      value: 28,
      label: "Position #2 Score",
      description: "Points awarded for ranking #2 in Google search results.",
    },
    {
      key: "position_tier_3",
      value: 22,
      label: "Position #3 Score",
      description: "Points awarded for ranking #3 in Google search results.",
    },
    {
      key: "position_tier_top5",
      value: 16,
      label: "Position #4-5 Score",
      description: "Points awarded for ranking #4 or #5 in Google search results.",
    },
    {
      key: "position_tier_top10",
      value: 10,
      label: "Position #6-10 Score",
      description: "Points awarded for ranking #6 through #10 in Google search results.",
    },
    {
      key: "position_tier_top20",
      value: 5,
      label: "Position #11-20 Score",
      description: "Points awarded for ranking #11 through #20 in Google search results.",
    },
    {
      key: "position_tier_beyond20",
      value: 2,
      label: "Position 21+ Score",
      description: "Points awarded for ranking beyond #20 in Google search results.",
    },
    {
      key: "position_unknown",
      value: 17,
      label: "Position Unknown Score",
      description: "Neutral score assigned when position data is not available.",
    },

    // Rating thresholds (ratingPts)
    {
      key: "rating_5_0_pts",
      value: 10,
      label: "Rating 5.0 Points",
      description: "Points for a perfect 5.0 star rating.",
    },
    {
      key: "rating_4_8_pts",
      value: 8,
      label: "Rating 4.8+ Points",
      description: "Points for a 4.8 or higher star rating.",
    },
    {
      key: "rating_4_5_pts",
      value: 6,
      label: "Rating 4.5+ Points",
      description: "Points for a 4.5 or higher star rating.",
    },
    {
      key: "rating_4_0_pts",
      value: 4,
      label: "Rating 4.0+ Points",
      description: "Points for a 4.0 or higher star rating.",
    },
    {
      key: "rating_3_5_pts",
      value: 2,
      label: "Rating 3.5+ Points",
      description: "Points for a 3.5 or higher star rating.",
    },
    {
      key: "rating_below_3_5_pts",
      value: 1,
      label: "Rating Below 3.5 Points",
      description: "Points for a rating below 3.5 stars.",
    },

    // Volume ratio thresholds
    {
      key: "volume_ratio_3x_pts",
      value: 8,
      label: "Volume 3x Benchmark Points",
      description: "Points when review count is 3x or more the specialty benchmark.",
    },
    {
      key: "volume_ratio_2x_pts",
      value: 7,
      label: "Volume 2x Benchmark Points",
      description: "Points when review count is 2x or more the specialty benchmark.",
    },
    {
      key: "volume_ratio_1_5x_pts",
      value: 6,
      label: "Volume 1.5x Benchmark Points",
      description: "Points when review count is 1.5x or more the specialty benchmark.",
    },
    {
      key: "volume_ratio_1x_pts",
      value: 5,
      label: "Volume 1x Benchmark Points",
      description: "Points when review count meets the specialty benchmark.",
    },
    {
      key: "volume_ratio_0_5x_pts",
      value: 4,
      label: "Volume 0.5x Benchmark Points",
      description: "Points when review count is half the specialty benchmark.",
    },
    {
      key: "volume_ratio_0_25x_pts",
      value: 2,
      label: "Volume 0.25x Benchmark Points",
      description: "Points when review count is a quarter of the specialty benchmark.",
    },

    // Photo scoring
    {
      key: "photos_10_plus_pts",
      value: 10,
      label: "10+ Photos Points",
      description: "Points for having 10 or more GBP photos.",
    },
    {
      key: "photos_8_plus_pts",
      value: 9,
      label: "8+ Photos Points",
      description: "Points for having 8 or more GBP photos.",
    },
    {
      key: "photos_5_plus_pts",
      value: 7,
      label: "5+ Photos Points",
      description: "Points for having 5 or more GBP photos.",
    },
    {
      key: "photos_2_plus_pts",
      value: 4,
      label: "2+ Photos Points",
      description: "Points for having 2 or more GBP photos.",
    },
    {
      key: "photos_1_pts",
      value: 2,
      label: "1 Photo Points",
      description: "Points for having exactly 1 GBP photo.",
    },

    // Completeness scoring
    {
      key: "completeness_all_3_pts",
      value: 12,
      label: "All 3 Core Fields Points",
      description: "Points for having hours, phone, and website all set.",
    },
    {
      key: "completeness_2_of_3_pts",
      value: 8,
      label: "2 of 3 Core Fields Points",
      description: "Points for having 2 of 3 core fields (hours, phone, website).",
    },
    {
      key: "completeness_1_of_3_pts",
      value: 4,
      label: "1 of 3 Core Fields Points",
      description: "Points for having 1 of 3 core fields (hours, phone, website).",
    },
    {
      key: "editorial_summary_pts",
      value: 5,
      label: "Editorial Summary Points",
      description: "Points for having a Google AI editorial summary.",
    },
    {
      key: "business_status_operational_pts",
      value: 6,
      label: "Business Status Operational Points",
      description: "Points for having OPERATIONAL or OPEN business status.",
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("scoring_config");
}
