import FormData from "form-data";
import Mailgun from "mailgun.js";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.MAILGUN_API_KEY;
const DOMAIN = process.env.MAILGUN_DOMAIN;

if (!API_KEY || !DOMAIN) {
  console.warn(
    "Mailgun API key or domain is missing. Email sending will fail."
  );
}

const mailgun = new Mailgun(FormData);
let client: any = null;

export const sendEmail = async (
  to: string,
  subject: string,
  text: string,
  html?: string
) => {
  if (!API_KEY || !DOMAIN) {
    console.error("Cannot send email: Mailgun configuration missing");
    return false;
  }

  try {
    if (!client) {
      client = mailgun.client({ username: "api", key: API_KEY });
    }

    const messageData = {
      from: `SignalsAI <noreply@${DOMAIN}>`,
      to,
      subject,
      text,
      html,
    };

    const result = await client.messages.create(DOMAIN, messageData);
    console.log(`Email sent to ${to}: ${result.id}`);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

export const sendOTP = async (email: string, code: string) => {
  const subject = "Your Login Code for SignalsAI";
  const text = `Your login code is: ${code}. It expires in 10 minutes.`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Login Verification</h2>
      <p>Your login code is:</p>
      <h1 style="letter-spacing: 5px; background: #f4f4f4; padding: 10px; display: inline-block; border-radius: 5px;">${code}</h1>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request this code, please ignore this email.</p>
    </div>
  `;

  return sendEmail(email, subject, text, html);
};

export const sendInvitation = async (
  email: string,
  organizationName: string,
  role: string
) => {
  const subject = `You've been invited to join ${organizationName} on SignalsAI`;
  const loginUrl =
    process.env.NODE_ENV === "production"
      ? "https://app.getalloro.com/signin"
      : "http://localhost:5174/signin";

  const text = `You've been invited to join ${organizationName} on SignalsAI as a ${role}. Visit ${loginUrl} to sign in with your email and get started.`;

  const html = `
    <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
      <h2 style="color: #1a1a1a;">You've been invited to SignalsAI</h2>
      <p style="color: #4a5568; font-size: 16px;">
        You've been invited to join <strong>${organizationName}</strong> on SignalsAI with the role of <strong>${role}</strong>.
      </p>
      <p style="color: #4a5568; font-size: 16px;">
        SignalsAI helps you track and optimize your online presence with data-driven insights.
      </p>
      <div style="margin: 30px 0;">
        <a href="${loginUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">
          Sign In to Get Started
        </a>
      </div>
      <p style="color: #718096; font-size: 14px;">
        To access your account, visit the sign-in page and use the "Sign in with Email" option. You'll receive a verification code to complete the login process.
      </p>
      <p style="color: #718096; font-size: 14px; margin-top: 20px;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
      <p style="color: #a0aec0; font-size: 12px;">
        This invitation was sent by SignalsAI on behalf of ${organizationName}.
      </p>
    </div>
  `;

  return sendEmail(email, subject, text, html);
};
