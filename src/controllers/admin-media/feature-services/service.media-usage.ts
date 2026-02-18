/**
 * Media Usage Service
 *
 * Tracks which pages reference a given media URL by scanning
 * page section content. Used by delete (usage check) and list
 * (usage count per item).
 *
 * Performance note: O(n*m) where n=media items, m=pages.
 * Preserves existing behavior; optimization deferred to separate plan.
 */

import { PageModel } from "../../../models/website-builder/PageModel";

/**
 * Find pages that reference a specific media S3 URL.
 * Scans all page sections for the URL string.
 *
 * Returns array of page paths that contain the URL.
 */
export async function findUsageByUrl(
  projectId: string,
  s3Url: string
): Promise<string[]> {
  const pages = await PageModel.findByProjectWithFields(projectId, [
    "path",
    "sections",
  ]);

  const usedInPages: string[] = [];

  for (const page of pages) {
    const sectionsArray = Array.isArray(page.sections)
      ? page.sections
      : (page.sections as any)?.sections || [];

    for (const section of sectionsArray) {
      if ((section as any).content?.includes(s3Url)) {
        usedInPages.push(page.path as string);
        break; // Don't double-count same page
      }
    }
  }

  return usedInPages;
}
