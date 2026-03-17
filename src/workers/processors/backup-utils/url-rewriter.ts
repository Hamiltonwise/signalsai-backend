/**
 * URL Rewriter for Website Backup Restore
 *
 * During restore, media files get new S3 keys (new UUID prefix).
 * All references to old S3 URLs in pages, posts, and other content
 * must be rewritten to point to the new locations.
 *
 * This is safe because S3 URLs contain UUIDs, making false-positive
 * replacements impossible.
 */

export interface UrlMapping {
  oldUrl: string;
  newUrl: string;
}

/**
 * Build a URL rewrite map from old media records and their new S3 URLs.
 * Includes both main file URLs and thumbnail URLs.
 */
export function buildUrlRewriteMap(
  mappings: Array<{
    old_s3_url: string;
    new_s3_url: string;
    old_thumbnail_s3_url: string | null;
    new_thumbnail_s3_url: string | null;
  }>
): Map<string, string> {
  const urlMap = new Map<string, string>();

  for (const m of mappings) {
    urlMap.set(m.old_s3_url, m.new_s3_url);
    if (m.old_thumbnail_s3_url && m.new_thumbnail_s3_url) {
      urlMap.set(m.old_thumbnail_s3_url, m.new_thumbnail_s3_url);
    }
  }

  return urlMap;
}

/**
 * Replace all old URLs with new URLs in a string.
 * Single-pass iteration over the map entries.
 */
export function rewriteUrls(
  input: string,
  urlMap: Map<string, string>
): string {
  let result = input;
  for (const [oldUrl, newUrl] of urlMap) {
    result = result.split(oldUrl).join(newUrl);
  }
  return result;
}

/**
 * Rewrite S3 URLs in page sections JSONB.
 * Sections are [{name, content}] where content is HTML with embedded S3 URLs.
 */
export function rewriteSections(
  sections: Array<{ name: string; content: string }>,
  urlMap: Map<string, string>
): Array<{ name: string; content: string }> {
  if (!sections || sections.length === 0) return sections;

  const serialized = JSON.stringify(sections);
  const rewritten = rewriteUrls(serialized, urlMap);
  return JSON.parse(rewritten);
}

/**
 * Rewrite S3 URLs in a post record's content fields.
 * Mutates and returns the post data object.
 */
export function rewritePostFields(
  post: {
    content: string;
    featured_image: string | null;
    custom_fields: Record<string, unknown> | null;
  },
  urlMap: Map<string, string>
): typeof post {
  if (post.content) {
    post.content = rewriteUrls(post.content, urlMap);
  }

  if (post.featured_image) {
    post.featured_image = rewriteUrls(post.featured_image, urlMap);
  }

  if (post.custom_fields) {
    const serialized = JSON.stringify(post.custom_fields);
    post.custom_fields = JSON.parse(rewriteUrls(serialized, urlMap));
  }

  return post;
}

/**
 * Rewrite S3 URLs in header/footer code snippets.
 */
export function rewriteCodeSnippet(
  code: string,
  urlMap: Map<string, string>
): string {
  return rewriteUrls(code, urlMap);
}
