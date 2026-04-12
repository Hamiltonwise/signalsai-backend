/**
 * useSubscriptionGate -- determines if premium content should be gated.
 *
 * Returns { locked, onSubscribe } for use with BlurGate and trial components.
 * Foundation/Heroes accounts are never gated. Active subscribers pass through.
 * Trial users with time remaining pass through. Everyone else is gated.
 */

import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/api/index";

export function useSubscriptionGate() {
  const navigate = useNavigate();
  const { userProfile, billingStatus } = useAuth();
  const orgId = userProfile?.organizationId || null;

  const { data: dashCtx } = useQuery<any>({
    queryKey: ["gate-ctx", orgId],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  const isSubscribed = billingStatus?.hasStripeSubscription || billingStatus?.isAdminGranted || false;
  const isFoundation = dashCtx?.org?.account_type === "foundation" || dashCtx?.org?.account_type === "heroes";
  const trial = dashCtx?.trial || null;
  const trialActive = trial ? trial.days_remaining > 0 : true; // No trial info = pass through

  // Locked: not subscribed, not foundation, and trial expired
  const locked = !isSubscribed && !isFoundation && !trialActive;

  const onSubscribe = () => navigate("/settings/billing");

  return { locked, onSubscribe, isSubscribed, isFoundation, trialActive };
}
