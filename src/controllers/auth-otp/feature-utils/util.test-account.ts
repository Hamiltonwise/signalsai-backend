/**
 * Test Account Utility
 *
 * Identifies test accounts that bypass OTP verification.
 */

const TEST_EMAIL = "tester@google.com";

export function isTestAccount(email: string): boolean {
  return email === TEST_EMAIL;
}
