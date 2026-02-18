import { forwardUserInquiry } from "../../../utils/core/notificationHelper";

interface InquiryData {
  userName: string;
  userEmail: string;
  practiceName?: string;
  subject: string;
  message: string;
}

interface ServiceResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export async function processInquiry(data: InquiryData): Promise<ServiceResult> {
  console.log(
    `[Support] Received inquiry from ${data.userName} (${data.userEmail}): ${data.subject}`
  );

  const result = await forwardUserInquiry({
    userName: data.userName,
    userEmail: data.userEmail,
    practiceName: data.practiceName,
    subject: data.subject,
    message: data.message,
  });

  if (!result.success) {
    console.error(`[Support] Failed to forward inquiry: ${result.error}`);
    return {
      success: false,
      error: result.error,
    };
  }

  console.log(`[Support] \u2713 Inquiry forwarded successfully to admin team`);

  return {
    success: true,
    messageId: "messageId" in result ? result.messageId : undefined,
  };
}
