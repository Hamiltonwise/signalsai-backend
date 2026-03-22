import { createContext, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface AuthSyncContextType {
  logout: () => void;
}

const AuthSyncContext = createContext<AuthSyncContextType | null>(null);

export function AuthSyncProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for auth events from other tabs/apps
    const channel = new BroadcastChannel("auth_channel");

    channel.onmessage = (event) => {
      const { type, token } = event.data;

      if (type === "login" && token) {
        // Another app logged in - update our token
        localStorage.setItem("auth_token", token);
        window.location.reload();
      } else if (type === "logout") {
        // Another app logged out - clear our token and redirect
        localStorage.removeItem("auth_token");
        navigate("/login");
      }
    };

    return () => {
      channel.close();
    };
  }, [navigate]);

  const logout = () => {
    // Clear token
    localStorage.removeItem("auth_token");

    // Broadcast logout event
    const channel = new BroadcastChannel("auth_channel");
    channel.postMessage({ type: "logout" });
    channel.close();

    // Redirect to login
    navigate("/login");
  };

  return (
    <AuthSyncContext.Provider value={{ logout }}>
      {children}
    </AuthSyncContext.Provider>
  );
}

export function useAuthSync() {
  const context = useContext(AuthSyncContext);
  if (!context) {
    throw new Error("useAuthSync must be used within AuthSyncProvider");
  }
  return context;
}
