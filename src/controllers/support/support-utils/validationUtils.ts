interface ValidatedInquiryData {
  userName: string;
  userEmail: string;
  practiceName?: string;
  subject: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  message?: string;
  data?: ValidatedInquiryData;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInquiryInput(body: any): ValidationResult {
  const { userName, userEmail, practiceName, subject, message } = body || {};

  if (!userName || typeof userName !== "string" || !userName.trim()) {
    return {
      valid: false,
      error: "MISSING_NAME",
      message: "Name is required",
    };
  }

  if (!userEmail || typeof userEmail !== "string" || !userEmail.trim()) {
    return {
      valid: false,
      error: "MISSING_EMAIL",
      message: "Email is required",
    };
  }

  if (!EMAIL_REGEX.test(userEmail.trim())) {
    return {
      valid: false,
      error: "INVALID_EMAIL",
      message: "Please enter a valid email address",
    };
  }

  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return {
      valid: false,
      error: "MISSING_SUBJECT",
      message: "Subject is required",
    };
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      valid: false,
      error: "MISSING_MESSAGE",
      message: "Message is required",
    };
  }

  return {
    valid: true,
    data: {
      userName: userName.trim(),
      userEmail: userEmail.trim(),
      practiceName: practiceName?.trim() || undefined,
      subject: subject.trim(),
      message: message.trim(),
    },
  };
}
