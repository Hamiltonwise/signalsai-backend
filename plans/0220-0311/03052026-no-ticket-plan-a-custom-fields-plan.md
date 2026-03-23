# Plan A: Custom Fields for Post Types

## Problem Statement

Post types currently have a fixed set of fields (title, content, excerpt, featured_image). Users need the ability to define custom fields per post type (e.g., "Price", "Rating", "Service Duration") that can be used in post blocks via `{{post.custom.<field>}}` tokens.

## Context Summary

- `post_types.schema` JSONB column already exists, defaults to `[]`, completely unused
- `posts` table has no `custom_fields` column — needs migration
- PostTypeModel has `jsonFields = ["schema"]` — serialization already handled
- PostBlocksTab creates post types with just a name — no schema editor
- PostsTab renders a fixed form — no dynamic fields
- Shortcode renderer only handles known `{{post.*}}` tokens

## Existing Patterns to Follow

- JSONB columns with `jsonFields` array in models for auto-serialization
- Service pattern: `{ data, error? }` returns
- Frontend API: raw `fetch`, throw on error
- UI: inline forms, ActionButton component, Loader2 for loading states

## Proposed Approach

### 1. Database Migration

Add `custom_fields` JSONB column to `posts` table:

```sql
ALTER TABLE website_builder.posts ADD COLUMN custom_fields JSONB NOT NULL DEFAULT '{}';
```

No changes to `post_types` table — `schema` column already exists.

### 2. Schema Format Definition

The `post_types.schema` array defines available custom fields:

```json
[
  {
    "name": "Price",
    "slug": "price",
    "type": "number",
    "required": false,
    "default_value": null
  },
  {
    "name": "Service Duration",
    "slug": "service_duration",
    "type": "text",
    "required": false,
    "default_value": null
  },
  {
    "name": "Featured",
    "slug": "featured",
    "type": "boolean",
    "required": false,
    "default_value": false
  },
  {
    "name": "Category Style",
    "slug": "category_style",
    "type": "select",
    "required": false,
    "default_value": null,
    "options": ["minimal", "card", "full-width"]
  }
]
```

**Supported types:** `text`, `textarea`, `media_url`, `number`, `date`, `boolean`, `select`

**Slug rules:** auto-generated from name, lowercase, underscores, unique within post type schema.

### 3. Backend Changes

**PostTypeModel** — no changes needed (schema already typed as `Record<string, unknown>[]`)

**service.post-type-manager.ts:**
- Update `createPostType` to accept optional `schema` array
- Update `updatePostType` to accept `schema` updates
- Add schema validation: check field names unique, slugs valid, types in allowed list, select type requires options array

**PostModel** — add `custom_fields` to interface as `Record<string, unknown>`

**service.post-manager.ts:**
- Update `createPost` and `updatePost` to accept `custom_fields`
- Validate `custom_fields` against post type's schema:
  - Only allow fields defined in schema
  - Type-check values (number is number, boolean is boolean, etc.)
  - Check required fields are present
  - Strip unknown fields silently

### 4. API Layer Changes

**Frontend `posts.ts`:**
- Add `schema` to `createPostType` and `updatePostType` payload types
- Add `custom_fields` to `createPost` and `updatePost` payload types
- Add `custom_fields` to `Post` interface

### 5. Shortcode Token Support

**shortcodes.ts:**
- Add `{{post.custom.<slug>}}` token pattern
- New regex: `/\{\{post\.custom\.([a-z_]+)\}\}/g`
- All custom field values HTML-escaped (same as other non-content tokens)
- Media URL fields: no special treatment (just outputs the URL string)

**postblock.service.ts:**
- Pass `custom_fields` object to `renderPostBlockHtml`
- Update `renderPostBlockHtml` to replace `{{post.custom.*}}` tokens from the custom_fields object
- Missing field = empty string (no error)

### 6. UI: Schema Editor (PostBlocksTab)

Add a schema editor section when a post type is selected/expanded:

- List existing custom fields with name, type, required badge
- "Add Field" button opens inline form: name input, type dropdown, required checkbox
- For `select` type: show options input (comma-separated)
- Auto-generate slug from name
- Save button calls `updatePostType` with updated schema
- Delete field button (with confirmation if posts already use it)

### 7. UI: Dynamic Form Fields (PostsTab)

When creating/editing a post:
- After the standard fields (title, content, excerpt, etc.), render custom fields based on the post type's schema
- Field type mapping:
  - `text` → `<input type="text">`
  - `textarea` → `<textarea>`
  - `media_url` → `<input type="text">` with label hint "Image/file URL"
  - `number` → `<input type="number">`
  - `date` → `<input type="date">`
  - `boolean` → checkbox
  - `select` → `<select>` with options from schema
- Required fields show asterisk
- Values stored in post's `custom_fields` JSONB

### 8. Token Reference Update

Update PostBlocksTab token reference bar to mention custom fields:
```
{{post.custom.<field_slug>}}
```

Update documentation page with custom fields section.

## Risk Analysis

- **Level 1**: Migration adds a nullable column — zero risk to existing data
- **Level 2**: Schema validation must be strict on save but lenient on read (posts created before schema change shouldn't break)
- **Level 1**: Custom field tokens use same escaping pattern — no new attack surface

## Definition of Done

- [x] Migration adds `custom_fields` JSONB to posts table
- [x] Schema validation on post type create/update
- [x] Custom fields accepted on post create/update (JSON.stringify)
- [x] `{{post.custom.<slug>}}` tokens work in post blocks
- [x] Schema editor UI in PostBlocksTab
- [x] Dynamic form fields in PostsTab
- [x] Token reference and documentation updated
- [x] Missing custom field tokens render as empty string

## Execution Order

1. Migration file
2. Backend model + service updates
3. Shortcode + renderer updates
4. Frontend API updates
5. PostBlocksTab schema editor UI
6. PostsTab dynamic form fields
7. Documentation updates
