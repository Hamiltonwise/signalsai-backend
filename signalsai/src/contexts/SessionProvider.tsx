import React, { useCallback, useMemo, type ReactNode } from "react";
import { SessionContext } from "./sessionContext";
import { getPriorityItem } from "../hooks/useLocalStorage";
import { queryClient } from "../lib/queryClient";

interface SessionProviderProps {
  children: ReactNode;
}

/**
 * Session provider — checks for JWT token and exposes disconnect (logout).
 */
export const SessionProvider: React.FC<SessionProviderProps> = ({
  children,
}) => {
  const authToken = getPriorityItem("auth_token");
  const token = getPriorityItem("token");
  const isAuthenticated = !!authToken || !!token;

  const disconnect = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("onboardingCompleted");
    localStorage.removeItem("hasProperties");

    // Clear pilot session data
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("pilot_mode");
    sessionStorage.removeItem("user_role");

    // Clear TanStack Query cache
    queryClient.clear();

    // Clear cookie for cross-app auth sync
    const isProduction = window.location.hostname.includes("getalloro.com");
    const domain = isProduction ? "; domain=.getalloro.com" : "";
    document.cookie = `auth_token=; path=/; max-age=0${domain}`;

    // Broadcast logout to other tabs
    try {
      const channel = new BroadcastChannel("auth_channel");
      channel.postMessage({ type: "logout" });
      channel.close();
    } catch {
      // BroadcastChannel not supported
    }

    window.location.href = "/signin";
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, disconnect }),
    [isAuthenticated, disconnect]
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

// Backward-compatible alias
export const GoogleAuthProvider = SessionProvider;
