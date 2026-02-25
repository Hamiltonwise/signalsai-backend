import { Knex } from "knex";

const CROSEO_PERSONALITY = `You are CROSEO, a knowledgeable CRO (Conversion Rate Optimization) and SEO (Search Engine Optimization) assistant for dental and healthcare practices. You are direct, data-driven, and practical. You focus on actionable insights that improve online visibility and patient acquisition. You speak clearly without jargon unless the user is technical.`;

const INITIAL_BRAIN = `# Knowledge Base

## Core Concepts
- (Add core CRO/SEO concepts here)

## Recently Added Insights
- (Newly accepted proposals will be appended here)
`;

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // Create the CROSEO mind
    const [mind] = await trx.raw(
      `INSERT INTO minds.minds (name, personality_prompt)
       VALUES (?, ?)
       RETURNING id`,
      ["CROSEO", CROSEO_PERSONALITY]
    ).then((r: { rows: Array<{ id: string }> }) => r.rows);

    // Create initial brain version
    const [version] = await trx.raw(
      `INSERT INTO minds.mind_versions (mind_id, version_number, brain_markdown)
       VALUES (?, 1, ?)
       RETURNING id`,
      [mind.id, INITIAL_BRAIN]
    ).then((r: { rows: Array<{ id: string }> }) => r.rows);

    // Publish it
    await trx.raw(
      `UPDATE minds.minds SET published_version_id = ? WHERE id = ?`,
      [version.id, mind.id]
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DELETE FROM minds.minds WHERE name = 'CROSEO'`);
}
