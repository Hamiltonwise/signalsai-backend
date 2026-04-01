import { Navigate } from "react-router-dom";
import { getPriorityItem } from "../hooks/useLocalStorage";
import { isSuperAdminEmail } from "../constants/superAdmins";

interface PublicRouteProps {
  children: React.ReactNode;
}

/**
 * PublicRoute component that redirects authenticated users based on role.
 * Super admins land on /hq/command, customers land on /dashboard.
 * Checks for JWT token in storage (context-free for route-level protection).
 */
export const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const authToken = getPriorityItem("auth_token");
  const token = getPriorityItem("token");

  const isAuthenticated = !!authToken || !!token;

  if (isAuthenticated) {
    const userEmail = getPriorityItem("user_email");
    const destination = isSuperAdminEmail(userEmail) ? "/hq/command" : "/dashboard";
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
};
