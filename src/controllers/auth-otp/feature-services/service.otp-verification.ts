/**
 * OTP Verification Service
 *
 * Verifies an OTP code against stored records and marks it as used.
 */

import { OtpCodeModel } from "../../../models/OtpCodeModel";

/**
 * Finds a valid (unused, non-expired) OTP for the given email and code.
 * If found, marks it as used and returns true.
 * Returns false if no valid OTP exists.
 */
export async function verifyAndConsume(
  email: string,
  code: string
): Promise<boolean> {
  const otpRecord = await OtpCodeModel.findValidCode(email, code);

  if (!otpRecord) {
    return false;
  }

  await OtpCodeModel.markUsed(otpRecord.id);
  return true;
}
