import type { Knex } from "knex";

const NEW_VERTICALS = [
  {
    vertical: "barber",
    config: JSON.stringify({
      providerTerm: "barber",
      customerTerm: "client",
      competitorTerm: "barber shop",
      locationTerm: "shop",
      avgCaseValue: 35,
      healthScoreLabel: "Business Clarity Score",
    }),
  },
  {
    vertical: "home_services",
    config: JSON.stringify({
      providerTerm: "contractor",
      customerTerm: "client",
      competitorTerm: "contractor",
      locationTerm: "service area",
      avgCaseValue: 350,
      healthScoreLabel: "Business Clarity Score",
    }),
  },
  {
    vertical: "food_service",
    config: JSON.stringify({
      providerTerm: "owner",
      customerTerm: "customer",
      competitorTerm: "restaurant",
      locationTerm: "restaurant",
      avgCaseValue: 25,
      healthScoreLabel: "Business Clarity Score",
    }),
  },
  {
    vertical: "automotive",
    config: JSON.stringify({
      providerTerm: "mechanic",
      customerTerm: "customer",
      competitorTerm: "auto shop",
      locationTerm: "shop",
      avgCaseValue: 450,
      healthScoreLabel: "Business Clarity Score",
    }),
  },
  {
    vertical: "real_estate",
    config: JSON.stringify({
      providerTerm: "agent",
      customerTerm: "client",
      competitorTerm: "agent",
      locationTerm: "office",
      avgCaseValue: 8500,
      healthScoreLabel: "Business Clarity Score",
    }),
  },
  {
    vertical: "fitness",
    config: JSON.stringify({
      providerTerm: "trainer",
      customerTerm: "member",
      competitorTerm: "gym",
      locationTerm: "studio",
      avgCaseValue: 75,
      healthScoreLabel: "Business Clarity Score",
    }),
  },
  {
    vertical: "medspa",
    config: JSON.stringify({
      providerTerm: "provider",
      customerTerm: "client",
      competitorTerm: "medspa",
      locationTerm: "clinic",
      avgCaseValue: 450,
      healthScoreLabel: "Business Clarity Score",
    }),
  },
  {
    vertical: "accounting",
    config: JSON.stringify({
      providerTerm: "accountant",
      customerTerm: "client",
      competitorTerm: "firm",
      locationTerm: "office",
      avgCaseValue: 2000,
      healthScoreLabel: "Business Clarity Score",
    }),
  },
];

export async function up(knex: Knex): Promise<void> {
  for (const row of NEW_VERTICALS) {
    const exists = await knex("vocabulary_defaults")
      .where({ vertical: row.vertical })
      .first();
    if (!exists) {
      await knex("vocabulary_defaults").insert(row);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const verticals = NEW_VERTICALS.map((v) => v.vertical);
  await knex("vocabulary_defaults").whereIn("vertical", verticals).del();
}
