import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const snippets = await knex("website_builder.header_footer_code")
    .select("id", "project_id", "code")
    .where("name", "Rybbit Analytics")
    .where("is_enabled", true);

  for (const snippet of snippets) {
    const match = snippet.code?.match(/data-site-id="([^"]+)"/);
    const siteId = match?.[1];

    if (!siteId) {
      console.warn(`[rybbit-fixup] Could not extract site ID from snippet ${snippet.id} — skipping`);
      continue;
    }

    const existing = await knex("website_builder.website_integrations")
      .where({ project_id: snippet.project_id, platform: "rybbit" })
      .first();

    if (existing) {
      console.log(`[rybbit-fixup] Integration already exists for project ${snippet.project_id} — skipping`);
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

    console.log(`[rybbit-fixup] Created integration for project ${snippet.project_id} (siteId=${siteId}), disabled old snippet`);
  }
}

export async function down(knex: Knex): Promise<void> {
  // No-op — idempotent with the original migration's down
}
