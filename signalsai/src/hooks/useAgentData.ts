import { useIsWizardActive } from "../contexts/OnboardingWizardContext";
import { useAgentDataQuery } from "./queries/useDashboardQueries";

/**
 * Backward-compatible wrapper around TanStack Query hook.
 * Returns the same { data, loading, error, refetch } shape as before.
 */
export function useAgentData(organizationId: number | null, locationId?: number | null) {
  const isWizardActive = useIsWizardActive();
  const { data, isLoading, error, refetch } = useAgentDataQuery(
    organizationId,
    locationId,
    isWizardActive,
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch,
  };
}
