import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const snippets = await knex("website_builder.header_footer_code")
    .select("id", "project_id", "code")
    .where("name", "Rybbit Analytics");

  for (const snippet of snippets) {
    const match = snippet.code?.match(/data-site-id="([^"]+)"/);
    const siteId = match?.[1];

    if (!siteId) {
      console.warn(`[rybbit-migration] Could not extract site ID from snippet ${snippet.id} — skipping`);
      continue;
    }

    const existing = await knex("website_builder.website_integrations")
      .where({ project_id: snippet.project_id, platform: "rybbit" })
      .first();

    if (existing) {
      console.log(`[rybbit-migration] Integration already exists for project ${snippet.project_id} — skipping`);
      continue;
    }

    await knex("website_builder.website_integrations").insert({
      project_id: snippet.project_id,
      platform: "rybbit",
      type: "hybrid",
      label: null,
      encrypted_credentials: null,
      metadata: JSON.stringify({ siteId }),
      status: "active",
      connected_by: "system",
      created_at: new Date(),
      updated_at: new Date(),
    });

    await knex("website_builder.header_footer_code")
      .where("id", snippet.id)
      .update({ is_enabled: false, updated_at: new Date() });

    console.log(`[rybbit-migration] Created integration for project ${snippet.project_id} (siteId=${siteId}), disabled old snippet`);
  }
}

export async function down(knex: Knex): Promise<void> {
  const integrations = await knex("website_builder.website_integrations")
    .select("project_id")
    .where({ platform: "rybbit", connected_by: "system" });

  for (const integration of integrations) {
    await knex("website_builder.header_footer_code")
      .where({ project_id: integration.project_id, name: "Rybbit Analytics" })
      .update({ is_enabled: true, updated_at: new Date() });
  }

  await knex("website_builder.website_integrations")
    .where({ platform: "rybbit", connected_by: "system" })
    .del();
}
