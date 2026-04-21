import { createHash } from "crypto";
import { db } from "../../database/connection";
import type { CollisionFetcher } from "./gates/templateCollision";
import { extractTextFragments, fingerprint, stripHtml, wordCount } from "./util";
import type { Section } from "./types";

/**
 * Template Collision Index
 *
 * Hashes every 10+ word content block across all currently-published rows in
 * website_builder.pages. Lookup is O(1) via a Map<hash, Set<projectId>>.
 *
 * Build once per process (the Site QA Agent calls build() lazily on first
 * gate evaluation). Call invalidate() after any publish writes so the next
 * run sees fresh data.
 *
 * Used by gates/templateCollision.ts via the CollisionFetcher interface.
 */

const MIN_WORDS = 10;

export interface IndexStats {
  totalBlocks: number;
  distinctHashes: number;
  projectsCovered: number;
}

class TemplateCollisionIndex {
  private map: Map<string, Set<string>> | null = null;
  private lastBuiltAt: Date | null = null;

  /**
   * Build the index from website_builder.pages where status='published'.
   * Safe to call many times; subsequent calls are no-ops unless invalidate()
   * was called.
   */
  async build(): Promise<void> {
    if (this.map) return;
    const map = new Map<string, Set<string>>();

    const rows = await db("website_builder.pages")
      .where({ status: "published" })
      .select("project_id", "sections");

    for (const row of rows) {
      let sections: Section[] = [];
      try {
        sections =
          typeof row.sections === "string"
            ? JSON.parse(row.sections)
            : row.sections ?? [];
      } catch {
        sections = [];
      }
      for (const hash of hashBlocksFromSections(sections)) {
        let set = map.get(hash);
        if (!set) {
          set = new Set<string>();
          map.set(hash, set);
        }
        set.add(String(row.project_id));
      }
    }

    this.map = map;
    this.lastBuiltAt = new Date();
  }

  invalidate(): void {
    this.map = null;
    this.lastBuiltAt = null;
  }

  stats(): IndexStats {
    if (!this.map) return { totalBlocks: 0, distinctHashes: 0, projectsCovered: 0 };
    const projects = new Set<string>();
    let totalBlocks = 0;
    for (const set of this.map.values()) {
      totalBlocks += set.size;
      for (const pid of set) projects.add(pid);
    }
    return {
      totalBlocks,
      distinctHashes: this.map.size,
      projectsCovered: projects.size,
    };
  }

  /**
   * O(1) lookup. Returns true if this normalized fingerprint exists on any
   * published page whose project_id differs from currentProjectId.
   */
  async existsElsewhere(hash: string, currentProjectId: string): Promise<boolean> {
    if (!this.map) await this.build();
    const owners = this.map!.get(hash);
    if (!owners) return false;
    if (owners.size > 1) return true;
    return !owners.has(String(currentProjectId));
  }
}

export const templateCollisionIndex = new TemplateCollisionIndex();

/**
 * CollisionFetcher adapter for gates/templateCollision.ts. Keeps the gate
 * decoupled from the DB-backed index (so unit tests can swap a fake).
 */
export const collisionFetcher: CollisionFetcher = {
  async fingerprintExistsElsewhere(hash: string, currentProjectId: string): Promise<boolean> {
    return templateCollisionIndex.existsElsewhere(hash, currentProjectId);
  },
};

/**
 * Hash every 10+ word fragment in a sections payload. Returns a flat list of
 * sha256 hashes over the normalized fingerprint. Deterministic across runs.
 */
export function hashBlocksFromSections(sections: Section[]): string[] {
  const hashes: string[] = [];
  const fragments = extractTextFragments(sections || []);
  for (const frag of fragments) {
    const plain = stripHtml(frag.text);
    if (wordCount(plain) < MIN_WORDS) continue;
    hashes.push(hashBlock(plain));
  }
  return hashes;
}

export function hashBlock(text: string): string {
  return createHash("sha256").update(fingerprint(text)).digest("hex");
}
