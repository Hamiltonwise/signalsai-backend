import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-support/AdminSupportTicketsController";

const router = express.Router();

router.get(
  "/tickets",
  authenticateToken,
  superAdminMiddleware,
  controller.listTickets
);

router.get(
  "/tickets/:ticketId",
  authenticateToken,
  superAdminMiddleware,
  controller.getTicket
);

router.patch(
  "/tickets/:ticketId",
  authenticateToken,
  superAdminMiddleware,
  controller.updateTicket
);

router.post(
  "/tickets/:ticketId/messages",
  authenticateToken,
  superAdminMiddleware,
  controller.addMessage
);

export default router;
