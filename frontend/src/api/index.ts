import axios, { type ResponseType } from "axios";
import { getPriorityItem } from "../hooks/useLocalStorage";

// Prefer environment-configured API base; default to relative "/api" so Vite dev proxy handles CORS in development.
// Define VITE_API_URL in .env for deployments that need an absolute URL.
const api = (import.meta as any)?.env?.VITE_API_URL ?? "/api";

/**
 * Helper function to get common headers for API requests.
 * JWT is the sole authentication mechanism -- sent via Authorization header.
 *
 * In pilot mode the sessionStorage token must be used exclusively.
 * localStorage is shared across same-origin windows, so without this
 * guard the admin's auth_token bleeds into the pilot window.
 */
const getCommonHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};

  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  let jwt: string | null = null;

  if (isPilot) {
    // Pilot mode -- use ONLY the sessionStorage token, never localStorage
    jwt = window.sessionStorage.getItem("token");
  } else {
    // Normal mode -- auth_token (email/password) with getPriorityItem fallback
    jwt = getPriorityItem("auth_token") || getPriorityItem("token");
  }

  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  }

  return headers;
};

export async function apiGet({
  path,
  token,
}: {
  path: string;
  token?: string;
}) {
  try {
    const headers = getCommonHeaders();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const { data } = await axios.get(api + path, {
      headers,
    });
    return data;
  } catch (err: any) {
    console.log(err);
    if (err?.response?.data) {
      return err.response.data;
    }
    return {
      success: false,
      errorMessage: "An error occurred. Please try again.",
    };
  }
}

export async function apiPost({
  path,
  passedData = {},
  responseType = "json",
  additionalHeaders,
  token,
}: {
  path: string;
  passedData?: object | FormData;
  responseType?: ResponseType;
  additionalHeaders?: {
    Accept?: string;
    [key: string]: string | undefined;
  };
  token?: string;
}) {
  try {
    // Handle FormData differently - don't set Content-Type for FormData
    const isFormData = passedData instanceof FormData;

    // Start with common headers
    const headers: Record<string, string> = getCommonHeaders();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Only add additional headers if they exist and aren't Content-Type for FormData
    if (additionalHeaders) {
      Object.entries(additionalHeaders).forEach(([key, value]) => {
        if (value && !(isFormData && key.toLowerCase() === "content-type")) {
          headers[key] = value;
        }
      });
    }

    // For non-FormData, set default Content-Type if not provided
    if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    const { data } = await axios.post(api + path, passedData, {
      responseType,
      headers,
    });
    return data;
  } catch (err: any) {
    console.log(err);
    if (err?.response?.data) {
      return err.response.data;
    }
    return {
      success: false,
      errorMessage: "An error occurred. Please try again.",
    };
  }
}

export async function apiPatch({
  path,
  passedData = {},
  additionalHeaders,
}: {
  path: string;
  passedData?: object;
  additionalHeaders?: {
    Accept?: string;
    [key: string]: string | undefined;
  };
}) {
  try {
    // Start with common headers
    const headers: Record<string, string> = {
      ...getCommonHeaders(),
      "Content-Type": "application/json",
    };

    if (additionalHeaders) {
      Object.entries(additionalHeaders).forEach(([key, value]) => {
        if (value) {
          headers[key] = value;
        }
      });
    }

    const { data } = await axios.patch(api + path, passedData, {
      headers,
    });
    return data;
  } catch (err: any) {
    console.log(err);
    if (err?.response?.data) {
      return err.response.data;
    }
    return {
      success: false,
      errorMessage: "An error occurred. Please try again.",
    };
  }
}

export async function apiPut({
  path,
  passedData = {},
  additionalHeaders,
}: {
  path: string;
  passedData?: object;
  additionalHeaders?: {
    Accept?: string;
    [key: string]: string | undefined;
  };
}) {
  try {
    // Start with common headers
    const headers: Record<string, string> = {
      ...getCommonHeaders(),
      "Content-Type": "application/json",
    };

    if (additionalHeaders) {
      Object.entries(additionalHeaders).forEach(([key, value]) => {
        if (value) {
          headers[key] = value;
        }
      });
    }

    const { data } = await axios.put(api + path, passedData, {
      headers,
    });
    return data;
  } catch (err: any) {
    console.log(err);
    if (err?.response?.data) {
      return err.response.data;
    }
    return {
      success: false,
      errorMessage: "An error occurred. Please try again.",
    };
  }
}

export async function apiDelete({ path }: { path: string }) {
  try {
    const { data } = await axios.delete(api + path, {
      headers: getCommonHeaders(),
    });

    return data;
  } catch (err: any) {
    console.log(err);
    if (err?.response?.data) {
      return err.response.data;
    }
    return {
      success: false,
      errorMessage: "An error occurred. Please try again.",
    };
  }
}

// ─── Global 401 Interceptor ───
// When a JWT expires or is invalid the backend returns 401.
// Clear stored tokens and redirect to sign-in so the user does not sit
// on a zombie dashboard with loading skeletons forever.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      // Only redirect if the user had a token (avoid loops on public pages)
      const hadToken = !!(getPriorityItem("auth_token") || getPriorityItem("token"));
      if (hadToken) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("token");
        localStorage.removeItem("onboardingCompleted");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("pilot_mode");
        window.location.href = "/signin";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Global 402 Interceptor ───
// Emits custom events when billingGateMiddleware returns billing-related codes.
// AuthContext / Dashboard listens and updates UI immediately.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 402) {
      const errorCode = error?.response?.data?.errorCode;
      if (errorCode === "ACCOUNT_LOCKED") {
        window.dispatchEvent(new CustomEvent("billing:locked-out"));
      } else if (errorCode === "TRIAL_EXPIRED") {
        window.dispatchEvent(new CustomEvent("billing:trial-expired"));
      } else if (errorCode === "TRIAL_GRACE") {
        window.dispatchEvent(new CustomEvent("billing:trial-grace"));
      }
    }
    return Promise.reject(error);
  }
);
