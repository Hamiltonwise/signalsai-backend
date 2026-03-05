/**
 * Post Manager Service
 *
 * CRUD for posts scoped to projects.
 * Handles category/tag assignments and cache invalidation.
 */

import { db } from "../../../database/connection";
import { getRedisConnection } from "../../../workers/queues";

const POSTS_TABLE = "website_builder.posts";
const POST_TYPES_TABLE = "website_builder.post_types";
const PROJECTS_TABLE = "website_builder.projects";
const CAT_ASSIGN_TABLE = "website_builder.post_category_assignments";
const TAG_ASSIGN_TABLE = "website_builder.post_tag_assignments";
const CATEGORIES_TABLE = "website_builder.post_categories";
const TAGS_TABLE = "website_builder.post_tags";
const ATTACHMENTS_TABLE = "website_builder.post_attachments";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function invalidatePostsCache(projectId: string) {
  try {
    const redis = getRedisConnection();
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `posts:${projectId}:*`,
        "COUNT",
        100
      );
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (err) {
    console.error("[Admin Websites] Failed to invalidate posts cache:", err);
  }
}

/**
 * Enrich a post with its categories and tags
 */
async function enrichPost(post: any): Promise<any> {
  const [catRows, tagRows, attachments] = await Promise.all([
    db(CAT_ASSIGN_TABLE)
      .join(CATEGORIES_TABLE, `${CAT_ASSIGN_TABLE}.category_id`, `${CATEGORIES_TABLE}.id`)
      .where(`${CAT_ASSIGN_TABLE}.post_id`, post.id)
      .select(`${CATEGORIES_TABLE}.id`, `${CATEGORIES_TABLE}.name`, `${CATEGORIES_TABLE}.slug`),
    db(TAG_ASSIGN_TABLE)
      .join(TAGS_TABLE, `${TAG_ASSIGN_TABLE}.tag_id`, `${TAGS_TABLE}.id`)
      .where(`${TAG_ASSIGN_TABLE}.post_id`, post.id)
      .select(`${TAGS_TABLE}.id`, `${TAGS_TABLE}.name`, `${TAGS_TABLE}.slug`),
    db(ATTACHMENTS_TABLE)
      .where("post_id", post.id)
      .orderBy("order_index", "asc"),
  ]);

  return {
    ...post,
    categories: catRows,
    tags: tagRows,
    attachments,
  };
}

// ---------------------------------------------------------------------------
// List posts for a project
// ---------------------------------------------------------------------------

export async function listPosts(
  projectId: string,
  filters?: { post_type_id?: string; status?: string }
): Promise<{
  posts: any[];
  error?: { status: number; code: string; message: string };
}> {
  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) {
    return {
      posts: [],
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  let query = db(POSTS_TABLE).where("project_id", projectId);

  if (filters?.post_type_id) {
    query = query.where("post_type_id", filters.post_type_id);
  }
  if (filters?.status) {
    query = query.where("status", filters.status);
  }

  const posts = await query
    .orderBy("sort_order", "asc")
    .orderBy("created_at", "desc");

  // Enrich with categories and tags
  const enriched = await Promise.all(posts.map(enrichPost));

  return { posts: enriched };
}

// ---------------------------------------------------------------------------
// Create post
// ---------------------------------------------------------------------------

export async function createPost(
  projectId: string,
  data: {
    post_type_id: string;
    title: string;
    content?: string;
    excerpt?: string;
    featured_image?: string;
    status?: string;
    custom_fields?: Record<string, unknown>;
    category_ids?: string[];
    tag_ids?: string[];
  }
): Promise<{
  post: any;
  error?: { status: number; code: string; message: string };
}> {
  const { post_type_id, title, content, excerpt, featured_image, status, custom_fields, category_ids, tag_ids } = data;

  if (!title) {
    return {
      post: null,
      error: { status: 400, code: "INVALID_INPUT", message: "title is required" },
    };
  }

  if (!post_type_id) {
    return {
      post: null,
      error: { status: 400, code: "INVALID_INPUT", message: "post_type_id is required" },
    };
  }

  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) {
    return {
      post: null,
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  // Verify post type exists (it belongs to a template, not the project directly)
  const postType = await db(POST_TYPES_TABLE).where("id", post_type_id).first();
  if (!postType) {
    return {
      post: null,
      error: { status: 400, code: "INVALID_POST_TYPE", message: "Post type not found" },
    };
  }

  let slug = slugify(title);

  // Ensure slug uniqueness within project + post type
  const existing = await db(POSTS_TABLE)
    .where({ project_id: projectId, post_type_id, slug })
    .first();
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  console.log(`[Admin Websites] Creating post "${title}" for project ${projectId}`);

  const postStatus = status || "draft";

  const [post] = await db(POSTS_TABLE)
    .insert({
      project_id: projectId,
      post_type_id,
      title,
      slug,
      content: content || "",
      excerpt: excerpt || null,
      featured_image: featured_image || null,
      custom_fields: JSON.stringify(custom_fields || {}),
      status: postStatus,
      published_at: postStatus === "published" ? new Date() : null,
    })
    .returning("*");

  // Assign categories
  if (category_ids && category_ids.length > 0) {
    await db(CAT_ASSIGN_TABLE).insert(
      category_ids.map((cid) => ({ post_id: post.id, category_id: cid }))
    );
  }

  // Assign tags
  if (tag_ids && tag_ids.length > 0) {
    await db(TAG_ASSIGN_TABLE).insert(
      tag_ids.map((tid) => ({ post_id: post.id, tag_id: tid }))
    );
  }

  console.log(`[Admin Websites] ✓ Created post ID: ${post.id}`);

  await invalidatePostsCache(projectId);

  const enriched = await enrichPost(post);
  return { post: enriched };
}

// ---------------------------------------------------------------------------
// Get post
// ---------------------------------------------------------------------------

export async function getPost(
  projectId: string,
  postId: string
): Promise<any> {
  const post = await db(POSTS_TABLE)
    .where({ id: postId, project_id: projectId })
    .first();
  if (!post) return null;
  return enrichPost(post);
}

// ---------------------------------------------------------------------------
// Update post
// ---------------------------------------------------------------------------

export async function updatePost(
  projectId: string,
  postId: string,
  updates: Record<string, any>
): Promise<{
  post: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await db(POSTS_TABLE)
    .where({ id: postId, project_id: projectId })
    .first();
  if (!existing) {
    return {
      post: null,
      error: { status: 404, code: "NOT_FOUND", message: "Post not found" },
    };
  }

  const { category_ids, tag_ids, ...fieldUpdates } = updates;

  delete fieldUpdates.id;
  delete fieldUpdates.project_id;
  delete fieldUpdates.post_type_id;
  delete fieldUpdates.created_at;

  // Serialize custom_fields if provided
  if (fieldUpdates.custom_fields !== undefined) {
    fieldUpdates.custom_fields = JSON.stringify(fieldUpdates.custom_fields);
  }

  // Re-generate slug if title changed
  if (fieldUpdates.title && fieldUpdates.title !== existing.title) {
    fieldUpdates.slug = slugify(fieldUpdates.title);
    const conflict = await db(POSTS_TABLE)
      .where({
        project_id: projectId,
        post_type_id: existing.post_type_id,
        slug: fieldUpdates.slug,
      })
      .whereNot("id", postId)
      .first();
    if (conflict) {
      fieldUpdates.slug = `${fieldUpdates.slug}-${Date.now().toString(36).slice(-4)}`;
    }
  }

  // Handle publish timestamp
  if (fieldUpdates.status === "published" && existing.status !== "published") {
    fieldUpdates.published_at = new Date();
  }

  if (Object.keys(fieldUpdates).length > 0) {
    await db(POSTS_TABLE)
      .where({ id: postId, project_id: projectId })
      .update({ ...fieldUpdates, updated_at: db.fn.now() });
  }

  // Re-assign categories if provided
  if (category_ids !== undefined) {
    await db(CAT_ASSIGN_TABLE).where("post_id", postId).del();
    if (category_ids.length > 0) {
      await db(CAT_ASSIGN_TABLE).insert(
        category_ids.map((cid: string) => ({ post_id: postId, category_id: cid }))
      );
    }
  }

  // Re-assign tags if provided
  if (tag_ids !== undefined) {
    await db(TAG_ASSIGN_TABLE).where("post_id", postId).del();
    if (tag_ids.length > 0) {
      await db(TAG_ASSIGN_TABLE).insert(
        tag_ids.map((tid: string) => ({ post_id: postId, tag_id: tid }))
      );
    }
  }

  console.log(`[Admin Websites] ✓ Updated post ID: ${postId}`);

  await invalidatePostsCache(projectId);

  const updated = await db(POSTS_TABLE).where("id", postId).first();
  return { post: await enrichPost(updated) };
}

// ---------------------------------------------------------------------------
// Delete post
// ---------------------------------------------------------------------------

export async function deletePost(
  projectId: string,
  postId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await db(POSTS_TABLE)
    .where({ id: postId, project_id: projectId })
    .first();
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Post not found" },
    };
  }

  await db(POSTS_TABLE)
    .where({ id: postId, project_id: projectId })
    .del();

  console.log(`[Admin Websites] ✓ Deleted post ID: ${postId}`);

  await invalidatePostsCache(projectId);

  return {};
}
