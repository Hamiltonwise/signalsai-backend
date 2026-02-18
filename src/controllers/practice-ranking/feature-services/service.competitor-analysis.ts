/**
 * Competitor Analysis Service
 *
 * Handles competitor cache operations for practice ranking.
 * Wraps the dynamic import of competitorCache to keep the
 * controller layer clean.
 */

import { log } from "../feature-utils/util.ranking-logger";

/**
 * Invalidate cached competitors for a specialty+location combination.
 * Uses dynamic require to match the original route file behavior.
 */
export async function invalidateCache(
  specialty: string,
  location: string,
): Promise<boolean> {
  const { invalidateCache: invalidate } = require("./service.competitor-cache");
  const wasInvalidated = await invalidate(specialty, location);
  log(
    `Invalidated competitor cache for ${specialty} in ${location}: ${wasInvalidated}`,
  );
  return wasInvalidated;
}
