/**
 * WO-7 Component 5: AEO Internal Linking (Hub-and-Spoke)
 *
 * Hub pages: one per specialty (e.g., /dentist)
 * Spoke pages: specialty-city combos (e.g., /dentist-scottsdale-az)
 *
 * Each spoke links to:
 * 1. Its hub page
 * 2. Two other spoke pages (one nearby city, one high-ICP city)
 * 3. The checkup CTA
 */

import knex from "../database/connection";
import { SPECIALTIES, CITIES, toSlug, buildPageSlug, type CityData } from "../data/cityData";

interface LinkSet {
  hubUrl: string;
  nearbyCity: string | null;
  highIcpCity: string | null;
  checkupUrl: string;
}

/**
 * Hub page definitions, one per specialty.
 */
export function getHubPages(): { slug: string; title: string }[] {
  return SPECIALTIES.map((s) => ({
    slug: s.slug,
    title: `${s.name} Market Intelligence | Alloro`,
  }));
}

/**
 * For a given spoke page, find its three internal link targets.
 * Uses state proximity for "nearby" and ICP density for "high-ICP."
 */
export function getSpokeLinks(
  specialtySlug: string,
  citySlug: string,
  stateAbbr: string
): LinkSet {
  const hubUrl = `/${specialtySlug}`;
  const checkupUrl = "/checkup";

  // Find a nearby city (same state, different city)
  const sameState = CITIES.filter(
    (c: CityData) =>
      c.stateAbbr === stateAbbr &&
      toSlug(c.city + " " + c.stateAbbr) !== citySlug
  );
  const nearbyCity =
    sameState.length > 0
      ? `/${buildPageSlug(specialtySlug, sameState[0])}`
      : null;

  // Find a high-ICP city from a different state
  const differentState = CITIES.filter(
    (c: CityData) => c.stateAbbr !== stateAbbr
  ).sort((a: CityData, b: CityData) => b.icpDensity - a.icpDensity);
  const highIcpCity =
    differentState.length > 0
      ? `/${buildPageSlug(specialtySlug, differentState[0])}`
      : null;

  return { hubUrl, nearbyCity, highIcpCity, checkupUrl };
}

/**
 * Update hub_spoke_links for all published programmatic pages.
 */
export async function updateAllSpokeLinks(): Promise<number> {
  const pages = await knex("programmatic_pages")
    .where({ status: "published" })
    .select("id", "specialty_slug", "city_slug", "state_abbr");

  let updated = 0;

  for (const page of pages) {
    const links = getSpokeLinks(
      page.specialty_slug,
      page.city_slug,
      page.state_abbr
    );

    await knex("programmatic_pages")
      .where({ id: page.id })
      .update({
        hub_spoke_links: JSON.stringify(links),
        updated_at: new Date().toISOString(),
      });

    updated++;
  }

  return updated;
}

/**
 * Generate HTML for internal links to embed in spoke pages.
 */
export function renderSpokeLinksHtml(links: LinkSet): string {
  const items: string[] = [];

  items.push(
    `<a href="${links.hubUrl}" class="internal-link hub-link">View all markets</a>`
  );

  if (links.nearbyCity) {
    items.push(
      `<a href="${links.nearbyCity}" class="internal-link nearby-link">See a nearby market</a>`
    );
  }

  if (links.highIcpCity) {
    items.push(
      `<a href="${links.highIcpCity}" class="internal-link icp-link">Compare with a top market</a>`
    );
  }

  items.push(
    `<a href="${links.checkupUrl}" class="internal-link cta-link">Run your free checkup</a>`
  );

  return `<nav class="spoke-links" aria-label="Related markets">${items.join("")}</nav>`;
}
