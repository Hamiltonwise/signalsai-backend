/**
 * Location Competitor Onboarding Service
 *
 * v2 user-curated competitor list flow. Each location moves through:
 *   pending  → (runDiscoveryForLocation populates initial scrape) →
 *   curating → (user adds/removes via the curate UI) →
 *   finalized (finalizeAndTriggerRun freezes the list and kicks off ranking)
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */

import { v4 as uuidv4 } from "uuid";
import { db } from "../../../database/connection";
import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { fetchGBPDataForRange } from "../../../utils/dataAggregation/dataAggregator";
import { LocationModel } from "../../../models/LocationModel";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { LocationCompetitorModel } from "../../../models/LocationCompetitorModel";
import { identifyLocationMeta } from "../../agents/feature-services/service.webhook-orchestrator";
import {
  discoverCompetitorsViaPlaces,
  getClientPhotosViaPlaces,
} from "./service.places-competitor-discovery";
import { getPlaceDetails } from "../../places/feature-services/GooglePlacesApiService";
import { processLocationRanking } from "./service.ranking-pipeline";
import { log, logError } from "../feature-utils/util.ranking-logger";
import { MAX_COMPETITORS_PER_LOCATION } from "../feature-utils/util.competitor-validator";

// In-flight ranking dedup window for finalize-and-run.
// If user double-clicks within this window, we return the existing batchId.
const FINALIZE_DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Re-run discovery if the latest initial_scrape entry is older than this.
const DISCOVERY_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const SEARCH_RADIUS_METERS = 40234; // 25 miles, matches ranking pipeline default

// =====================================================================
// TYPES
// =====================================================================

export interface LoadedLocationContext {
  locationId: number;
  organizationId: number;
  organizationDomain: string;
  locationName: string;
  selectedGbp: {
    google_connection_id: number;
    account_id: string | null;
    external_id: string;
    display_name: string | null;
  };
}

export interface DiscoveryResult {
  status: "fresh" | "stale_skipped" | "completed";
  competitorCount: number;
  specialty: string | null;
  marketLocation: string | null;
}

export interface FinalizeAndRunResult {
  batchId: string;
  rankingId: number;
  reused: boolean;
}

// =====================================================================
// CONTEXT LOADING
// =====================================================================

async function loadLocationContext(
  locationId: number
): Promise<LoadedLocationContext> {
  const location = await LocationModel.findById(locationId);
  if (!location) {
    throw new Error(`Location ${locationId} not found`);
  }

  const org = await db("organizations")
    .where({ id: location.organization_id })
    .select("id", "domain")
    .first();
  if (!org) {
    throw new Error(`Organization ${location.organization_id} not found`);
  }

  const gbpProperties = await GooglePropertyModel.findByLocationId(locationId);
  const selectedGbp =
    gbpProperties.find((p: any) => p.selected) || gbpProperties[0];

  if (!selectedGbp) {
    throw new Error(
      `Location ${locationId} has no Google Business Profile property linked`
    );
  }

  return {
    locationId,
    organizationId: org.id,
    organizationDomain: org.domain || "",
    locationName: location.name,
    selectedGbp: {
      google_connection_id: selectedGbp.google_connection_id,
      account_id: selectedGbp.account_id || null,
      external_id: selectedGbp.external_id,
      display_name: selectedGbp.display_name || location.name,
    },
  };
}

// =====================================================================
// IDENTIFICATION (specialty + marketLocation)
// =====================================================================

async function resolveSpecialtyAndMarket(
  ctx: LoadedLocationContext
): Promise<{ specialty: string; marketLocation: string }> {
  // Prefer values from the most recent practice_rankings row for this location
  // — same identification logic already ran there and succeeded.
  const lastRanking = await db("practice_rankings")
    .where({ location_id: ctx.locationId })
    .whereNotNull("specialty")
    .whereNotNull("location")
    .orderBy("created_at", "desc")
    .select("specialty", "location")
    .first();

  if (lastRanking?.specialty && lastRanking?.location) {
    return {
      specialty: lastRanking.specialty,
      marketLocation: lastRanking.location,
    };
  }

  // Fallback: run the Identifier Agent against fresh GBP data
  const oauth2Client = await getValidOAuth2Client(
    ctx.selectedGbp.google_connection_id
  );
  const today = new Date().toISOString().split("T")[0];
  const gbpProfile = await fetchGBPDataForRange(
    oauth2Client,
    [
      {
        accountId: ctx.selectedGbp.account_id || "",
        locationId: ctx.selectedGbp.external_id,
        displayName: ctx.selectedGbp.display_name || ctx.locationName,
      },
    ],
    today,
    today
  );
  const locationData = gbpProfile?.locations?.[0]?.data || {};
  const meta = await identifyLocationMeta(locationData, ctx.organizationDomain);
  return { specialty: meta.specialty, marketLocation: meta.marketLocation };
}

// =====================================================================
// runDiscoveryForLocation
// =====================================================================

/**
 * Populate the initial competitor list for a location. Idempotent:
 *  - If status is `finalized`, throws (use the curate UI to modify).
 *  - If active rows exist and the latest `initial_scrape` is <7 days old,
 *    returns `stale_skipped` without re-querying Places.
 *  - Otherwise: runs Places discovery (top 10), upserts into
 *    location_competitors, and flips status to `curating`.
 */
export async function runDiscoveryForLocation(
  locationId: number
): Promise<DiscoveryResult> {
  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status === "finalized") {
    throw new Error(
      `Location ${locationId} is already finalized — discovery is locked. Modify via the curate endpoints.`
    );
  }

  // Freshness check: skip if we already have a recent initial_scrape
  const latestInitial =
    await LocationCompetitorModel.findLatestInitialScrapeAt(locationId);
  if (latestInitial) {
    const ageMs = Date.now() - new Date(latestInitial).getTime();
    if (ageMs < DISCOVERY_FRESHNESS_MS) {
      const activeCount =
        await LocationCompetitorModel.countActive(locationId);
      log(
        `[ONBOARDING] [${locationId}] Discovery skipped — initial_scrape ${Math.round(
          ageMs / (60 * 60 * 1000)
        )}h old, ${activeCount} active competitors`
      );
      // Ensure status is at least 'curating' since discovery exists
      if (onboarding.status === "pending") {
        await LocationCompetitorModel.setOnboardingStatus(
          locationId,
          "curating"
        );
      }
      return {
        status: "stale_skipped",
        competitorCount: activeCount,
        specialty: null,
        marketLocation: null,
      };
    }
  }

  const ctx = await loadLocationContext(locationId);
  const { specialty, marketLocation } = await resolveSpecialtyAndMarket(ctx);

  log(
    `[ONBOARDING] [${locationId}] Running discovery for "${specialty}" in "${marketLocation}"`
  );

  // Find vantage point (client's lat/lng on Places) for location-biased search
  let locationBias:
    | { lat: number; lng: number; radiusMeters: number }
    | undefined;
  try {
    const clientLookup = await getClientPhotosViaPlaces(
      ctx.locationName,
      marketLocation
    );
    if (clientLookup.lat !== null && clientLookup.lng !== null) {
      locationBias = {
        lat: clientLookup.lat,
        lng: clientLookup.lng,
        radiusMeters: SEARCH_RADIUS_METERS,
      };
    }
  } catch (err: any) {
    log(
      `[ONBOARDING] [${locationId}] Client lookup failed: ${err.message} — continuing without location bias`
    );
  }

  // Discover top N competitors (cap matches the curated list cap so the user
  // lands on a list they can immediately work with).
  const discovered = await discoverCompetitorsViaPlaces(
    specialty,
    marketLocation,
    MAX_COMPETITORS_PER_LOCATION,
    locationBias
  );

  // Insert as initial_scrape, soft-deleting nothing — model handles revival
  // of any prior soft-deleted rows for the same place_id (rare, but defensive).
  await db.transaction(async (trx) => {
    for (const comp of discovered) {
      await LocationCompetitorModel.addCompetitor(
        locationId,
        {
          placeId: comp.placeId,
          name: comp.name,
          address: comp.address || null,
          primaryType: comp.primaryType || null,
          lat: comp.location?.lat ?? null,
          lng: comp.location?.lng ?? null,
          source: "initial_scrape",
          addedByUserId: null,
        },
        trx
      );
    }

    await LocationCompetitorModel.setOnboardingStatus(
      locationId,
      "curating",
      trx
    );
  });

  log(
    `[ONBOARDING] [${locationId}] Discovery complete: ${discovered.length} competitors → status=curating`
  );

  return {
    status: discovered.length > 0 ? "completed" : "fresh",
    competitorCount: discovered.length,
    specialty,
    marketLocation,
  };
}

// =====================================================================
// addCustomCompetitor
// =====================================================================

/**
 * Add a user-chosen competitor by Google Place ID. Enforces the cap server-side.
 * Throws if the cap is reached. Reviving a previously soft-deleted entry does
 * NOT count toward the cap until revived.
 */
export async function addCustomCompetitor(
  locationId: number,
  placeId: string,
  userId: number | null
): Promise<{ added: any; activeCount: number }> {
  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status === "finalized") {
    throw new Error(
      `Location ${locationId} is already finalized — competitor list is locked.`
    );
  }

  // Cap check before remote Places call to avoid wasted API spend
  const currentCount =
    await LocationCompetitorModel.countActive(locationId);
  // Special case: if the placeId already exists ACTIVE, treat as no-op (idempotent)
  const existingActive =
    await LocationCompetitorModel.findActiveByLocationAndPlace(
      locationId,
      placeId
    );
  if (!existingActive && currentCount >= MAX_COMPETITORS_PER_LOCATION) {
    throw Object.assign(
      new Error(
        `Competitor cap reached (${MAX_COMPETITORS_PER_LOCATION}). Remove one before adding another.`
      ),
      { code: "COMPETITOR_CAP_REACHED" }
    );
  }

  // Fetch from Places to capture name/address/coords for display
  let placeDetails: any;
  try {
    placeDetails = await getPlaceDetails(placeId);
  } catch (err: any) {
    throw Object.assign(
      new Error(`Failed to fetch place details: ${err.message}`),
      { code: "PLACES_LOOKUP_FAILED" }
    );
  }

  const name =
    placeDetails?.displayName?.text ||
    placeDetails?.name ||
    "Unknown business";
  const address = placeDetails?.formattedAddress || null;
  const primaryType = placeDetails?.primaryType || null;
  const lat = placeDetails?.location?.latitude ?? null;
  const lng = placeDetails?.location?.longitude ?? null;

  const added = await LocationCompetitorModel.addCompetitor(locationId, {
    placeId,
    name,
    address,
    primaryType,
    lat,
    lng,
    source: "user_added",
    addedByUserId: userId,
  });

  const activeCount =
    await LocationCompetitorModel.countActive(locationId);

  // Ensure status reflects active curation
  if (onboarding.status === "pending") {
    await LocationCompetitorModel.setOnboardingStatus(locationId, "curating");
  }

  log(
    `[ONBOARDING] [${locationId}] User added competitor ${placeId} (${name}) — activeCount=${activeCount}`
  );

  return { added, activeCount };
}

// =====================================================================
// removeCompetitorFromList
// =====================================================================

export async function removeCompetitorFromList(
  locationId: number,
  placeId: string
): Promise<{ activeCount: number; removed: number }> {
  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status === "finalized") {
    throw new Error(
      `Location ${locationId} is already finalized — competitor list is locked.`
    );
  }

  const removed = await LocationCompetitorModel.removeCompetitor(
    locationId,
    placeId
  );
  const activeCount =
    await LocationCompetitorModel.countActive(locationId);

  log(
    `[ONBOARDING] [${locationId}] Removed competitor ${placeId} (rowsTouched=${removed}, activeCount=${activeCount})`
  );

  return { removed, activeCount };
}

// =====================================================================
// finalizeAndTriggerRun
// =====================================================================

/**
 * Single-click finalize: locks the curated list, creates a practice_rankings
 * row tagged competitor_source='curated', and kicks off the ranking pipeline
 * asynchronously. Idempotent on rapid double-click via the in-flight check.
 */
export async function finalizeAndTriggerRun(
  locationId: number
): Promise<FinalizeAndRunResult> {
  const ctx = await loadLocationContext(locationId);

  // Idempotency: if there's an in-flight ranking for this location created
  // within the dedupe window, return its batchId/rankingId.
  const cutoff = new Date(Date.now() - FINALIZE_DEDUPE_WINDOW_MS);
  const inFlight = await db("practice_rankings")
    .where({ location_id: locationId })
    .whereIn("status", ["pending", "processing"])
    .where("created_at", ">=", cutoff)
    .orderBy("created_at", "desc")
    .first();
  if (inFlight) {
    log(
      `[ONBOARDING] [${locationId}] finalize-and-run reused in-flight rankingId=${inFlight.id} batchId=${inFlight.batch_id}`
    );
    return {
      batchId: inFlight.batch_id,
      rankingId: inFlight.id,
      reused: true,
    };
  }

  // Resolve specialty/market for the new ranking row (reused from history if available)
  let specialty: string | null = null;
  let marketLocation: string | null = null;
  try {
    const meta = await resolveSpecialtyAndMarket(ctx);
    specialty = meta.specialty;
    marketLocation = meta.marketLocation;
  } catch (err: any) {
    log(
      `[ONBOARDING] [${locationId}] specialty/market resolution failed: ${err.message} — pipeline will re-identify`
    );
  }

  const batchId = uuidv4();
  const now = new Date();

  // Flip onboarding to finalized + create ranking row in a single transaction
  const rankingId: number = await db.transaction(async (trx) => {
    await LocationCompetitorModel.setOnboardingStatus(
      locationId,
      "finalized",
      trx
    );

    const [row] = await trx("practice_rankings")
      .insert({
        organization_id: ctx.organizationId,
        location_id: locationId,
        specialty,
        location: marketLocation,
        gbp_account_id: ctx.selectedGbp.account_id,
        gbp_location_id: ctx.selectedGbp.external_id,
        gbp_location_name: ctx.selectedGbp.display_name,
        batch_id: batchId,
        observed_at: now,
        status: "pending",
        competitor_source: "curated",
        status_detail: JSON.stringify({
          currentStep: "queued",
          message: "Waiting for first run...",
          progress: 0,
          stepsCompleted: [],
          timestamps: { created_at: now.toISOString() },
        }),
        created_at: now,
        updated_at: now,
      })
      .returning("id");
    return typeof row === "object" ? row.id : row;
  });

  // Kick off the pipeline asynchronously — controller responds immediately.
  setImmediate(() => {
    processLocationRanking(
      rankingId,
      ctx.selectedGbp.google_connection_id,
      ctx.selectedGbp.account_id || "",
      ctx.selectedGbp.external_id,
      ctx.selectedGbp.display_name || ctx.locationName,
      specialty || "",
      marketLocation || "",
      ctx.organizationDomain,
      batchId,
      log
    ).catch((err: any) => {
      logError(
        `[ONBOARDING] [${locationId}] processLocationRanking failed for ranking ${rankingId}`,
        err
      );
    });
  });

  log(
    `[ONBOARDING] [${locationId}] Finalized and triggered run: rankingId=${rankingId} batchId=${batchId}`
  );

  return { batchId, rankingId, reused: false };
}
