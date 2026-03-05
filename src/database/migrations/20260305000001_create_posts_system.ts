import type { Knex } from "knex";

/**
 * Create the full Alloro Posts system:
 * - post_types (per template)
 * - post_categories (per post type, hierarchical)
 * - post_tags (per post type)
 * - posts (per project)
 * - post_category_assignments (junction)
 * - post_tag_assignments (junction)
 * - post_attachments (per post)
 * - post_blocks (per template, linked to post type)
 */

export async function up(knex: Knex): Promise<void> {
  // 1. Post Types
  await knex.raw(`
    CREATE TABLE website_builder.post_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES website_builder.templates(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      description TEXT,
      schema JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(template_id, slug)
    );
    CREATE INDEX idx_post_types_template_id ON website_builder.post_types(template_id);
  `);

  // 2. Post Categories (hierarchical via parent_id)
  await knex.raw(`
    CREATE TABLE website_builder.post_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_type_id UUID NOT NULL REFERENCES website_builder.post_types(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      description TEXT,
      parent_id UUID REFERENCES website_builder.post_categories(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(post_type_id, slug)
    );
    CREATE INDEX idx_post_categories_post_type_id ON website_builder.post_categories(post_type_id);
    CREATE INDEX idx_post_categories_parent_id ON website_builder.post_categories(parent_id);
  `);

  // 3. Post Tags
  await knex.raw(`
    CREATE TABLE website_builder.post_tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_type_id UUID NOT NULL REFERENCES website_builder.post_types(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(post_type_id, slug)
    );
    CREATE INDEX idx_post_tags_post_type_id ON website_builder.post_tags(post_type_id);
  `);

  // 4. Posts
  await knex.raw(`
    CREATE TABLE website_builder.posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      post_type_id UUID NOT NULL REFERENCES website_builder.post_types(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      slug VARCHAR(500) NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      excerpt VARCHAR(1000),
      featured_image TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_id, post_type_id, slug)
    );
    CREATE INDEX idx_posts_project_id ON website_builder.posts(project_id);
    CREATE INDEX idx_posts_post_type_id ON website_builder.posts(post_type_id);
    CREATE INDEX idx_posts_status ON website_builder.posts(status);
    CREATE INDEX idx_posts_project_type_status ON website_builder.posts(project_id, post_type_id, status);
  `);

  // 5. Post Category Assignments
  await knex.raw(`
    CREATE TABLE website_builder.post_category_assignments (
      post_id UUID NOT NULL REFERENCES website_builder.posts(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES website_builder.post_categories(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, category_id)
    );
    CREATE INDEX idx_post_cat_assign_category ON website_builder.post_category_assignments(category_id);
  `);

  // 6. Post Tag Assignments
  await knex.raw(`
    CREATE TABLE website_builder.post_tag_assignments (
      post_id UUID NOT NULL REFERENCES website_builder.posts(id) ON DELETE CASCADE,
      tag_id UUID NOT NULL REFERENCES website_builder.post_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, tag_id)
    );
    CREATE INDEX idx_post_tag_assign_tag ON website_builder.post_tag_assignments(tag_id);
  `);

  // 7. Post Attachments
  await knex.raw(`
    CREATE TABLE website_builder.post_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID NOT NULL REFERENCES website_builder.posts(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      filename VARCHAR(500) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size INTEGER,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_post_attachments_post_id ON website_builder.post_attachments(post_id);
  `);

  // 8. Post Blocks
  await knex.raw(`
    CREATE TABLE website_builder.post_blocks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES website_builder.templates(id) ON DELETE CASCADE,
      post_type_id UUID NOT NULL REFERENCES website_builder.post_types(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      description TEXT,
      sections JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(template_id, slug)
    );
    CREATE INDEX idx_post_blocks_template_id ON website_builder.post_blocks(template_id);
    CREATE INDEX idx_post_blocks_post_type_id ON website_builder.post_blocks(post_type_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.post_blocks CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS website_builder.post_attachments CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS website_builder.post_tag_assignments CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS website_builder.post_category_assignments CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS website_builder.posts CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS website_builder.post_tags CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS website_builder.post_categories CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS website_builder.post_types CASCADE`);
}
