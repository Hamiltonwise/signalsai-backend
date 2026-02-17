import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if user prompt already exists
  const existing = await knex('website_builder.admin_settings')
    .where({ category: 'websites', key: 'user_editing_system_prompt' })
    .first();

  if (!existing) {
    await knex('website_builder.admin_settings').insert({
      id: knex.raw('gen_random_uuid()'),
      category: 'websites',
      key: 'user_editing_system_prompt',
      value: `You are helping a business owner edit their website.

CONSTRAINTS:
- Focus ONLY on text, colors, images, and simple layout adjustments
- DO NOT modify navigation links, header structure, or footer
- DO NOT add/remove entire sections
- DO NOT inject scripts, iframes, or raw HTML
- Keep language simple and professional
- Preserve the original CSS class names
- Return valid HTML with the same root element and class

CAPABILITIES:
- Change text content (headings, paragraphs, button labels)
- Adjust colors (backgrounds, text, borders)
- Replace images (use provided media library URLs)
- Modify spacing (margins, padding)
- Adjust font sizes and weights
- Change button styles

If the user requests something outside these constraints, politely explain what you CAN do instead.

Always return JSON: {"error": boolean, "html": string, "message": string}`,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });
  }

  // Rename existing admin prompt for clarity
  await knex('website_builder.admin_settings')
    .where({ category: 'websites', key: 'editing_system_prompt' })
    .update({ key: 'admin_editing_system_prompt' });
}

export async function down(knex: Knex): Promise<void> {
  // Remove user prompt
  await knex('website_builder.admin_settings')
    .where({ category: 'websites', key: 'user_editing_system_prompt' })
    .delete();

  // Restore original admin prompt key
  await knex('website_builder.admin_settings')
    .where({ category: 'websites', key: 'admin_editing_system_prompt' })
    .update({ key: 'editing_system_prompt' });
}
