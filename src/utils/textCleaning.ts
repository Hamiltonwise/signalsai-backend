/**
 * Text cleaning utilities for customer-facing output.
 *
 * Applied at write time (when storing to DB) so every downstream
 * consumer gets clean data. Hiro's Principle: fix the system, not the instance.
 */

/**
 * Clean competitor name: strip trailing parenthetical location info.
 * Google Places sometimes appends city/neighborhood to business names,
 * e.g. "Sakowitz Smiles Orthodontics Hamlin (Winter Garden)"
 *
 * Only strips the LAST parenthetical to preserve legitimate parts like "(DDS)".
 */
export function cleanCompetitorName(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
