import express, { Request, Response } from "express";
import { db } from "../../database/connection";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────

function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isSuperAdmin(email: string): boolean {
  return getSuperAdminEmails().includes(email.toLowerCase());
}

// ── GET /api/admin/users ─────────────────────────────────────────
// List all admin users.

router.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req: Request, res: Response) => {
    try {
      const users = await db("users")
        .select("id", "email", "name", "role", "is_active", "created_at", "last_login_at")
        .orderBy("created_at", "desc");

      // Mark superAdmins based on env var
      const enriched = users.map((u: any) => ({
        ...u,
        is_super_admin: isSuperAdmin(u.email),
      }));

      return res.json({ success: true, users: enriched });
    } catch (err: any) {
      console.error("[USER-MGMT] List error:", err.message);
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  },
);

// ── POST /api/admin/users ────────────────────────────────────────
// Create a new admin user.

router.post(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { email, role, send_invite } = req.body;

      if (!email || typeof email !== "string") {
        return res.status(400).json({ success: false, error: "email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const requestedRole = role || "admin";

      // Only superAdmins can create other superAdmins
      if (requestedRole === "superAdmin") {
        const callerEmail = (req as any).user?.email;
        if (!callerEmail || !isSuperAdmin(callerEmail)) {
          return res.status(403).json({
            success: false,
            error: "Only superAdmins can create superAdmin users",
          });
        }
      }

      // Check for existing user
      const existing = await db("users").where({ email: normalizedEmail }).first();
      if (existing) {
        return res.status(409).json({ success: false, error: "User with this email already exists" });
      }

      const [user] = await db("users")
        .insert({
          email: normalizedEmail,
          name: normalizedEmail.split("@")[0],
          role: requestedRole,
          is_active: true,
        })
        .returning(["id", "email", "name", "role", "is_active", "created_at"]);

      // Optionally send invite via n8n webhook
      if (send_invite && process.env.ALLORO_N8N_WEBHOOK_URL) {
        try {
          await fetch(process.env.ALLORO_N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "admin_invite",
              email: normalizedEmail,
              role: requestedRole,
              invite_url: `https://app.getalloro.com/signin`,
            }),
          });
          console.log(`[USER-MGMT] Invite sent for ${normalizedEmail}`);
        } catch (err: any) {
          console.warn(`[USER-MGMT] Failed to send invite: ${err.message}`);
          // Non-fatal -- user still created
        }
      }

      console.log(`[USER-MGMT] Created user ${normalizedEmail} with role ${requestedRole}`);
      return res.status(201).json({ success: true, user });
    } catch (err: any) {
      console.error("[USER-MGMT] Create error:", err.message);
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  },
);

// ── PATCH /api/admin/users/:id ───────────────────────────────────
// Update user role. superAdmin only.

router.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId)) {
        return res.status(400).json({ success: false, error: "Invalid user ID" });
      }

      const { role } = req.body;
      if (!role) {
        return res.status(400).json({ success: false, error: "role is required" });
      }

      const user = await db("users").where({ id: userId }).first();
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      await db("users").where({ id: userId }).update({ role, updated_at: new Date() });

      console.log(`[USER-MGMT] Updated user ${userId} role to ${role}`);
      return res.json({ success: true, user: { ...user, role } });
    } catch (err: any) {
      console.error("[USER-MGMT] Update error:", err.message);
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  },
);

// ── DELETE /api/admin/users/:id ──────────────────────────────────
// Deactivate user (soft delete). Cannot deactivate yourself or last superAdmin.

router.delete(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId)) {
        return res.status(400).json({ success: false, error: "Invalid user ID" });
      }

      // Cannot deactivate yourself
      const callerId = (req as any).user?.userId || (req as any).user?.id;
      if (callerId === userId) {
        return res.status(400).json({ success: false, error: "Cannot deactivate yourself" });
      }

      const user = await db("users").where({ id: userId }).first();
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      // Cannot deactivate the last active superAdmin
      if (isSuperAdmin(user.email)) {
        const activeSuperAdmins = await db("users")
          .whereIn(
            "email",
            getSuperAdminEmails(),
          )
          .where({ is_active: true })
          .count("id as count")
          .first();

        const count = Number(activeSuperAdmins?.count || 0);
        if (count <= 1) {
          return res.status(400).json({
            success: false,
            error: "Cannot deactivate the last active superAdmin",
          });
        }
      }

      await db("users").where({ id: userId }).update({
        is_active: false,
        updated_at: new Date(),
      });

      console.log(`[USER-MGMT] Deactivated user ${userId} (${user.email})`);
      return res.json({ success: true, message: `User ${user.email} deactivated` });
    } catch (err: any) {
      console.error("[USER-MGMT] Deactivate error:", err.message);
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  },
);

// T2 registers /api/admin/users routes
export default router;
