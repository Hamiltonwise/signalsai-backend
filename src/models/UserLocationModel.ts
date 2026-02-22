import { Knex } from "knex";
import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export interface IUserLocation {
  user_id: number;
  location_id: number;
  created_at: Date;
}

export class UserLocationModel extends BaseModel {
  protected static tableName = "user_locations";

  static async findByUserId(
    userId: number,
    trx?: QueryContext
  ): Promise<IUserLocation[]> {
    return this.table(trx).where({ user_id: userId });
  }

  static async findByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<IUserLocation[]> {
    return this.table(trx).where({ location_id: locationId });
  }

  static async hasAccess(
    userId: number,
    locationId: number,
    trx?: QueryContext
  ): Promise<boolean> {
    const row = await this.table(trx)
      .where({ user_id: userId, location_id: locationId })
      .first();
    return !!row;
  }

  static async getLocationIdsForUser(
    userId: number,
    trx?: QueryContext
  ): Promise<number[]> {
    const rows = await this.table(trx)
      .where({ user_id: userId })
      .select("location_id");
    return rows.map((r: IUserLocation) => r.location_id);
  }

  static async setLocationsForUser(
    userId: number,
    locationIds: number[],
    trx?: QueryContext
  ): Promise<void> {
    const ctx = trx || db;
    await (ctx as Knex)("user_locations").where({ user_id: userId }).del();
    if (locationIds.length > 0) {
      const rows = locationIds.map((locationId) => ({
        user_id: userId,
        location_id: locationId,
        created_at: new Date(),
      }));
      await (ctx as Knex)("user_locations").insert(rows);
    }
  }

  static async addLocationForUser(
    userId: number,
    locationId: number,
    trx?: QueryContext
  ): Promise<void> {
    const exists = await this.hasAccess(userId, locationId, trx);
    if (!exists) {
      await this.table(trx).insert({
        user_id: userId,
        location_id: locationId,
        created_at: new Date(),
      });
    }
  }

  static async removeLocationForUser(
    userId: number,
    locationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ user_id: userId, location_id: locationId })
      .del();
  }
}
