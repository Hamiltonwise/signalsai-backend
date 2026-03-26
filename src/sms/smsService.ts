/**
 * SMS Service — sends SMS via Twilio.
 *
 * Used for review request delivery. Gracefully degrades if Twilio
 * is not configured (returns error, never throws).
 */

import Twilio from "twilio";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;

let client: ReturnType<typeof Twilio> | null = null;

function getClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) return null;
  if (!client) client = Twilio(ACCOUNT_SID, AUTH_TOKEN);
  return client;
}

export function isSmsConfigured(): boolean {
  return !!(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an SMS message via Twilio.
 */
export async function sendSms(
  to: string,
  body: string
): Promise<SmsResult> {
  const twilioClient = getClient();

  if (!twilioClient || !FROM_NUMBER) {
    console.warn("[SMS] Twilio not configured — SMS not sent");
    return { success: false, error: "SMS service not configured" };
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: FROM_NUMBER,
      to,
    });

    console.log(`[SMS] Sent to ${to}: ${message.sid}`);
    return { success: true, messageId: message.sid };
  } catch (err: any) {
    console.error(`[SMS] Failed to send to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}
