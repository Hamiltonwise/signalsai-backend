import express from "express";
import { db } from "../database/connection";

const auditRoutes = express.Router();

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "https://n8napp.getalloro.com/webhook/website-scraping-tool";

// ============================================
// NORMALIZATION HELPERS
// ============================================

function normalizeWebsiteAnalysis(data: any) {
  if (!data) return null;
  return {
    overall_score: Number(data.overall_score),
    overall_grade: data.overall_grade,
    pillars: data.pillars.map((p: any) => ({
      ...p,
      score: Number(p.score),
    })),
  };
}

function normalizeSelfGBP(data: any) {
  if (!data) return null;
  return {
    ...data,
    totalScore: data.totalScore ?? data.averageStarRating ?? 0,
  };
}

function normalizeCompetitors(competitorsData: any, selfGbpData: any) {
  if (!competitorsData?.competitors) return null;

  // Extract placeId from step_self_gbp to filter out self
  const selfPlaceId = selfGbpData?.placeId || null;

  return competitorsData.competitors
    .filter((c: any) => c.placeId !== selfPlaceId)
    .map((c: any, index: number) => ({
      ...c,
      location: ensureLatLng(c.location, selfGbpData?.location, index),
      totalScore: c.totalScore ?? c.averageStarRating ?? 0,
    }));
}

function ensureLatLng(location: any, selfLocation: any, index: number) {
  if (location?.lat && location?.lng) {
    return location;
  }

  // Use self location as base, or fallback to West Orange, NJ area
  const baseLat = selfLocation?.lat || 40.7964763;
  const baseLng = selfLocation?.lng || -74.2613414;

  // Offset each competitor slightly (within ~2 mile radius)
  const offsets = [
    { lat: 0.015, lng: -0.01 },
    { lat: -0.02, lng: 0.008 },
    { lat: 0.01, lng: 0.015 },
    { lat: -0.008, lng: -0.02 },
    { lat: 0.025, lng: 0.005 },
    { lat: -0.015, lng: 0.012 },
  ];

  const offset = offsets[index % offsets.length];

  return {
    lat: location?.lat ?? baseLat + offset.lat,
    lng: location?.lng ?? baseLng + offset.lng,
  };
}

function normalizeGBPAnalysis(data: any) {
  if (!data) return null;
  return {
    ...data,
    gbp_readiness_score: Number(data.gbp_readiness_score),
    pillars: data.pillars.map((p: any) => ({
      ...p,
      score: Number(p.score),
    })),
  };
}

// ============================================
// POST /api/audit/start
// Triggers n8n workflow which creates the DB record
// n8n returns the audit_id in its response
// ============================================
auditRoutes.post("/start", async (req, res) => {
  try {
    const { domain, practice_search_string } = req.body;

    if (!domain || !practice_search_string) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: domain, practice_search_string",
      });
    }

    console.log(`[Audit] Starting audit for domain: ${domain}`);

    if (!N8N_WEBHOOK_URL) {
      return res.status(500).json({
        success: false,
        error: "n8n webhook URL not configured",
      });
    }

    // Call n8n webhook and WAIT for response
    // n8n creates the DB record and returns the audit_id
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain,
        practice_search_string,
      }),
    });

    if (!n8nResponse.ok) {
      console.error(
        `[Audit] n8n webhook failed with status: ${n8nResponse.status}`
      );
      return res.status(502).json({
        success: false,
        error: `n8n webhook failed with status ${n8nResponse.status}`,
      });
    }

    // Parse response from n8n - expects { audit_id: "uuid" }
    const n8nData = await n8nResponse.json();

    if (!n8nData.audit_id) {
      console.error("[Audit] n8n response missing audit_id:", n8nData);
      return res.status(502).json({
        success: false,
        error: "n8n response missing audit_id",
      });
    }

    const auditId = n8nData.audit_id;
    console.log(`[Audit] Received audit_id from n8n: ${auditId}`);

    return res.json({
      success: true,
      audit_id: auditId,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Audit] Start error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// ============================================
// GET /api/audit/:auditId/status
// Polling endpoint for frontend
// ============================================
auditRoutes.get("/:auditId/status", async (req, res) => {
  try {
    const { auditId } = req.params;

    if (!auditId) {
      return res.status(400).json({
        success: false,
        error: "Missing auditId",
      });
    }

    const audit = await db("audit_processes").where("id", auditId).first();

    if (!audit) {
      return res.status(404).json({
        success: false,
        error: "Audit not found",
      });
    }

    // Process and normalize data
    const response = {
      success: true,
      id: audit.id,
      status: audit.status,
      realtime_status: audit.realtime_status,
      error_message: audit.error_message,
      created_at: audit.created_at,
      updated_at: audit.updated_at,

      // Step data (null if not yet available)
      screenshots: audit.step_screenshots,
      website_analysis: normalizeWebsiteAnalysis(audit.step_website_analysis),
      self_gbp: normalizeSelfGBP(audit.step_self_gbp),
      competitors: normalizeCompetitors(
        audit.step_competitors,
        audit.step_self_gbp
      ),
      gbp_analysis: normalizeGBPAnalysis(audit.step_gbp_analysis),
    };

    return res.json(response);
  } catch (error: any) {
    console.error("[Audit] Status error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// ============================================
// GET /api/audit/:auditId
// Get full audit details (same as status but different endpoint)
// ============================================
auditRoutes.get("/:auditId", async (req, res) => {
  try {
    const { auditId } = req.params;

    if (!auditId) {
      return res.status(400).json({
        success: false,
        error: "Missing auditId",
      });
    }

    const audit = await db("audit_processes").where("id", auditId).first();

    if (!audit) {
      return res.status(404).json({
        success: false,
        error: "Audit not found",
      });
    }

    return res.json({
      success: true,
      audit: {
        id: audit.id,
        domain: audit.domain,
        practice_search_string: audit.practice_search_string,
        status: audit.status,
        realtime_status: audit.realtime_status,
        error_message: audit.error_message,
        created_at: audit.created_at,
        updated_at: audit.updated_at,
        step_screenshots: audit.step_screenshots,
        step_website_analysis: audit.step_website_analysis,
        step_self_gbp: audit.step_self_gbp,
        step_competitors: audit.step_competitors,
        step_gbp_analysis: audit.step_gbp_analysis,
      },
    });
  } catch (error: any) {
    console.error("[Audit] Get error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// ============================================
// PATCH /api/audit/:auditId
// Update audit step data (called by n8n)
// ============================================
auditRoutes.patch("/:auditId", async (req, res) => {
  try {
    const { auditId } = req.params;
    const updateData = req.body;

    if (!auditId) {
      return res.status(400).json({
        success: false,
        error: "Missing auditId",
      });
    }

    // Validate allowed fields
    const allowedFields = [
      "status",
      "realtime_status",
      "error_message",
      "step_screenshots",
      "step_website_analysis",
      "step_self_gbp",
      "step_competitors",
      "step_gbp_analysis",
    ];

    const filteredData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in updateData) {
        filteredData[field] = updateData[field];
      }
    }

    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update",
      });
    }

    console.log(`[Audit] Updating ${auditId} with:`, Object.keys(filteredData));

    await db("audit_processes").where("id", auditId).update(filteredData);

    return res.json({
      success: true,
      updated_fields: Object.keys(filteredData),
    });
  } catch (error: any) {
    console.error("[Audit] Update error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default auditRoutes;
