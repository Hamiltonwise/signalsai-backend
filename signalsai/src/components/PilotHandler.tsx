import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export function PilotHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pilotToken = params.get("pilot_token");
    const userRole = params.get("user_role");

    if (pilotToken) {
      // Save to sessionStorage (not localStorage!) so it doesn't persist
      sessionStorage.setItem("token", pilotToken);
      sessionStorage.setItem("pilot_mode", "true");

      if (userRole) {
        sessionStorage.setItem("user_role", userRole);
      }

      // Clean URL and navigate to dashboard
      // Use replace to prevent going back to the token URL
      navigate("/dashboard", { replace: true });

      // Force reload to ensure all auth contexts re-initialize with the new token
      window.location.reload();
    }
  }, [location, navigate]);

  return null; // Invisible component
}
