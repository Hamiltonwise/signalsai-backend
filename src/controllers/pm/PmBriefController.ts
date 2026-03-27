import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { db } from "../../database/connection";
import { PmDailyBriefModel } from "../../models/PmDailyBriefModel";

function handleError(res: Response, error: unknown, operation: string): Response {
  console.error(`[PM-BRIEF] ${operation} failed:`, error);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

// GET /api/pm/daily-brief — latest brief
export async function getLatestBrief(_req: AuthRequest, res: Response): Promise<any> {
  try {
    const brief = await db("pm_daily_briefs")
      .orderBy("brief_date", "desc")
      .first();

    if (!brief) {
      return res.json({ success: true, data: null });
    }

    // Deserialize JSON fields
    const data = {
      ...brief,
      recommended_tasks:
        typeof brief.recommended_tasks === "string"
          ? JSON.parse(brief.recommended_tasks)
          : brief.recommended_tasks,
    };

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "getLatestBrief");
  }
}

// GET /api/pm/daily-brief/history — paginated past briefs
export async function getBriefHistory(req: AuthRequest, res: Response): Promise<any> {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const [countResult] = await db("pm_daily_briefs").count("* as count");
    const total = parseInt(countResult.count as string, 10) || 0;

    const briefs = await db("pm_daily_briefs")
      .orderBy("brief_date", "desc")
      .limit(limit)
      .offset(offset);

    const data = briefs.map((b: any) => ({
      ...b,
      recommended_tasks:
        typeof b.recommended_tasks === "string"
          ? JSON.parse(b.recommended_tasks)
          : b.recommended_tasks,
    }));

    return res.json({ success: true, data, total });
  } catch (error) {
    return handleError(res, error, "getBriefHistory");
  }
}
