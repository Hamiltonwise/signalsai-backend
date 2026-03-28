/**
 * Referral Thank-You Auto-Draft -- WO-47
 *
 * GET  /api/user/referral-thank-you/drafts  -- list pending drafts
 * POST /api/user/referral-thank-you/generate -- generate a draft for a GP
 * POST /api/user/referral-thank-you/send     -- send a draft
 * POST /api/user/referral-thank-you/skip     -- skip a draft
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const referralThankYouRoutes = express.Router();

// List pending thank-you drafts for the org
referralThankYouRoutes.get(
  "/referral-thank-you/drafts",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.json({ success: true, drafts: [] });

      const hasTable = await db.schema.hasTable("referral_thank_you_drafts");
      if (!hasTable) return res.json({ success: true, drafts: [] });

      const drafts = await db("referral_thank_you_drafts")
        .where({ organization_id: orgId, status: "pending" })
        .orderBy("created_at", "desc")
        .limit(10);

      return res.json({ success: true, drafts });
    } catch (error: any) {
      console.error("[ThankYou] List error:", error.message);
      return res.json({ success: true, drafts: [] });
    }
  },
);

// Generate a thank-you draft using Claude
referralThankYouRoutes.post(
  "/referral-thank-you/generate",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const { gpName, patientInitials, procedureType, outcome } = req.body;
      if (!gpName) return res.status(400).json({ success: false, error: "gpName required" });

      // Get org info
      const org = await db("organizations").where({ id: orgId }).first("name", "owner_profile");
      const doctorName = org?.name || "Doctor";
      const profile = org?.owner_profile
        ? (typeof org.owner_profile === "string" ? JSON.parse(org.owner_profile) : org.owner_profile)
        : null;
      const firstName = doctorName.split(" ").pop() || doctorName;

      // Check if GP already got a thank-you in last 30 days
      const hasTable = await db.schema.hasTable("referral_thank_you_drafts");
      if (hasTable) {
        const recent = await db("referral_thank_you_drafts")
          .where({ organization_id: orgId, gp_name: gpName })
          .where("created_at", ">=", new Date(Date.now() - 30 * 86_400_000))
          .first();
        if (recent) {
          return res.json({ success: true, draft: recent, skipped: true, reason: "Already sent within 30 days" });
        }
      }

      // Generate draft via Claude
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // Fallback template if no API key
        const fallback = `Dr. ${gpName}, thank you for referring ${patientInitials || "your patient"} to us. ${procedureType ? `The ${procedureType} went well and w` : "W"}e'll send a full clinical report to your office this week. ${firstName}`;
        return res.json({ success: true, draft: { gp_name: gpName, body: fallback, status: "pending" } });
      }

      const client = new Anthropic({ apiKey });
      const prompt = `Write a professional, warm thank-you note from a specialist to a referring GP.

Specialist: ${doctorName}
Referring GP: Dr. ${gpName}
${patientInitials ? `Patient: ${patientInitials} (initials only)` : ""}
${procedureType ? `Procedure: ${procedureType}` : ""}
${outcome ? `Outcome: ${outcome}` : ""}

Rules:
- Under 75 words
- Warm but professional
- Do NOT use the patient's full name (HIPAA)
- Mention that a clinical report will follow
- Sign with "${firstName}"
- No generic phrases like "thank you for your continued support"
- Specific to this referral
- No em-dashes`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });

      const body = response.content[0]?.type === "text" ? response.content[0].text : "";

      // Store draft
      let draft: any = { gp_name: gpName, body, status: "pending" };
      if (hasTable) {
        const [inserted] = await db("referral_thank_you_drafts")
          .insert({
            organization_id: orgId,
            gp_name: gpName,
            patient_initials: patientInitials || null,
            procedure_type: procedureType || null,
            body,
            status: "pending",
          })
          .returning("*");
        draft = inserted;
      }

      return res.json({ success: true, draft });
    } catch (error: any) {
      console.error("[ThankYou] Generate error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to generate draft" });
    }
  },
);

// Send a draft
referralThankYouRoutes.post(
  "/referral-thank-you/send",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const { draftId, method, gpEmail } = req.body;
      if (!draftId) return res.status(400).json({ success: false, error: "draftId required" });

      const hasTable = await db.schema.hasTable("referral_thank_you_drafts");
      if (!hasTable) return res.json({ success: true, sent: false });

      await db("referral_thank_you_drafts").where({ id: draftId }).update({
        status: "sent",
        sent_method: method || "email",
        gp_email: gpEmail || null,
        sent_at: new Date(),
      });

      // Log behavioral event
      const draft = await db("referral_thank_you_drafts").where({ id: draftId }).first();
      if (draft) {
        await db("behavioral_events").insert({
          organization_id: draft.organization_id,
          event_type: "referral.thank_you_sent",
          metadata: JSON.stringify({ gp_name: draft.gp_name, method }),
        }).catch(() => {});
      }

      return res.json({ success: true, sent: true });
    } catch (error: any) {
      console.error("[ThankYou] Send error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to send" });
    }
  },
);

// Skip a draft
referralThankYouRoutes.post(
  "/referral-thank-you/skip",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const { draftId } = req.body;
      if (!draftId) return res.status(400).json({ success: false, error: "draftId required" });

      const hasTable = await db.schema.hasTable("referral_thank_you_drafts");
      if (hasTable) {
        await db("referral_thank_you_drafts").where({ id: draftId }).update({ status: "skipped" });
      }

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "Failed to skip" });
    }
  },
);

export default referralThankYouRoutes;
