import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiGet } from "../api";

interface DFYRouteProps {
  children: React.ReactNode;
}

/**
 * DFYRoute - Tier-aware route wrapper
 *
 * Protects DFY-tier routes by:
 * 1. Checking org tier before rendering children
 * 2. Redirecting to /dashboard if tier check fails
 * 3. Showing loading state during tier check
 *
 * Defense in depth: Backend still validates on every API call.
 */
export function DFYRoute({ children }: DFYRouteProps) {
  const [checking, setChecking] = useState(true);
  const [hasDFY, setHasDFY] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkTier = async () => {
      try {
        await apiGet({ path: "/user/website" });
        setHasDFY(true);
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 403) {
          toast.error("Website project is not available yet");
        } else {
          console.error("[DFYRoute] Tier check failed:", error);
        }
        navigate("/dashboard", { replace: true });
      } finally {
        setChecking(false);
      }
    };

    checkTier();
  }, [navigate]);

  if (checking) {
    return (
      <div className="flex h-screen bg-alloro-bg animate-pulse">
        {/* Sidebar skeleton */}
        <div className="w-64 bg-white border-r border-black/5 p-4 space-y-4">
          <div className="h-6 w-32 bg-slate-200 rounded" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-xl" />
            ))}
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="flex-1 p-6 space-y-6">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-[70vh] bg-slate-100 rounded-2xl" />
        </div>
        {/* Right panel skeleton */}
        <div className="w-96 bg-white border-l border-black/5 p-4 space-y-4">
          <div className="h-6 w-24 bg-slate-200 rounded" />
          <div className="h-4 w-48 bg-slate-100 rounded" />
          <div className="mt-8 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-4 bg-slate-100 rounded" style={{ width: `${80 - i * 15}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return hasDFY ? <>{children}</> : null;
}
