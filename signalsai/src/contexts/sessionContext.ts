import { createContext, useContext } from "react";

export interface SessionContextType {
  isAuthenticated: boolean;
  disconnect: () => void;
}

/**
 * Session context — provides auth state and logout functionality.
 */
export const SessionContext = createContext<
  SessionContextType | undefined
>(undefined);

/**
 * Hook to access session auth state and logout.
 */
export const useSession = (): SessionContextType => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error(
      "useSession must be used within SessionProvider"
    );
  }
  return context;
};

// Backward-compatible aliases
export const GoogleAuthContext = SessionContext;
export const useGoogleAuthContext = useSession;
