/**
 * Back-compat shim. The O(1) collision index now lives in
 * ./templateCollisionIndex.ts. This file re-exports the fetcher and
 * invalidation hook so older call sites keep working.
 */

export {
  collisionFetcher as dbCollisionFetcher,
  templateCollisionIndex,
} from "./templateCollisionIndex";

import { templateCollisionIndex } from "./templateCollisionIndex";

export function invalidateCollisionCache(): void {
  templateCollisionIndex.invalidate();
}
