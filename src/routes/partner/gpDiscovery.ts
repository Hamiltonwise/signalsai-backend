/**
 * GP Discovery Page API -- public endpoints for referral intake
 *
 * GET  /api/partner/discovery/:orgSlug  -- public practice profile for referrers
 * POST /api/referral/:orgId             -- submit a referral (public, no auth)
 */

import express from "express";
import axios from "axios";
import rateLimit from "express-rate-limit";
import { db } from "../../database/connection";

const gpDiscoveryRoutes = express.Router();

const SLACK_WEBHOOK = process.env.ALLORO_BRIEF_SLACK_WEBHOOK;

const referralLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many submissions. Try again later." },
});

/**
 * GET /api/partner/discovery/:orgSlug
 *
 * Public -- no auth. Returns practice info for the GP Discovery page.
 * Looks up org by review_page_slug or by id (numeric fallback).
 */
gpDiscoveryRoutes.get(
  "/discovery/:orgSlug",
  async (req, res) => {
    try {
      const { orgSlug } = req.params;

      let org: any;
      if (/^\d+$/.test(orgSlug)) {
        org = await db("organizations").where({ id: Number(orgSlug) }).first();
      } else {
        org = await db("organizations").where({ review_page_slug: orgSlug }).first();
      }

      if (!org) {
        return res.status(404).json({ success: false, error: "Practice not found" });
      }

      // Load vocabulary config for case types
      const vocabConfig = await db("vocabulary_configs")
        .where({ organization_id: org.id })
        .first();
      const vocab = vocabConfig?.config
        ? (typeof vocabConfig.config === "string" ? JSON.parse(vocabConfig.config) : vocabConfig.config)
        : null;

      // Load primary location for phone + city
      const location = await db("locations")
        .where({ organization_id: org.id, is_primary: true })
        .first();

      // Load research brief for praise_patterns
      const researchBrief = org.research_brief
        ? (typeof org.research_brief === "string" ? JSON.parse(org.research_brief) : org.research_brief)
        : null;

      // Build case types list from vocabulary config
      const caseTypes = vocab?.caseTypes || vocab?.caseType
        ? [vocab.caseType] // single case type from default vocab
        : ["Root Canal", "Retreatment", "Apicoectomy", "Cracked Tooth Evaluation"]; // endodontics default

      return res.json({
        success: true,
        practice: {
          name: org.name,
          phone: location?.phone || null,
          city: location?.city || location?.name || null,
          specialty: location?.specialty || org.organization_type || null,
          case_types: caseTypes,
          turnaround_days: 3,
          praise_patterns: researchBrief?.praise_patterns || [],
          practice_personality: researchBrief?.practice_personality || null,
          referral_form_data: {
            org_id: org.id,
            urgency_options: ["Routine", "Urgent", "Emergency"],
          },
        },
      });
    } catch (error: any) {
      console.error("[GPDiscovery] Fetch error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load practice" });
    }
  },
);

/**
 * POST /api/referral/:orgId
 *
 * Public -- no auth. Submits a GP referral.
 * Validates required fields, creates referral_submissions record,
 * logs behavioral_event, posts Slack notification.
 */
gpDiscoveryRoutes.post(
  "/referral/:orgId",
  referralLimiter,
  async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      if (!orgId || isNaN(orgId)) {
        return res.status(400).json({ success: false, error: "Invalid organization" });
      }

      const org = await db("organizations").where({ id: orgId }).first();
      if (!org) {
        return res.status(404).json({ success: false, error: "Practice not found" });
      }

      const {
        referring_doctor_name,
        referring_practice_name,
        patient_first_name,
        case_type,
        urgency = "Routine",
        notes,
      } = req.body;

      // Validate required fields
      if (!referring_doctor_name?.trim()) {
        return res.status(400).json({ success: false, error: "Referring doctor name is required" });
      }
      if (!referring_practice_name?.trim()) {
        return res.status(400).json({ success: false, error: "Referring practice name is required" });
      }
      if (!patient_first_name?.trim()) {
        return res.status(400).json({ success: false, error: "Patient first name is required" });
      }
      if (!case_type?.trim()) {
        return res.status(400).json({ success: false, error: "Case type is required" });
      }
      if (!["Routine", "Urgent", "Emergency"].includes(urgency)) {
        return res.status(400).json({ success: false, error: "Invalid urgency level" });
      }

      // Create referral_submissions record
      const [submission] = await db("referral_submissions")
        .insert({
          organization_id: orgId,
          referring_doctor_name: referring_doctor_name.trim(),
          referring_practice_name: referring_practice_name.trim(),
          patient_first_name: patient_first_name.trim(),
          case_type: case_type.trim(),
          urgency,
          notes: notes?.trim() || null,
        })
        .returning("id");

      // Log behavioral event (fire-and-forget)
      db("behavioral_events")
        .insert({
          event_type: "referral.submitted",
          properties: JSON.stringify({
            organization_id: orgId,
            referrer_name: referring_doctor_name.trim(),
            referrer_practice: referring_practice_name.trim(),
            case_type: case_type.trim(),
            urgency,
            submission_id: submission?.id || submission,
          }),
        })
        .catch(() => {});

      // Slack notification (fire-and-forget)
      if (SLACK_WEBHOOK) {
        axios
          .post(SLACK_WEBHOOK, {
            text: `📋 New referral for ${org.name}: ${patient_first_name.trim()} (${case_type.trim()}, ${urgency}) from Dr. ${referring_doctor_name.trim()} at ${referring_practice_name.trim()}`,
          }, { timeout: 5000 })
          .catch(() => {});
      }

      console.log(`[GPDiscovery] Referral submitted for org ${orgId} from Dr. ${referring_doctor_name.trim()}`);
      return res.json({ success: true, id: submission?.id || submission });
    } catch (error: any) {
      console.error("[GPDiscovery] Submit error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to submit referral" });
    }
  },
);

export default gpDiscoveryRoutes;

// T2 registers these routes in src/index.ts
