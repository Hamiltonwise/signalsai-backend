import { createHash } from "crypto";
import type { GateResult, SiteQaContext, Defect } from "../types";
import { extractTextFragments, stripHtml, wordCount, fingerprint } from "../util";

/**
 * A span is any text fragment with 10 or more words. Identical spans across
 * two different projects indicate template-collision: the copy could not
 * possibly be specific to this practice.
 */
const MIN_WORDS = 10;

export interface CollisionFetcher {
  /**
   * Look up whether this normalized fingerprint exists on another live page
   * (any project_id !== current). Implementations should query
   * website_builder.pages.sections in production; tests pass a fake.
   */
  fingerprintExistsElsewhere(
    hash: string,
    currentProjectId: string
  ): Promise<boolean>;
}

export async function runTemplateCollisionGate(
  ctx: SiteQaContext,
  fetcher?: CollisionFetcher
): Promise<GateResult> {
  const defects: Defect[] = [];
  if (!fetcher) {
    return {
      gate: "templateCollision",
      passed: true,
      defects,
      reasoning: "No collision fetcher supplied; gate skipped in this run.",
    };
  }

  const fragments = extractTextFragments(ctx.sections);
  const seenHashes = new Set<string>();

  for (const frag of fragments) {
    const plain = stripHtml(frag.text);
    if (wordCount(plain) < MIN_WORDS) continue;

    const normalized = fingerprint(plain);
    const hash = createHash("sha256").update(normalized).digest("hex");
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    const collides = await fetcher.fingerprintExistsElsewhere(hash, ctx.projectId);
    if (collides) {
      defects.push({
        gate: "templateCollision",
        severity: "blocker",
        message: "Copy appears verbatim on another live Alloro site (template collision)",
        evidence: {
          text: plain.slice(0, 240),
          sectionIndex: frag.sectionIndex,
          sectionType: frag.sectionType,
          field: frag.field,
          pagePath: ctx.pagePath,
        },
      });
    }
  }

  return {
    gate: "templateCollision",
    passed: defects.length === 0,
    defects,
  };
}
