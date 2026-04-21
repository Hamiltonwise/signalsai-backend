import { createHash } from "crypto";
import { db } from "../../database/connection";
import type { CollisionFetcher } from "./gates/templateCollision";
import { extractTextFragments, fingerprint, stripHtml, wordCount } from "./util";

const MIN_WORDS = 10;

let cache: Map<string, Set<string>> | null = null; // hash -> Set(projectId)

async function buildCache(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const rows = await db("website_builder.pages")
    .where({ status: "published" })
    .select("project_id", "sections");

  for (const row of rows) {
    let sections: any[] = [];
    try {
      sections =
        typeof row.sections === "string" ? JSON.parse(row.sections) : row.sections ?? [];
    } catch {
      sections = [];
    }
    const fragments = extractTextFragments(sections || []);
    for (const frag of fragments) {
      const plain = stripHtml(frag.text);
      if (wordCount(plain) < MIN_WORDS) continue;
      const hash = createHash("sha256").update(fingerprint(plain)).digest("hex");
      let set = map.get(hash);
      if (!set) {
        set = new Set<string>();
        map.set(hash, set);
      }
      set.add(String(row.project_id));
    }
  }
  return map;
}

/**
 * Production fetcher. Scans every published page once and caches a
 * fingerprint -> Set<projectId> map for the duration of the process.
 * Call invalidateCollisionCache() after publish events to refresh.
 */
export const dbCollisionFetcher: CollisionFetcher = {
  async fingerprintExistsElsewhere(hash: string, currentProjectId: string): Promise<boolean> {
    if (!cache) cache = await buildCache();
    const owners = cache.get(hash);
    if (!owners) return false;
    if (owners.size > 1) return true;
    return !owners.has(String(currentProjectId));
  },
};

export function invalidateCollisionCache(): void {
  cache = null;
}
