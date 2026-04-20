-- F1 — multi-location columns on projects.
-- `selected_place_ids` = full set including primary. `primary_place_id` =
-- explicit primary designation (not just array order) so re-warmups can match
-- by id and preserve which location drives identity.business.
-- Keeps `selected_place_id` (singular, existing) as a backward-compat pointer
-- to the primary, written in sync with `primary_place_id`.

-- TODO: fill during execution
ALTER TABLE website_builder.projects
  ADD COLUMN IF NOT EXISTS selected_place_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_place_id TEXT;

-- Backfill: existing rows with selected_place_id get a single-element array.
UPDATE website_builder.projects
  SET selected_place_ids = ARRAY[selected_place_id],
      primary_place_id = selected_place_id
  WHERE selected_place_id IS NOT NULL
    AND selected_place_ids = '{}';

-- T8 — add source_url to posts for import-from-identity dedup.
-- Matches by (project_id, post_type_id, source_url) so re-imports skip
-- existing rows unless the admin explicitly opts into overwrite.
-- For location imports, source_url stores the place_id so dedup works uniformly.

ALTER TABLE website_builder.posts
  ADD COLUMN IF NOT EXISTS source_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_project_type_source
  ON website_builder.posts (project_id, post_type_id, source_url)
  WHERE source_url IS NOT NULL;
