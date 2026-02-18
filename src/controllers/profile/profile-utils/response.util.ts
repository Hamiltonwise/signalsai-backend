export interface ProfileData {
  phone: string | null;
  operational_jurisdiction: string | null;
}

export function formatProfileDataResponse(data: ProfileData) {
  return {
    success: true,
    data: {
      phone: data.phone,
      operational_jurisdiction: data.operational_jurisdiction,
    },
  };
}

export function formatProfileUpdateResponse(data: ProfileData) {
  return {
    success: true,
    message: "Profile updated successfully",
    data: {
      phone: data.phone,
      operational_jurisdiction: data.operational_jurisdiction,
    },
  };
}

export function formatErrorResponse(error: any, operation: string) {
  console.error(`[Profile] ${operation} Error:`, error?.message || error);

  const statusCode = error?.statusCode || 500;

  if (statusCode === 500) {
    return {
      statusCode,
      body: {
        success: false,
        error: `Failed to ${operation.toLowerCase()}`,
        message: error?.message || "Unknown error occurred",
        timestamp: new Date().toISOString(),
      },
    };
  }

  return {
    statusCode,
    body: {
      success: false,
      error: error.message,
    },
  };
}
