import { Navigate } from "react-router-dom";
import { getPriorityItem } from "../hooks/useLocalStorage";

interface PublicRouteProps {
  children: React.ReactNode;
}

/**
 * PublicRoute component that redirects authenticated users to dashboard.
 * Used for signin/signup pages to prevent logged-in users from accessing them.
 * Checks for JWT token in storage (context-free for route-level protection).
 */
export const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const authToken = getPriorityItem("auth_token");
  const token = getPriorityItem("token");

  const isAuthenticated = !!authToken || !!token;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
