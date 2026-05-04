import { Knex } from "knex";
import { QueryContext } from "../BaseModel";
import { db } from "../../database/connection";
import { IReview, ReviewModel } from "./ReviewModel";

type ProjectReviewRow = {
  organization_id: number | null;
  selected_place_id: string | null;
  selected_place_ids: string[] | string | null;
};

export type ProjectReviewScope = {
  organizationId: number | null;
  locationIds: number[];
  placeIds: string[];
  hasGbpConnection: boolean;
  hasPlaceIds: boolean;
};

export type ProjectReviewStats = {
  total: number;
  average: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

export class ProjectReviewModel {
  static async getProjectScope(
    projectId: string,
    trx?: QueryContext
  ): Promise<ProjectReviewScope | null> {
    const project = await (trx || db)("website_builder.projects")
      .where("id", projectId)
      .select("organization_id", "selected_place_id", "selected_place_ids")
      .first<ProjectReviewRow>();

    if (!project) return null;

    const placeIds = normalizePlaceIds(
      project.selected_place_ids,
      project.selected_place_id
    );
    const locationIds = await this.getLocationIds(project.organization_id, trx);
    const hasGbpConnection = await this.hasGbpConnection(
      project.organization_id,
      trx
    );

    return {
      organizationId: project.organization_id,
      locationIds,
      placeIds,
      hasGbpConnection,
      hasPlaceIds: placeIds.length > 0,
    };
  }

  static async getStats(
    scope: ProjectReviewScope,
    trx?: QueryContext
  ): Promise<ProjectReviewStats> {
    const distribution: ProjectReviewStats["distribution"] = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    if (!hasReviewScope(scope)) {
      return { total: 0, average: 0, distribution };
    }

    const totals = await buildVisibleScopeQuery(scope, trx)
      .count("* as total")
      .avg("stars as average")
      .first<{ total: string | number; average: string | number | null }>();

    const rows = await buildVisibleScopeQuery(scope, trx)
      .select("stars")
      .count("* as count")
      .groupBy("stars");

    for (const row of rows as Array<{ stars: number; count: string | number }>) {
      if (row.stars >= 1 && row.stars <= 5) {
        distribution[row.stars as 1 | 2 | 3 | 4 | 5] =
          Number(row.count) || 0;
      }
    }

    return {
      total: Number(totals?.total) || 0,
      average: roundToOneDecimal(Number(totals?.average) || 0),
      distribution,
    };
  }

  static async list(
    scope: ProjectReviewScope,
    opts: {
      search?: string;
      stars?: number;
      showHidden?: boolean;
    },
    trx?: QueryContext
  ): Promise<IReview[]> {
    return ReviewModel.listForProject(
      {
        locationIds: scope.locationIds,
        placeIds: scope.placeIds,
        search: opts.search,
        stars: opts.stars,
        showHidden: opts.showHidden,
      },
      trx
    );
  }

  static async getPlaceLocationMap(
    projectId: string,
    placeIds: string[],
    trx?: QueryContext
  ): Promise<Map<string, number>> {
    const scope = await this.getProjectScope(projectId, trx);
    if (!scope?.organizationId || placeIds.length === 0) return new Map();

    const rows = await (trx || db)("google_properties as gp")
      .join("google_connections as gc", "gp.google_connection_id", "gc.id")
      .where("gc.organization_id", scope.organizationId)
      .where("gp.type", "gbp")
      .whereIn("gp.external_id", placeIds)
      .select("gp.location_id", "gp.external_id");

    const locationByPlaceId = new Map<string, number>();
    for (const row of rows as Array<{ external_id: string; location_id: number }>) {
      if (row.external_id && row.location_id) {
        locationByPlaceId.set(row.external_id, row.location_id);
      }
    }

    return locationByPlaceId;
  }

  private static async getLocationIds(
    organizationId: number | null,
    trx?: QueryContext
  ): Promise<number[]> {
    if (!organizationId) return [];

    const rows = await (trx || db)("locations")
      .where("organization_id", organizationId)
      .select("id");

    return rows.map((row: { id: number }) => row.id);
  }

  private static async hasGbpConnection(
    organizationId: number | null,
    trx?: QueryContext
  ): Promise<boolean> {
    if (!organizationId) return false;

    const row = await (trx || db)("google_properties as gp")
      .join("google_connections as gc", "gp.google_connection_id", "gc.id")
      .where("gc.organization_id", organizationId)
      .where("gp.type", "gbp")
      .where("gp.selected", true)
      .first("gp.id");

    return Boolean(row);
  }
}

function buildVisibleScopeQuery(
  scope: ProjectReviewScope,
  trx?: QueryContext
): Knex.QueryBuilder {
  const hasLocations = scope.locationIds.length > 0;
  const hasPlaces = scope.placeIds.length > 0;

  return (trx || db)("website_builder.reviews")
    .where(function () {
      if (hasLocations) this.whereIn("location_id", scope.locationIds);
      if (hasPlaces) this.orWhereIn("place_id", scope.placeIds);
    })
    .where("hidden", false)
    .whereBetween("stars", [1, 5]);
}

function hasReviewScope(scope: ProjectReviewScope): boolean {
  return scope.locationIds.length > 0 || scope.placeIds.length > 0;
}

function normalizePlaceIds(
  selectedPlaceIds: string[] | string | null,
  legacyPlaceId: string | null
): string[] {
  const ids = Array.isArray(selectedPlaceIds)
    ? selectedPlaceIds
    : typeof selectedPlaceIds === "string"
      ? selectedPlaceIds.replace(/[{}"]/g, "").split(",")
      : [];

  const normalized = ids
    .concat(legacyPlaceId ? [legacyPlaceId] : [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  return [...new Set(normalized)];
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
