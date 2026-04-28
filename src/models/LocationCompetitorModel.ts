import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";
import type { LocationCompetitorOnboardingStatus } from "./LocationModel";

export type { LocationCompetitorOnboardingStatus };
export type LocationCompetitorSource = "initial_scrape" | "user_added";

export interface ILocationCompetitor {
  id: number;
  location_id: number;
  place_id: string;
  name: string;
  address: string | null;
  primary_type: string | null;
  rating: number | null;
  review_count: number | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  photo_name: string | null;
  source: LocationCompetitorSource;
  added_at: Date;
  added_by_user_id: number | null;
  removed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AddCompetitorInput {
  placeId: string;
  name: string;
  address?: string | null;
  primaryType?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  website?: string | null;
  photoName?: string | null;
  source: LocationCompetitorSource;
  addedByUserId?: number | null;
}

export interface OnboardingStatusResult {
  status: LocationCompetitorOnboardingStatus;
  finalizedAt: Date | null;
}

export class LocationCompetitorModel extends BaseModel {
  protected static tableName = "location_competitors";
  protected static jsonFields: string[] = [];

  static async findActiveByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<ILocationCompetitor[]> {
    return this.table(trx)
      .where({ location_id: locationId })
      .whereNull("removed_at")
      .orderBy("added_at", "asc");
  }

  static async findIncludingRemoved(
    locationId: number,
    trx?: QueryContext
  ): Promise<ILocationCompetitor[]> {
    return this.table(trx)
      .where({ location_id: locationId })
      .orderBy("added_at", "asc");
  }

  static async findActiveByLocationAndPlace(
    locationId: number,
    placeId: string,
    trx?: QueryContext
  ): Promise<ILocationCompetitor | undefined> {
    return this.table(trx)
      .where({ location_id: locationId, place_id: placeId })
      .whereNull("removed_at")
      .first();
  }

  /**
   * Find any row (active or soft-deleted) for this (location, place_id) pair.
   * Used by `addCompetitor` to revive a soft-deleted entry rather than insert
   * a duplicate row (the partial unique index would block re-add otherwise).
   */
  static async findAnyByLocationAndPlace(
    locationId: number,
    placeId: string,
    trx?: QueryContext
  ): Promise<ILocationCompetitor | undefined> {
    return this.table(trx)
      .where({ location_id: locationId, place_id: placeId })
      .orderBy("id", "desc")
      .first();
  }

  /**
   * Add a competitor to a location. If a soft-deleted row exists for the same
   * (location, place_id) pair, revive it (clear removed_at, refresh metadata
   * and `added_at`, update `source` to user_added if the user is re-adding).
   * Otherwise, insert a new row.
   */
  static async addCompetitor(
    locationId: number,
    input: AddCompetitorInput,
    trx?: QueryContext
  ): Promise<ILocationCompetitor> {
    const existing = await this.findAnyByLocationAndPlace(
      locationId,
      input.placeId,
      trx
    );

    const now = new Date();

    if (existing) {
      const wasRemoved = existing.removed_at !== null;
      await this.table(trx)
        .where({ id: existing.id })
        .update({
          name: input.name,
          address: input.address ?? existing.address,
          primary_type: input.primaryType ?? existing.primary_type,
          rating: input.rating ?? existing.rating,
          review_count: input.reviewCount ?? existing.review_count,
          lat: input.lat ?? existing.lat,
          lng: input.lng ?? existing.lng,
          phone: input.phone ?? existing.phone,
          website: input.website ?? existing.website,
          photo_name: input.photoName ?? existing.photo_name,
          // If user is re-adding, mark it as user_added so the audit trail
          // reflects intent. If still active, keep original source.
          source: wasRemoved ? input.source : existing.source,
          added_at: wasRemoved ? now : existing.added_at,
          added_by_user_id: wasRemoved
            ? input.addedByUserId ?? null
            : existing.added_by_user_id,
          removed_at: null,
          updated_at: now,
        });
      const updated = await this.table(trx)
        .where({ id: existing.id })
        .first();
      return updated as ILocationCompetitor;
    }

    const [row] = await this.table(trx)
      .insert({
        location_id: locationId,
        place_id: input.placeId,
        name: input.name,
        address: input.address ?? null,
        primary_type: input.primaryType ?? null,
        rating: input.rating ?? null,
        review_count: input.reviewCount ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        phone: input.phone ?? null,
        website: input.website ?? null,
        photo_name: input.photoName ?? null,
        source: input.source,
        added_at: now,
        added_by_user_id: input.addedByUserId ?? null,
        removed_at: null,
        created_at: now,
        updated_at: now,
      })
      .returning("*");

    return row as ILocationCompetitor;
  }

  /**
   * Soft-delete a competitor. No-op if already removed or not found.
   */
  static async removeCompetitor(
    locationId: number,
    placeId: string,
    trx?: QueryContext
  ): Promise<number> {
    const now = new Date();
    return this.table(trx)
      .where({ location_id: locationId, place_id: placeId })
      .whereNull("removed_at")
      .update({ removed_at: now, updated_at: now });
  }

  static async countActive(
    locationId: number,
    trx?: QueryContext
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ location_id: locationId })
      .whereNull("removed_at")
      .count("* as count")
      .first();
    return parseInt((result?.count as string) ?? "0", 10) || 0;
  }

  static async getOnboardingStatus(
    locationId: number,
    trx?: QueryContext
  ): Promise<OnboardingStatusResult> {
    const row = await (trx || db)("locations")
      .where({ id: locationId })
      .select(
        "location_competitor_onboarding_status as status",
        "location_competitor_onboarding_finalized_at as finalizedAt"
      )
      .first();
    return {
      status: (row?.status as LocationCompetitorOnboardingStatus) ?? "pending",
      finalizedAt: row?.finalizedAt ?? null,
    };
  }

  static async setOnboardingStatus(
    locationId: number,
    status: LocationCompetitorOnboardingStatus,
    trx?: QueryContext
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      location_competitor_onboarding_status: status,
      updated_at: new Date(),
    };
    if (status === "finalized") {
      updateData.location_competitor_onboarding_finalized_at = new Date();
    }
    await (trx || db)("locations").where({ id: locationId }).update(updateData);
  }

  /**
   * Find the most recent `initial_scrape` entry for a location. Used to
   * decide whether discovery should re-run (>7 days stale = redo).
   */
  static async findLatestInitialScrapeAt(
    locationId: number,
    trx?: QueryContext
  ): Promise<Date | null> {
    const row = await this.table(trx)
      .where({ location_id: locationId, source: "initial_scrape" })
      .orderBy("added_at", "desc")
      .first();
    return row?.added_at ?? null;
  }
}
