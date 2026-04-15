import { BaseModel, QueryContext } from "./BaseModel";
import type { FinalStage } from "./LeadgenSessionModel";

/**
 * Event names share the same enum as `FinalStage`. Re-exporting via type alias
 * keeps a single source of truth in `LeadgenSessionModel.ts`.
 */
export type LeadgenEventName = FinalStage;

export interface ILeadgenEvent {
  id: string;
  session_id: string;
  event_name: LeadgenEventName;
  event_data: Record<string, unknown> | null;
  created_at: Date;
}

export class LeadgenEventModel extends BaseModel {
  protected static tableName = "leadgen_events";

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<ILeadgenEvent | undefined> {
    return super.findById(id, trx);
  }
}
