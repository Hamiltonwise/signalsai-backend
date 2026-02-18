/**
 * reCAPTCHA verification service for website contact form.
 * Verifies tokens against the Google reCAPTCHA API.
 */

export async function verifyRecaptcha(token: string): Promise<boolean> {
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  if (!recaptchaSecret) {
    return true;
  }

  const verifyRes = await fetch(
    "https://www.google.com/recaptcha/api/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${recaptchaSecret}&response=${token}`,
    }
  );

  const verifyData = await verifyRes.json();
  return verifyData.success;
}
