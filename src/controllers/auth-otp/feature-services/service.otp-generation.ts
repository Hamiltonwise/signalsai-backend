/**
 * OTP Generation Service
 *
 * Generates 6-digit OTP codes and persists them via OtpCodeModel.
 * Sends OTP email via the mail service.
 */

import { OtpCodeModel } from "../../../models/OtpCodeModel";
import { sendOTP } from "../../../utils/core/mail";

export function generateSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Creates an OTP record in the database and sends it via email.
 * Returns true if the email was sent successfully.
 */
export async function createAndSendOtp(email: string): Promise<boolean> {
  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await OtpCodeModel.create({
    email,
    code,
    expires_at: expiresAt,
  });

  const sent = await sendOTP(email, code);
  return sent;
}
