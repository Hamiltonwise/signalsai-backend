import { apiPost } from "./index";

const baseurl = "/auth";

async function register(email: string, password: string, confirmPassword: string) {
  return apiPost({
    path: `${baseurl}/register`,
    passedData: { email, password, confirmPassword },
  });
}

async function verifyEmail(email: string, code: string) {
  return apiPost({
    path: `${baseurl}/verify-email`,
    passedData: { email, code },
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
