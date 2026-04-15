import { BaseModel, QueryContext } from "./BaseModel";

/**
 * Funnel stages for the leadgen audit tool. Ordered roughly by user progress;
 * see `STAGE_ORDER` below for the numeric ordinal used by the never-downgrade
 * logic in the tracking controller.
 *
 * Shared with `LeadgenEventName` in `LeadgenEventModel.ts` — every event name
 * matches a possible `final_stage` value.
 */
export type FinalStage =
  | "landed"
  | "input_started"
  | "input_submitted"
  | "audit_started"
  | "stage_viewed_1"
  | "stage_viewed_2"
  | "stage_viewed_3"
  | "stage_viewed_4"
  | "stage_viewed_5"
  | "results_viewed"
  | "report_engaged_1min"
  | "email_gate_shown"
  | "email_submitted"
  | "account_created"
  | "abandoned";

/**
 * Ordinal map used by the controller's never-downgrade logic. A session's
 * `final_stage` only advances to `incoming` when `STAGE_ORDER[incoming] >
 * STAGE_ORDER[current]`.
 *
 * `abandoned` is pinned at 99 so it never "downgrades" a more-progressed
 * funnel position — a user who hit `results_viewed` and then closed the tab
 * stays at `results_viewed`, not `abandoned`.
 */
export const STAGE_ORDER: Record<FinalStage, number> = {
  landed: 0,
  input_started: 1,
  input_submitted: 2,
  audit_started: 3,
  stage_viewed_1: 4,
  stage_viewed_2: 5,
  stage_viewed_3: 6,
  stage_viewed_4: 7,
  stage_viewed_5: 8,
  results_viewed: 9,
  report_engaged_1min: 10,
  email_gate_shown: 11,
  email_submitted: 12,
  account_created: 13,
  abandoned: 99,
};

/**
 * Convenience accessor for `STAGE_ORDER`. Used by the cumulative-funnel
 * aggregator (T1) and the account-linking service (T6) to avoid repeatedly
 * keying into the ordinal map.
 */
export function stageOrdinal(stage: FinalStage): number {
  return STAGE_ORDER[stage];
}

export interface ILeadgenSession {
  id: string;
  audit_id: string | null;
  email: string | null;
  domain: string | null;
  practice_search_string: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  user_agent: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  user_id: number | null;
  converted_at: Date | null;
  final_stage: FinalStage;
  completed: boolean;
  abandoned: boolean;
  first_seen_at: Date;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

export class LeadgenSessionModel extends BaseModel {
  protected static tableName = "leadgen_sessions";

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<ILeadgenSession | undefined> {
    return super.findById(id, trx);
  }

  static async updateById(
    id: string,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data, trx);
  }
}
