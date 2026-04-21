import { sendEmail } from "../../emails/emailService";
import { wrapInBaseTemplate } from "../../emails/templates/base";
import type { ComposedEmail, OrgRevealContext, RevealMode } from "./types";

/**
 * Card 4: Mailgun integration for reveal email.
 *
 * Target latency: email fires within 60 seconds of site.published.
 * Shadow mode (dry_run): returns a composed-only result; does NOT call
 * Mailgun. The composedEmail is still returned so the orchestrator can
 * archive it.
 */

export interface SendRevealEmailResult {
  sent: boolean;
  messageId: string | null;
  sentAt: Date | null;
  error?: string;
  skipped?: "dry_run" | "voice_check_failed" | "missing_recipient";
}

export async function sendRevealEmail(
  org: OrgRevealContext,
  composed: ComposedEmail,
  mode: RevealMode
): Promise<SendRevealEmailResult> {
  // Voice check is a hard gate. A composed email that fails the voice check
  // never ships, regardless of mode. Orchestrator treats this as a fault.
  if (!composed.voiceCheck.passed) {
    return {
      sent: false,
      messageId: null,
      sentAt: null,
      skipped: "voice_check_failed",
      error: `voice_check: violations=[${composed.voiceCheck.violations.join(",")}] recipe_complete=${composed.voiceCheck.recipeCompliance.complete}`,
    };
  }

  if (mode === "dry_run") {
    return {
      sent: false,
      messageId: null,
      sentAt: null,
      skipped: "dry_run",
    };
  }

  if (!org.recipientEmail) {
    return {
      sent: false,
      messageId: null,
      sentAt: null,
      skipped: "missing_recipient",
      error: "org has no primary user email on file",
    };
  }

  const wrapped = wrapInBaseTemplate(composed.bodyHtml, {
    preheader: "Your new practice home is ready.",
    showFooterLinks: false,
  });

  const result = await sendEmail({
    subject: composed.subject,
    body: wrapped,
    recipients: [org.recipientEmail],
  });

  if (!result.success) {
    return {
      sent: false,
      messageId: null,
      sentAt: null,
      error: result.error,
    };
  }

  return {
    sent: true,
    messageId: result.messageId ?? null,
    sentAt: new Date(),
  };
}
