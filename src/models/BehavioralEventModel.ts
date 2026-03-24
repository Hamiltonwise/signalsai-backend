import { db } from "../database/connection";

export interface IBehavioralEvent {
  id: string;
  event_type: string;
  org_id: number | null;
  session_id: string | null;
  properties: Record<string, unknown>;
  created_at: Date;
}

export class BehavioralEventModel {
  static async create(data: {
    event_type: string;
    org_id?: number | null;
    session_id?: string | null;
    properties?: Record<string, unknown>;
  }): Promise<IBehavioralEvent> {
    const [row] = await db("behavioral_events")
      .insert({
        event_type: data.event_type,
        org_id: data.org_id ?? null,
        session_id: data.session_id ?? null,
        properties: JSON.stringify(data.properties ?? {}),
      })
      .returning("*");
    return row;
  }

  static async findByType(
    eventType: string,
    limit = 100
  ): Promise<IBehavioralEvent[]> {
    return db("behavioral_events")
      .where({ event_type: eventType })
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  static async findByOrgId(
    orgId: number,
    limit = 100
  ): Promise<IBehavioralEvent[]> {
    return db("behavioral_events")
      .where({ org_id: orgId })
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  static async findBySessionId(
    sessionId: string
  ): Promise<IBehavioralEvent[]> {
    return db("behavioral_events")
      .where({ session_id: sessionId })
      .orderBy("created_at", "asc");
  }
}
