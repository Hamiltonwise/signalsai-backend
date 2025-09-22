# Auth Data Persistence Analysis & Fix

## ✅ Backend Persistence (WORKING)

Your backend **DOES save auth data** on first sign-in! Here's what gets stored:

### Database Tables Populated:

**1. `users` table:**

```typescript
{
  id: auto_increment,
  email: "user@example.com",
  name: "User Name",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z"
}
```

**2. `google_accounts` table:**

```typescript
{
  id: auto_increment,
  user_id: 123,
  google_user_id: "google_id_string",
  email: "user@example.com",
  refresh_token: "encrypted_refresh_token", // ✅ SAVED
  access_token: "encrypted_access_token",   // ✅ SAVED
  token_type: "Bearer",
  expiry_date: "2024-01-01T01:00:00Z",     // ✅ SAVED
  scopes: "https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/business.manage", // ✅ SAVED
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z"
}
```

## ❌ Frontend Persistence Issue

The current frontend implementation has a **persistence gap** - it doesn't restore auth state after page refresh.

### Current Problem:

- User signs in ✅
- Backend saves to database ✅
- Frontend shows connected state ✅
- User refreshes page ❌ - appears disconnected
- But data is still in backend database ✅

### Solution: Enhanced useGoogleAuth Hook

Replace the `useGoogleAuth` hook with this enhanced version:

```typescript
// Enhanced hooks/useGoogleAuth.ts with persistence
import { useState, useCallback, useRef, useEffect } from "react";

// ... (interfaces remain the same) ...

export const useGoogleAuth = (apiBaseUrl: string = "/api") => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true, // Start with loading true
    user: null,
    googleAccount: null,
    error: null,
  });

  const popupRef = useRef<Window | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Restore auth state from localStorage on mount
  useEffect(() => {
    const restoreAuthState = async () => {
      try {
        const storedAuth = localStorage.getItem("signalsai_auth_data");

        if (!storedAuth) {
          setAuthState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const authData = JSON.parse(storedAuth);

        // Check if stored data is expired
        if (authData.expiresAt && new Date(authData.expiresAt) < new Date()) {
          console.log("[AUTH] Stored auth data expired, clearing...");
          clearAuth();
          return;
        }

        // Check if data is not too old (7 days max)
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        if (
          authData.timestamp &&
          new Date().getTime() - new Date(authData.timestamp).getTime() > maxAge
        ) {
          console.log("[AUTH] Stored auth data too old, clearing...");
          clearAuth();
          return;
        }

        // Validate with backend (optional but recommended)
        if (authData.googleAccount?.id) {
          const isValid = await validateStoredToken(authData.googleAccount.id);
          if (!isValid) {
            console.log("[AUTH] Backend validation failed, clearing...");
            clearAuth();
            return;
          }
        }

        // Restore auth state
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: authData.user,
          googleAccount: authData.googleAccount,
          error: null,
        });

        console.log("[AUTH] Restored auth state from localStorage");
      } catch (error) {
        console.error("[AUTH] Error restoring auth state:", error);
        clearAuth();
      }
    };

    restoreAuthState();
  }, []);

  const validateStoredToken = async (
    googleAccountId: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `${apiBaseUrl}/auth/google/validate/${googleAccountId}`
      );
      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error("[AUTH] Token validation error:", error);
      return false;
    }
  };

  const setAuthenticated = useCallback((authResponse: AuthResponse) => {
    setAuthState({
      isAuthenticated: true,
      isLoading: false,
      user: authResponse.user,
      googleAccount: authResponse.googleAccount,
      error: null,
    });

    // Store complete auth data for persistence
    const authData = {
      user: authResponse.user,
      googleAccount: authResponse.googleAccount,
      accessToken: authResponse.accessToken,
      expiresAt: authResponse.expiresAt,
      timestamp: new Date().toISOString(),
    };

    localStorage.setItem("signalsai_auth_data", JSON.stringify(authData));

    // Also store tokens separately for easy access
    if (authResponse.accessToken) {
      localStorage.setItem("google_access_token", authResponse.accessToken);
    }
    if (authResponse.expiresAt) {
      localStorage.setItem(
        "google_token_expiry",
        authResponse.expiresAt.toString()
      );
    }

    console.log("[AUTH] Auth data persisted to localStorage");
  }, []);

  const clearAuth = useCallback(() => {
    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      googleAccount: null,
      error: null,
    });

    // Clear all stored auth data
    localStorage.removeItem("signalsai_auth_data");
    localStorage.removeItem("google_access_token");
    localStorage.removeItem("google_token_expiry");

    console.log("[AUTH] Auth data cleared from localStorage");
  }, []);

  // ... (rest of the hook remains the same) ...
};
```

## ✅ Complete Persistence Flow

With this fix:

1. **First Sign-In:**

   - User clicks "Connect Google" ✅
   - Popup opens, user authorizes ✅
   - Backend saves to database ✅
   - Frontend saves to localStorage ✅
   - User sees connected state ✅

2. **Page Refresh:**

   - Frontend checks localStorage ✅
   - Validates data freshness ✅
   - Optionally validates with backend ✅
   - Restores connected state ✅

3. **Token Expiry:**
   - Backend auto-refreshes using refresh_token ✅
   - Frontend validates and updates if needed ✅

## 🧪 Testing Persistence

```javascript
// Test in browser console:

// 1. After signing in, check storage:
console.log("Stored auth:", localStorage.getItem("signalsai_auth_data"));

// 2. Refresh page - should remain connected

// 3. Clear storage to test fresh state:
localStorage.clear();
// Refresh - should show disconnected
```

## 🔄 Migration Strategy

If users are already signed in but frontend loses state after refresh:

1. **Add Backend Route** to fetch current user's auth status:

```typescript
// Add to your auth.ts
router.get("/auth/me", async (req, res) => {
  // Check if user has valid session/token
  // Return user + googleAccount data if valid
  // Frontend can call this to restore state
});
```

2. **Fallback in Frontend:**

```typescript
// If no localStorage data, try fetching from backend
if (!storedAuth) {
  const currentUser = await fetch("/api/auth/me");
  if (currentUser.ok) {
    const userData = await currentUser.json();
    // Restore state from backend
  }
}
```

Your backend persistence is solid - this fix ensures the frontend matches that reliability!
