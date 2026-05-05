import {
  SupportTicket,
  SupportTicketListItem,
} from "../../../models/SupportTicketModel";
import { SupportTicketMessage } from "../../../models/SupportTicketMessageModel";

export function presentTicket(ticket: SupportTicket | SupportTicketListItem) {
  return {
    id: ticket.id,
    publicId: ticket.public_id,
    organizationId: ticket.organization_id,
    organizationName: "organization_name" in ticket ? ticket.organization_name : null,
    locationId: ticket.location_id,
    createdByUserId: ticket.created_by_user_id,
    createdByName: "created_by_name" in ticket ? ticket.created_by_name : null,
    createdByEmail: "created_by_email" in ticket ? ticket.created_by_email : null,
    assignedToUserId: ticket.assigned_to_user_id,
    assignedToName: "assigned_to_name" in ticket ? ticket.assigned_to_name : null,
    assignedToEmail: "assigned_to_email" in ticket ? ticket.assigned_to_email : null,
    type: ticket.type,
    status: ticket.status,
    severity: ticket.severity,
    priority: ticket.priority,
    category: ticket.category,
    targetSprint: ticket.target_sprint,
    title: ticket.title,
    currentPageUrl: ticket.current_page_url,
    requestedCompletionDate: ticket.requested_completion_date,
    guidedAnswers: ticket.guided_answers || {},
    internalNotes: ticket.internal_notes,
    resolutionNotes: ticket.resolution_notes,
    ackEmailSentAt: ticket.ack_email_sent_at,
    resolvedEmailSentAt: ticket.resolved_email_sent_at,
    resolvedAt: ticket.resolved_at,
    latestMessageAt:
      "latest_message_at" in ticket ? ticket.latest_message_at : null,
    clientVisibleMessageCount:
      "client_visible_message_count" in ticket
        ? ticket.client_visible_message_count
        : undefined,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
  };
}

export function presentMessage(message: SupportTicketMessage) {
  return {
    id: message.id,
    ticketId: message.ticket_id,
    authorUserId: message.author_user_id,
    authorRole: message.author_role,
    visibility: message.visibility,
    body: message.body,
    authorName: message.author_name,
    authorEmail: message.author_email,
    createdAt: message.created_at,
    updatedAt: message.updated_at,
  };
}
