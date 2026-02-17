import express, { Response, Request } from "express";
import { db } from "../../database/connection";
import { tokenRefreshMiddleware, AuthenticatedRequest } from "../../middleware/tokenRefresh";
import { requireRole, RBACRequest } from "../../middleware/rbac";
import { v4 as uuid } from "uuid";

const userWebsiteRoutes = express.Router();

/**
 * Helper to handle errors
 */
const handleError = (res: Response, error: any, operation: string) => {
  console.error(`[User/Website] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
  });
};

/**
 * GET /api/user/website
 * Get user's organization's website
 */
userWebsiteRoutes.get(
  "/",
  tokenRefreshMiddleware,
  requireRole("admin", "manager"),
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;

      if (!orgId) {
        return res.status(400).json({ error: "No organization found" });
      }

      // Get organization
      const org = await db("organizations").where({ id: orgId }).first();

      // Check tier
      if (org.subscription_tier !== "DFY") {
        return res.status(403).json({
          error: "DFY_TIER_REQUIRED",
          message:
            "Your organization does not have access to the website feature.",
        });
      }

      // Fetch project
      const project = await db("website_builder.projects")
        .where({ organization_id: orgId })
        .first();

      if (!project) {
        return res.json({
          status: "PREPARING",
          message:
            "We are preparing your website. You'll be notified when it's ready.",
        });
      }

      // Fetch published pages only
      const pages = await db("website_builder.pages")
        .where({ project_id: project.id, status: "published" })
        .orderBy("path");

      // Fetch media
      const media = await db("website_builder.media")
        .where({ project_id: project.id })
        .orderBy("created_at", "desc");

      // Calculate storage usage
      const storageUsed = media.reduce(
        (sum: number, m: any) => sum + (m.file_size || 0),
        0
      );
      const storageLimit = 1 * 1024 * 1024 * 1024; // 1 GB for users

      // Get edit count for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const editsToday = await db("website_builder.user_edits")
        .where({ organization_id: orgId })
        .where("created_at", ">=", today)
        .count("* as count")
        .first();

      return res.json({
        project: {
          id: project.id,
          hostname: project.generated_hostname,
          status: project.status,
          is_read_only: project.is_read_only,
          custom_domain: project.custom_domain,
          wrapper: project.wrapper,
          header: project.header,
          footer: project.footer,
        },
        pages,
        media,
        usage: {
          storage_used: storageUsed,
          storage_limit: storageLimit,
          storage_percentage: (storageUsed / storageLimit) * 100,
          edits_today: parseInt(String(editsToday?.count || 0)),
          edits_limit: 50,
        },
      });
    } catch (error) {
      return handleError(res, error, "Fetch user website");
    }
  }
);

/**
 * POST /api/user/website/pages/:pageId/edit
 * User AI edit with constraints
 * Frontend sends the currentHtml already extracted
 */
userWebsiteRoutes.post(
  "/pages/:pageId/edit",
  tokenRefreshMiddleware,
  requireRole("admin", "manager"),
  async (req: RBACRequest, res) => {
    try {
      const { pageId } = req.params;
      const { alloroClass, currentHtml, instruction, chatHistory = [] } =
        req.body;
      const userId = req.userId || 0;
      const orgId = req.organizationId;

      if (!alloroClass || !currentHtml || !instruction) {
        return res.status(400).json({
          error: "INVALID_INPUT",
          message: "alloroClass, currentHtml, and instruction are required",
        });
      }

      if (!orgId) {
        return res.status(400).json({ error: "No organization found" });
      }

      // Check tier + read-only status
      const org = await db("organizations").where({ id: orgId }).first();
      if (org.subscription_tier !== "DFY") {
        return res.status(403).json({ error: "DFY_TIER_REQUIRED" });
      }

      const project = await db("website_builder.projects")
        .where({ organization_id: orgId })
        .first();

      if (!project) {
        return res.status(404).json({ error: "Website not found" });
      }

      if (project.is_read_only) {
        return res.status(403).json({
          error: "READ_ONLY",
          message:
            "Your website is in read-only mode. Please upgrade to continue editing.",
        });
      }

      // Rate limiting: 50 edits per day per org
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const editsToday = await db("website_builder.user_edits")
        .where({ organization_id: orgId })
        .where("created_at", ">=", today)
        .count("* as count")
        .first();

      const dailyLimit = 50;
      const currentCount = parseInt(String(editsToday?.count || 0));

      if (currentCount >= dailyLimit) {
        return res.status(429).json({
          error: "RATE_LIMIT_EXCEEDED",
          message: `You've reached your daily limit of ${dailyLimit} edits. Try again tomorrow.`,
          limit: dailyLimit,
          reset_at: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        });
      }

      // Fetch page to verify it exists
      const page = await db("website_builder.pages")
        .where({ id: pageId, project_id: project.id })
        .first();

      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }

      // Fetch media library for context
      const mediaItems = await db("website_builder.media")
        .where({ project_id: project.id })
        .orderBy("created_at", "desc")
        .select(
          "display_name",
          "s3_url",
          "alt_text",
          "mime_type",
          "width",
          "height"
        );

      let mediaContext = "";
      if (mediaItems.length > 0) {
        mediaContext = `\n\n## Available Media Library\n\nYou have access to the following uploaded media. You can reference these images/videos by their URLs in your HTML:\n\n`;
        for (const media of mediaItems) {
          const dimensions =
            media.width && media.height
              ? ` (${media.width}x${media.height})`
              : "";
          const altText = media.alt_text ? ` - ${media.alt_text}` : "";
          mediaContext += `- **${media.display_name}**${altText}${dimensions}\n  URL: ${media.s3_url}\n  Type: ${media.mime_type}\n\n`;
        }
      }

      console.log(
        `[User/Website] Edit request for page ${pageId}, class: ${alloroClass}`
      );

      // Import the service lazily
      const { editHtmlComponent } = await import(
        "../../services/pageEditorService"
      );

      // Call AI with USER system prompt (stricter constraints)
      const result = await editHtmlComponent({
        alloroClass,
        currentHtml,
        instruction,
        chatHistory,
        mediaContext,
        promptType: "user", // Use user-specific system prompt
      });

      // Log edit
      await db("website_builder.user_edits").insert({
        id: uuid(),
        organization_id: orgId,
        user_id: userId,
        project_id: project.id,
        page_id: pageId,
        component_class: alloroClass,
        instruction,
        tokens_used: 0, // TODO: get from result if available
        success: !result.rejected,
        error_message: result.rejected ? result.message : null,
        created_at: new Date(),
      });

      console.log(`[User/Website] ✓ Edit completed for class: ${alloroClass}`);

      return res.json({
        success: true,
        editedHtml: result.editedHtml,
        message: result.message,
        rejected: result.rejected,
        edits_remaining: dailyLimit - currentCount - 1,
      });
    } catch (error: any) {
      console.error("[User/Website] Error editing page component:", error);
      return res.status(500).json({
        error: "EDIT_ERROR",
        message: error?.message || "Failed to edit component",
      });
    }
  }
);

export default userWebsiteRoutes;
