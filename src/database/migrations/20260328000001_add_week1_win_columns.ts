import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.text("week1_win_headline").nullable();
    t.text("week1_win_detail").nullable();
    t.text("week1_win_type").nullable(); // 'gbp_completeness' | 'nap_inconsistency' | 'site_speed' | 'strong_profile'
    t.timestamp("week1_win_shown_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.dropColumn("week1_win_headline");
    t.dropColumn("week1_win_detail");
    t.dropColumn("week1_win_type");
    t.dropColumn("week1_win_shown_at");
  });
}
