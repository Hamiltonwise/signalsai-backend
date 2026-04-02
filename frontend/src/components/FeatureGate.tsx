/**
 * FeatureGate -- Renders children ONLY if the feature flag is enabled.
 *
 * If the gate is closed, children are removed from the DOM entirely.
 * Not hidden. Not grayed out. Gone.
 *
 * This prevents copy from promising features that aren't wired.
 * If the UI says "send review requests," the feature must be enabled.
 *
 * Usage:
 *   <FeatureGate feature="review_requests" orgId={orgId}>
 *     <ReviewRequestButton />
 *   </FeatureGate>
 */

import type { ReactNode } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

interface FeatureGateProps {
  /** The feature flag name to check */
  feature: string;
  /** The org ID to check against */
  orgId?: number;
  /** Content to render when the feature is enabled */
  children: ReactNode;
  /** Optional fallback when disabled (default: nothing) */
  fallback?: ReactNode;
}

export function FeatureGate({ feature, orgId, children, fallback = null }: FeatureGateProps) {
  const { data: flags, isLoading } = useFeatureFlags(orgId);

  // While loading, don't flash content -- show nothing
  if (isLoading) return null;

  // If flag is enabled, render children
  if (flags?.[feature]) return <>{children}</>;

  // Otherwise, render fallback (default: nothing)
  return <>{fallback}</>;
}
