import { apiPost } from "./index";

const baseurl = "/auth";

async function register(email: string, password: string, confirmPassword: string) {
  return apiPost({
    path: `${baseurl}/register`,
    passedData: { email, password, confirmPassword },
  });
}

async function verifyEmail(
  email: string,
  code: string,
  leadgenSessionId?: string,
) {
  // Optional leadgen tracking id forwarded from the original /signup URL
  // (?ls=<uuid>). The backend uses it to link the new account back to the
  // pre-signup leadgen session even if email-matching fails (e.g. the
  // client's email_submitted patch never landed).
  const passedData: Record<string, string> = { email, code };
  if (leadgenSessionId) {
    passedData.leadgen_session_id = leadgenSessionId;
  }
  return apiPost({
    path: `${baseurl}/verify-email`,
    passedData,
  });
}

async function login(email: string, password: string) {
  return apiPost({
    path: `${baseurl}/login`,
    passedData: { email, password },
  });
}

async function resendVerification(email: string) {
  return apiPost({
    path: `${baseurl}/resend-verification`,
    passedData: { email },
  });
}

async function forgotPassword(email: string) {
  return apiPost({
    path: `${baseurl}/forgot-password`,
    passedData: { email },
  });
}

async function resetPassword(
  email: string,
  code: string,
  password: string,
  confirmPassword: string
) {
  return apiPost({
    path: `${baseurl}/reset-password`,
    passedData: { email, code, password, confirmPassword },
  });
}

const authPassword = {
  register,
  verifyEmail,
  login,
  resendVerification,
  forgotPassword,
  resetPassword,
};

export default authPassword;
