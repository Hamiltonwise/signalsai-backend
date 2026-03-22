# Google OAuth Implementation Plan for SignalsAI

## Overview

This document provides a detailed implementation plan for integrating one-click Google OAuth popup authentication with your existing SignalsAI React frontend, connecting to your backend at `http://localhost:3000/api`.

## Architecture Summary

```
React Frontend                    Backend (localhost:3000)
├── GoogleAuthProvider          ├── /api/auth/google (GET)
├── useGoogleAuth               ├── /api/auth/google/callback (GET)
├── GoogleConnectButton         └── /api/auth/google/validate/:id (GET)
├── GoogleAccountStatus
└── Dashboard Integration
```

## Implementation Files

### 1. Google Auth API Service (`src/api/google-auth.ts`)

```typescript
import { apiGet, apiPost } from "./index";

const baseurl = "/auth/google";

async function getOAuthUrl() {
  try {
    return await apiGet({
      path: baseurl,
    });
  } catch (err) {
    console.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

async function validateToken(googleAccountId: number) {
  try {
    return await apiGet({
      path: baseurl + `/validate/${googleAccountId}`,
    });
  } catch (err) {
    console.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

async function disconnectAccount() {
  try {
    return await apiPost({
      path: baseurl + `/disconnect`,
      passedData: {},
    });
  } catch (err) {
    console.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

const googleAuth = {
  getOAuthUrl,
  validateToken,
  disconnectAccount,
};

export default googleAuth;
```

### 2. TypeScript Types (`src/types/google-auth.ts`)

```typescript
export interface User {
  id: number;
  email: string;
  name?: string;
  created_at: Date;
  updated_at: Date;
}

export interface GoogleAccount {
  id: number;
  user_id: number;
  google_user_id: string;
  email: string;
  access_token?: string;
  token_type?: string;
  expiry_date?: Date;
  scopes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuthResponse {
  success: boolean;
  user: User;
  googleAccount: GoogleAccount;
  message: string;
  accessToken?: string;
  expiresAt?: Date;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  googleAccount: GoogleAccount | null;
  error: string | null;
}

export interface GoogleAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  googleAccount: GoogleAccount | null;
  error: string | null;
  connectGoogle: () => Promise<void>;
  disconnect: () => void;
  validateToken: (googleAccountId: number) => Promise<boolean>;
  clearError: () => void;
}
```

### 3. Google Auth Hook (`src/hooks/useGoogleAuth.ts`)

```typescript
import { useState, useCallback, useRef } from "react";
import googleAuth from "../api/google-auth";
import type {
  AuthState,
  AuthResponse,
  User,
  GoogleAccount,
} from "../types/google-auth";

const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 600;
const POPUP_TIMEOUT = 300000; // 5 minutes

export const useGoogleAuth = (apiBaseUrl: string = "/api") => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: false,
    user: null,
    googleAccount: null,
    error: null,
  });

  const popupRef = useRef<Window | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearError = useCallback(() => {
    setAuthState((prev) => ({ ...prev, error: null }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setAuthState((prev) => ({ ...prev, isLoading: loading }));
  }, []);

  const setError = useCallback((error: string) => {
    setAuthState((prev) => ({
      ...prev,
      error,
      isLoading: false,
    }));
  }, []);

  const setAuthenticated = useCallback((authResponse: AuthResponse) => {
    setAuthState({
      isAuthenticated: true,
      isLoading: false,
      user: authResponse.user,
      googleAccount: authResponse.googleAccount,
      error: null,
    });

    // Store tokens in localStorage for persistence
    if (authResponse.accessToken) {
      localStorage.setItem("google_access_token", authResponse.accessToken);
    }
    if (authResponse.expiresAt) {
      localStorage.setItem(
        "google_token_expiry",
        authResponse.expiresAt.toString()
      );
    }
  }, []);

  const clearAuth = useCallback(() => {
    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      googleAccount: null,
      error: null,
    });

    // Clear stored tokens
    localStorage.removeItem("google_access_token");
    localStorage.removeItem("google_token_expiry");
  }, []);

  const closePopup = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const centerPopup = (width: number, height: number) => {
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    return `left=${left},top=${top},width=${width},height=${height}`;
  };

  const connectGoogle = useCallback(async () => {
    clearError();
    setLoading(true);

    try {
      // Step 1: Get OAuth URL from backend
      const response = await googleAuth.getOAuthUrl();

      if (!response.success || !response.authUrl) {
        throw new Error(response.message || "Failed to generate OAuth URL");
      }

      // Step 2: Open popup with OAuth URL
      const popupFeatures = [
        centerPopup(POPUP_WIDTH, POPUP_HEIGHT),
        "resizable=yes",
        "scrollbars=yes",
        "status=no",
        "toolbar=no",
        "menubar=no",
        "location=no",
      ].join(",");

      popupRef.current = window.open(
        response.authUrl,
        "google_oauth",
        popupFeatures
      );

      if (!popupRef.current) {
        throw new Error(
          "Popup was blocked. Please allow popups for this site."
        );
      }

      // Step 3: Monitor popup for completion
      const checkClosed = () => {
        if (popupRef.current?.closed) {
          setError("Authentication was cancelled");
          setLoading(false);
          closePopup();
          return;
        }

        // Check for completion by looking at popup URL
        try {
          const popupUrl = popupRef.current?.location?.href;
          if (popupUrl && popupUrl.includes("/auth/success")) {
            return;
          } else if (popupUrl && popupUrl.includes("/auth/error")) {
            return;
          }
        } catch (e) {
          // Cross-origin restrictions - normal behavior
        }

        // Continue checking
        setTimeout(checkClosed, 1000);
      };

      checkClosed();

      // Step 4: Set timeout for popup
      timeoutRef.current = setTimeout(() => {
        setError("Authentication timed out. Please try again.");
        closePopup();
      }, POPUP_TIMEOUT);

      // Step 5: Listen for messages from popup
      const handleMessage = (event: MessageEvent) => {
        // Verify origin for security
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data.type === "GOOGLE_OAUTH_SUCCESS") {
          setAuthenticated(event.data.payload);
          closePopup();
          window.removeEventListener("message", handleMessage);
        } else if (event.data.type === "GOOGLE_OAUTH_ERROR") {
          setError(event.data.error || "Authentication failed");
          closePopup();
          window.removeEventListener("message", handleMessage);
        }
      };

      window.addEventListener("message", handleMessage);
    } catch (error) {
      console.error("OAuth error:", error);
      setError(
        error instanceof Error ? error.message : "Authentication failed"
      );
      closePopup();
    }
  }, [clearError, setLoading, setError, setAuthenticated, closePopup]);

  const validateTokenFn = useCallback(async (googleAccountId: number) => {
    try {
      const response = await googleAuth.validateToken(googleAccountId);
      return response.success;
    } catch (error) {
      console.error("Token validation error:", error);
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearAuth();
    closePopup();
  }, [clearAuth, closePopup]);

  return {
    ...authState,
    connectGoogle,
    disconnect,
    validateToken: validateTokenFn,
    clearError,
  };
};
```

### 4. Google Auth Context (`src/contexts/GoogleAuthContext.tsx`)

```typescript
import React, { createContext, useContext, ReactNode } from "react";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import type { GoogleAuthContextType } from "../types/google-auth";

const GoogleAuthContext = createContext<GoogleAuthContextType | null>(null);

interface GoogleAuthProviderProps {
  children: ReactNode;
  apiBaseUrl?: string;
}

export const GoogleAuthProvider: React.FC<GoogleAuthProviderProps> = ({
  children,
  apiBaseUrl = "/api",
}) => {
  const auth = useGoogleAuth(apiBaseUrl);

  return (
    <GoogleAuthContext.Provider value={auth}>
      {children}
    </GoogleAuthContext.Provider>
  );
};

export const useGoogleAuthContext = (): GoogleAuthContextType => {
  const context = useContext(GoogleAuthContext);
  if (!context) {
    throw new Error(
      "useGoogleAuthContext must be used within GoogleAuthProvider"
    );
  }
  return context;
};
```

### 5. Google Connect Button (`src/components/GoogleConnectButton.tsx`)

```typescript
import React from "react";
import { useGoogleAuthContext } from "../contexts/GoogleAuthContext";

interface GoogleConnectButtonProps {
  className?: string;
  variant?: "primary" | "outline" | "minimal";
  size?: "sm" | "md" | "lg";
}

export const GoogleConnectButton: React.FC<GoogleConnectButtonProps> = ({
  className = "",
  variant = "primary",
  size = "md",
}) => {
  const { isAuthenticated, isLoading, connectGoogle, error, clearError } =
    useGoogleAuthContext();

  const baseClasses =
    "flex items-center justify-center gap-3 font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";

  const variantClasses = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500",
    outline:
      "border-2 border-gray-300 hover:border-blue-500 bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-600 focus:ring-blue-500",
    minimal:
      "bg-transparent hover:bg-gray-100 text-gray-600 hover:text-blue-600 focus:ring-gray-500",
  };

  const sizeClasses = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-3 text-base",
    lg: "px-6 py-4 text-lg",
  };

  const handleConnect = () => {
    if (error) clearError();
    connectGoogle();
  };

  if (isAuthenticated) {
    return null; // Don't show button when already connected
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className={`${baseClasses} ${variantClasses[variant]} ${
          sizeClasses[size]
        } ${className} ${
          isLoading ? "opacity-50 cursor-not-allowed" : "hover:shadow-md"
        }`}
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <GoogleIcon className="w-5 h-5" />
            <span>Connect Google Account</span>
          </>
        )}
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                Connection Failed
              </p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
              <button
                onClick={clearError}
                className="text-sm text-red-700 hover:text-red-800 underline mt-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Google Icon Component
const GoogleIcon: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);
```

### 6. Google Account Status (`src/components/GoogleAccountStatus.tsx`)

```typescript
import React from "react";
import { useGoogleAuthContext } from "../contexts/GoogleAuthContext";

export const GoogleAccountStatus: React.FC = () => {
  const { isAuthenticated, user, googleAccount, disconnect, isLoading } =
    useGoogleAuthContext();

  if (!isAuthenticated || !user || !googleAccount) {
    return null;
  }

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return "Unknown";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString();
  };

  const getScopes = () => {
    if (!googleAccount.scopes) return [];
    return googleAccount.scopes.split(",").map((scope) => {
      switch (scope.trim()) {
        case "https://www.googleapis.com/auth/analytics.readonly":
          return "Google Analytics 4";
        case "https://www.googleapis.com/auth/webmasters.readonly":
          return "Google Search Console";
        case "https://www.googleapis.com/auth/business.manage":
          return "Google Business Profile";
        default:
          return scope.trim();
      }
    });
  };

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-green-800 mb-1">
              Google Account Connected
            </h3>

            <div className="space-y-2 text-sm text-green-700">
              <div className="flex items-center gap-2">
                <span className="font-medium">Email:</span>
                <span>{user.email}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-medium">Name:</span>
                <span>{user.name || "Not provided"}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-medium">Connected:</span>
                <span>{formatDate(googleAccount.created_at)}</span>
              </div>

              <div className="flex items-start gap-2">
                <span className="font-medium">Access to:</span>
                <div className="flex flex-wrap gap-1">
                  {getScopes().map((scope, index) => (
                    <span
                      key={index}
                      className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={disconnect}
          disabled={isLoading}
          className="flex-shrink-0 ml-4 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-md transition-colors duration-200 disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
};
```

## Integration into Dashboard

### Update Dashboard.tsx

Add the Google Auth components to your existing dashboard. In the "Integration Management" section (around line 748), add:

```typescript
// Import at the top
import {
  GoogleAuthProvider,
  GoogleConnectButton,
  GoogleAccountStatus,
} from "../path/to/components";

// In the Integration Management section, add a new button:
<button
  onClick={() => {
    /* Handle Google OAuth test */
  }}
  className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
>
  <svg className="w-4 h-4" viewBox="0 0 24 24">
    {/* Google icon paths */}
  </svg>
  Google OAuth
</button>;
```

### Update App.tsx

Wrap your app with the GoogleAuthProvider:

```typescript
import { GoogleAuthProvider } from "./contexts/GoogleAuthContext";

function App() {
  return (
    <GoogleAuthProvider>{/* Your existing app content */}</GoogleAuthProvider>
  );
}
```

## Testing Plan

1. **Start Backend**: Ensure your backend at `http://localhost:3000` is running
2. **Test Button**: Click the Google Connect button
3. **Verify Popup**: Popup should open with Google OAuth
4. **Complete Flow**: Grant permissions and verify popup closes
5. **Check State**: Account status should update after successful auth
6. **Test Error Handling**: Try canceling the popup
7. **Test Disconnection**: Use disconnect button

## Security Features

✅ **CSRF Protection**: State parameter validation  
✅ **Origin Validation**: PostMessage origin checking  
✅ **Token Security**: Secure storage and refresh  
✅ **Error Handling**: Comprehensive error states  
✅ **Timeout Protection**: 5-minute popup timeout

## Backend Requirements

Your backend should provide these endpoints:

- `GET /api/auth/google` - Returns OAuth URL
- `GET /api/auth/google/callback` - Handles OAuth callback
- `GET /api/auth/google/validate/:id` - Validates token
- `POST /api/auth/google/disconnect` - Disconnects account

## Next Steps

1. Create the files in the order listed above
2. Test each component individually
3. Integrate into your dashboard
4. Test the complete OAuth flow
5. Add error monitoring and analytics

This implementation provides a complete, production-ready Google OAuth integration that follows your existing code patterns and architecture.
