import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import { showSparkleToast } from "../../lib/toast";
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Lock,
  PenLine,
  Plus,
  Settings,
  ShieldCheck,
  // Target, // Temporarily unused - Practice Diagnosis hidden
  TrendingDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  fetchPmsKeyData,
  fetchActiveAutomationJobs,
  fetchAutomationStatus,
  updatePmsJobClientApproval,
  type PmsKeyDataResponse,
  type AutomationStatusDetail,
} from "../../api/pms";
import { PMSLatestJobEditor } from "./PMSLatestJobEditor";
import { PMSUploadWizardModal } from "./PMSUploadWizardModal";
import { TemplateUploadModal } from "./TemplateUploadModal";
import { DirectUploadModal } from "./DirectUploadModal";
import { PMSManualEntryModal } from "./PMSManualEntryModal";
import { ReferralMatrices, type ReferralEngineData } from "./ReferralMatrices";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../contexts/OnboardingWizardContext";
import { useLocationContext } from "../../contexts/locationContext";
import { apiGet } from "../../api";
import { getPriorityItem } from "../../hooks/useLocalStorage";

interface PMSVisualPillarsProps {
  domain?: string;
  organizationId?: number | null;
  locationId?: number | null;
  hasProperties?: boolean;
}

// Removed DEFAULT_DOMAIN - domain should always be provided by parent component
// to prevent race condition where wrong domain is used on initial render

const formatMonthLabel = (value: string): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
};

// New Design Components - Matching PMSStatistics.tsx
const MetricCard = ({
  label,
  value,
  sub,
  trend,
  isHighlighted,
  isLoading,
}: {
  label: string;
  value: string | number;
  sub: string;
  trend?: string;
  isHighlighted?: boolean;
  isLoading?: boolean;
}) => (
  <div
    className={`flex flex-col p-5 lg:p-6 rounded-2xl border transition-all ${
      isHighlighted
        ? "bg-white border-alloro-orange/20 shadow-premium"
        : "bg-white/60 border-slate-100 hover:bg-white"
    }`}
  >
    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 leading-none">
      {label}
    </span>
    <div className="flex items-center justify-between mb-2">
      {isLoading ? (
        <div className="h-8 w-20 bg-slate-200 rounded animate-pulse" />
      ) : (
        <span
          className={`text-2xl font-bold font-heading tracking-tighter leading-none ${
            isHighlighted ? "text-alloro-orange" : "text-alloro-navy"
          }`}
        >
          {value}
        </span>
      )}
      {!isLoading && trend && (
        <span
          className={`text-[9px] font-bold flex items-center gap-0.5 ${
            trend.startsWith("+") ? "text-green-600" : "text-red-500"
          }`}
        >
          {trend}{" "}
          {trend.startsWith("+") ? (
            <ArrowUpRight size={12} />
          ) : (
            <TrendingDown size={12} />
          )}
        </span>
      )}
    </div>
    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-none">
      {sub}
    </span>
  </div>
);

// Temporarily hidden - Practice Diagnosis section
// const DiagnosisBlock = ({ title, desc }: { title: string; desc: string }) => (
//   <div>
//     <h4 className="text-[10px] font-bold text-alloro-teal mb-1.5 uppercase tracking-widest leading-none">
//       {title}
//     </h4>
//     <p className="text-[13px] text-blue-100/60 leading-relaxed font-medium tracking-tight">
//       {desc}
//     </p>
//   </div>
// );

export const PMSVisualPillars: React.FC<PMSVisualPillarsProps> = ({
  domain,
  organizationId,
  locationId,
  hasProperties = true,
}) => {
  const navigate = useNavigate();
  const { signalContentReady } = useLocationContext();

  // Wizard state
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();

  // Connection status state - track if GBP is connected
  const [connectionStatus, setConnectionStatus] = useState<{
    gbpConnected: boolean;
    isLoading: boolean;
  }>({
    gbpConnected: false,
    isLoading: true,
  });

  const allServicesConnected = connectionStatus.gbpConnected;

  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [showTemplateUpload, setShowTemplateUpload] = useState(false);
  const [showDirectUpload, setShowDirectUpload] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  // Start with loading false if wizard is active (we'll show demo data immediately)
  const [isLoading, setIsLoading] = useState(!isWizardActive);
  const [error, setError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [keyData, setKeyData] = useState<PmsKeyDataResponse["data"] | null>(
    null,
  );
  const [localProcessing, setLocalProcessing] = useState(false);
  const [, setIsConfirming] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isIngestionHighlighted, setIsIngestionHighlighted] = useState(false);
  const [isApprovalBannerHighlighted, setIsApprovalBannerHighlighted] =
    useState(false);

  // Referral Engine data state
  const [referralData, setReferralData] = useState<ReferralEngineData | null>(
    null,
  );
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralPending, setReferralPending] = useState(false);
  const [automationStatus, setAutomationStatus] =
    useState<AutomationStatusDetail | null>(null);

  // Get user role for permission checks (sessionStorage for pilot mode, localStorage for normal)
  const userRole = getPriorityItem("user_role");
  const hasRolePermission = userRole === "admin" || userRole === "manager";
  // Can only upload PMS if user has role permission AND properties are connected (or wizard is active)
  const canUploadPMS = hasRolePermission && (hasProperties || isWizardActive);

  const storageKey = useMemo(
    () => `pmsProcessing:${organizationId || "unknown"}`,
    [organizationId],
  );

  const isMountedRef = useRef(false);

  const loadKeyData = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      // Guard: Skip loading during wizard mode - use demo data instead
      if (isWizardActive) {
        setIsLoading(false);
        return;
      }

      // Guard: Skip loading if organizationId is not available
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      if (!silent) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const response = await fetchPmsKeyData(organizationId, locationId);

        if (!isMountedRef.current) {
          return;
        }

        if (response?.success && response.data) {
          // Only log if not silent mode (to reduce console noise during polling)
          if (!silent) {
            console.log("📊 loadKeyData response:", {
              organizationId,
              monthsCount: response.data.months?.length,
              sourcesCount: response.data.sources?.length,
              stats: response.data.stats,
              months: response.data.months,
              sources: response.data.sources,
            });
          }
          setKeyData(response.data);
        } else {
          setKeyData(null);
          setError(
            response?.error ||
              response?.message ||
              "Unable to load PMS visual pillars.",
          );
        }
      } catch (err) {
        if (!isMountedRef.current) {
          return;
        }

        setKeyData(null);
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load PMS visual pillars.";
        setError(message);
      } finally {
        if (isMountedRef.current && !silent) {
          setIsLoading(false);
        }
        signalContentReady();
      }
    },
    [organizationId, locationId, isWizardActive],
  );

  useEffect(() => {
    isMountedRef.current = true;
    console.log("🎯 Initial component mount - loading key data for first time");
    loadKeyData();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadKeyData]);

  // Fetch connection status to check if all 3 Google services are connected
  useEffect(() => {
    const fetchConnectionStatus = async () => {
      // Skip in wizard mode - assume connected
      if (isWizardActive) {
        setConnectionStatus({
          gbpConnected: true,
          isLoading: false,
        });
        return;
      }

      try {
        const response = await apiGet({ path: "/settings/properties" });

        if (response.success) {
          setConnectionStatus({
            gbpConnected:
              response.properties?.gbp && response.properties.gbp.length > 0,
            isLoading: false,
          });
        } else {
          setConnectionStatus((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (err) {
        console.error("Failed to fetch connection status:", err);
        setConnectionStatus((prev) => ({ ...prev, isLoading: false }));
      }
    };

    fetchConnectionStatus();
  }, [isWizardActive]);

  // Sync loading state - handle both wizard mode AND normal mode
  // When wizard is active, show demo data immediately (no loading)
  // When wizard is NOT active but organizationId is missing, don't show loading forever
  useEffect(() => {
    if (isWizardActive) {
      // Wizard mode: immediately show demo data
      setIsLoading(false);
    } else if (!organizationId) {
      // No org yet but not in wizard: don't stay stuck loading forever
      // The parent (Dashboard.tsx) shows its own skeleton when org is undefined
      setIsLoading(false);
    }
  }, [isWizardActive, organizationId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setLocalProcessing(false);
      return;
    }

    const flag = window.localStorage.getItem(storageKey);
    setLocalProcessing(Boolean(flag));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || !detail.clientId || detail.clientId === domain) {
        setLocalProcessing(true);
        loadKeyData({ silent: true });
      }
    };

    window.addEventListener("pms:job-uploaded", handler as EventListener);
    return () => {
      window.removeEventListener("pms:job-uploaded", handler as EventListener);
    };
  }, [domain, loadKeyData]);

  const latestJobStatus = keyData?.stats?.latestJobStatus ?? null;
  const latestJobIsApproved = keyData?.stats?.latestJobIsApproved ?? null;
  const latestJobIsClientApproved =
    keyData?.stats?.latestJobIsClientApproved ?? null;
  const latestJobId = keyData?.stats?.latestJobId ?? null;
  const latestJobRaw = keyData?.latestJobRaw ?? null;

  const hasLatestJobRaw = useMemo(() => {
    if (latestJobRaw == null) {
      return false;
    }

    if (Array.isArray(latestJobRaw)) {
      return latestJobRaw.length > 0;
    }

    if (typeof latestJobRaw === "object") {
      return Object.keys(latestJobRaw as Record<string, unknown>).length > 0;
    }

    return true;
  }, [latestJobRaw]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // If there's no job at all, clear any stale localStorage flags
    if (latestJobId === null) {
      window.localStorage.removeItem(storageKey);
      setLocalProcessing(false);
      return;
    }

    if (latestJobIsApproved === true) {
      window.localStorage.removeItem(storageKey);
      setLocalProcessing(false);
    } else if (latestJobIsApproved === false) {
      setLocalProcessing(true);
    }
  }, [latestJobIsApproved, latestJobId, storageKey]);

  useEffect(() => {
    if (latestJobStatus?.toLowerCase() === "pending") {
      setLocalProcessing(true);
    }
  }, [latestJobStatus]);

  // Fetch Referral Engine data - skip during wizard mode (use demo data instead)
  const loadReferralData = useCallback(async () => {
    // Skip during wizard mode - use demo data instead
    if (isWizardActive) {
      setReferralLoading(false);
      return;
    }

    if (!organizationId) {
      setReferralLoading(false);
      return;
    }

    setReferralLoading(true);

    try {
      const locParam = locationId ? `?locationId=${locationId}` : "";
      const response = await fetch(
        `/api/agents/getLatestReferralEngineOutput/${organizationId}${locParam}`,
      );

      if (!response.ok) {
        setReferralData(null);
        setReferralPending(false);
        return;
      }

      const result = await response.json();

      // Check if referral engine output is pending (monthly agents still running)
      if (result.success && result.pending === true) {
        setReferralPending(true);
        setReferralData(null);
        return;
      }

      // Got actual data
      setReferralPending(false);
      if (result.success && result.data) {
        const dataToSet = Array.isArray(result.data)
          ? result.data[0]
          : result.data;
        setReferralData(dataToSet);
      }
    } catch (err) {
      console.error("Failed to fetch referral engine data:", err);
      setReferralData(null);
      setReferralPending(false);
    } finally {
      setReferralLoading(false);
    }
  }, [organizationId, locationId, isWizardActive]);

  useEffect(() => {
    loadReferralData();
  }, [loadReferralData]);

  // Check for active automation on mount (handles page refresh during automation)
  // Also handles the case where client approval banner should show the timeline
  // Skip during wizard mode - use demo data instead
  useEffect(() => {
    if (isWizardActive) return;

    const checkForActiveAutomation = async () => {
      if (!organizationId) return;

      console.log("🔍 Initial check for active automation on mount");

      try {
        const response = await fetchActiveAutomationJobs(organizationId, locationId);

        if (response.success && response.data?.jobs?.length) {
          const activeJob = response.data.jobs[0];
          console.log("🔍 Found active job on mount:", {
            jobId: activeJob.jobId,
            status: activeJob.automationStatus?.status,
            currentStep: activeJob.automationStatus?.currentStep,
          });

          if (activeJob?.automationStatus) {
            // Set automation status
            setAutomationStatus(activeJob.automationStatus);

            // If automation is still in progress (not completed), set pending state
            // This includes 'awaiting_approval' status for client confirmation step
            const activeStatuses = [
              "pending",
              "processing",
              "awaiting_approval",
            ];
            if (activeStatuses.includes(activeJob.automationStatus.status)) {
              console.log(
                "🔍 Setting referralPending = true for active automation",
              );
              setReferralPending(true);
              setReferralData(null);
            }
          }
        } else {
          console.log("🔍 No active automation found on mount");
        }
      } catch (err) {
        console.error("❌ Error checking for active automation:", err);
      }
    };

    checkForActiveAutomation();
  }, [organizationId, locationId, isWizardActive]); // Run when organizationId/locationId are available

  // Fetch automation status when processing is pending
  // Skip during wizard mode
  const loadAutomationStatus = useCallback(async () => {
    if (isWizardActive) {
      return;
    }

    if (!organizationId) {
      console.log("🔍 loadAutomationStatus: no organizationId");
      setAutomationStatus(null);
      return;
    }

    console.log("🔍 loadAutomationStatus: fetching for org", organizationId);

    try {
      const response = await fetchActiveAutomationJobs(organizationId, locationId);

      console.log("🔍 fetchActiveAutomationJobs response:", {
        success: response.success,
        jobCount: response.data?.jobs?.length,
        jobs: response.data?.jobs,
      });

      if (response.success && response.data?.jobs?.length) {
        // Get the most recent active job for this domain
        const activeJob = response.data.jobs[0];
        console.log("🔍 Active job found:", {
          jobId: activeJob.jobId,
          status: activeJob.automationStatus?.status,
          currentStep: activeJob.automationStatus?.currentStep,
        });

        if (activeJob?.automationStatus) {
          setAutomationStatus(activeJob.automationStatus);

          // If automation is complete, refresh referral data
          if (activeJob.automationStatus.status === "completed") {
            console.log("🔍 Automation completed, refreshing referral data");
            setReferralPending(false);
            loadReferralData();
          }

          // If automation reached client_approval, refresh key data so banner shows
          if (
            activeJob.automationStatus.status === "awaiting_approval" &&
            activeJob.automationStatus.currentStep === "client_approval"
          ) {
            console.log(
              "🔍 Automation reached client_approval, refreshing key data for banner",
            );
            loadKeyData({ silent: true });
          }
        }
      } else {
        // No active jobs found - automation might have completed
        console.log("🔍 No active jobs found, automation may have completed");

        // If we previously had an active automation, it means it completed
        // Clear the automation status and refresh the referral data
        if (automationStatus || referralPending) {
          console.log(
            "🔍 Clearing automation state and refreshing data after completion",
          );
          setAutomationStatus(null);
          setReferralPending(false);
          // Set loading state while we fetch the actual matrix data
          setReferralLoading(true);
          // Refresh referral data to show the actual matrix
          loadReferralData();
        } else {
          setAutomationStatus(null);
        }
      }
    } catch (err) {
      console.error("❌ Failed to fetch automation status:", err);
      setAutomationStatus(null);
    }
  }, [domain, organizationId, locationId, loadReferralData, loadKeyData, isWizardActive]);

  // Poll for automation status when referralPending is true OR when there's an active automation
  // This ensures real-time updates regardless of how the user got to this page
  // Uses sequential polling: wait for response, then wait 1 second before next request
  // Skip during wizard mode
  useEffect(() => {
    if (!domain || isWizardActive) return;

    // Define statuses that should trigger polling
    const activeStatuses = ["pending", "processing", "awaiting_approval"];

    // Steps where polling should NOT happen (nothing changes until user/admin acts)
    const noPollingSteps = ["client_approval"]; // Only skip polling for client_approval
    const noPollingStatuses = ["completed"]; // Don't poll when complete

    const isOnNonPollingStep =
      (automationStatus &&
        automationStatus.status === "awaiting_approval" &&
        noPollingSteps.includes(automationStatus.currentStep)) ||
      (automationStatus && noPollingStatuses.includes(automationStatus.status));

    const shouldPoll =
      !isOnNonPollingStep &&
      (referralPending ||
        (automationStatus && activeStatuses.includes(automationStatus.status)));

    if (!shouldPoll) {
      if (isOnNonPollingStep) {
        if (automationStatus?.status === "completed") {
          console.log(`⏸️ Polling DISABLED - automation completed`);
        } else {
          console.log(
            `⏸️ Polling DISABLED - on ${automationStatus?.currentStep} (approval step)`,
          );
        }
      }
      return;
    }

    console.log(
      `▶️ Polling ENABLED - referralPending: ${referralPending}, status: ${automationStatus?.status}, step: ${automationStatus?.currentStep}`,
    );

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const pollSequentially = async () => {
      if (isCancelled) return;

      try {
        await loadAutomationStatus();
      } catch (err) {
        console.error("Polling error:", err);
      }

      if (!isCancelled) {
        // Wait 1 second after response before next poll
        timeoutId = setTimeout(pollSequentially, 1000);
      }
    };

    // Start polling immediately
    pollSequentially();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [domain, referralPending, automationStatus?.status, loadAutomationStatus, isWizardActive]);

  // Background polling: Check for new automation jobs periodically
  // This catches cases where automation starts from admin panel while user is viewing page
  // Uses sequential polling: wait for response, then wait 10 seconds before next request
  // Skip during wizard mode
  useEffect(() => {
    if (!domain || isWizardActive || !organizationId) return;

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const checkForNewAutomation = async () => {
      if (isCancelled) return;

      try {
        const response = await fetchActiveAutomationJobs(organizationId, locationId);

        if (response.success && response.data?.jobs?.length) {
          const activeJob = response.data.jobs[0];

          if (activeJob?.automationStatus) {
            const status = activeJob.automationStatus.status;
            const activeStatuses = [
              "pending",
              "processing",
              "awaiting_approval",
            ];

            // If we found an active automation that we weren't tracking, start tracking it
            if (activeStatuses.includes(status)) {
              setAutomationStatus(activeJob.automationStatus);

              // Set referralPending to trigger the faster polling
              if (!referralPending) {
                setReferralPending(true);
                setReferralData(null);
              }
            }
          }
        }
      } catch (err) {
        console.error("Background automation check failed:", err);
      }

      if (!isCancelled) {
        // Wait 10 seconds after response before next background check
        timeoutId = setTimeout(checkForNewAutomation, 10000);
      }
    };

    // Start background polling after initial 10 second delay
    timeoutId = setTimeout(checkForNewAutomation, 10000);

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [domain, referralPending, isWizardActive]);

  // Fallback: Fetch automation status for specific job when client approval banner shows
  // but we don't have automation status from the active jobs endpoint
  // Skip during wizard mode
  useEffect(() => {
    if (isWizardActive) return;

    const fetchJobAutomationStatus = async () => {
      // Only run if:
      // 1. Client approval banner should be shown
      // 2. We don't already have automation status
      // 3. We have a valid latestJobId
      const shouldShowClientApproval =
        !isLoading &&
        latestJobIsApproved === true &&
        latestJobIsClientApproved !== true &&
        latestJobId !== null;

      if (!shouldShowClientApproval || automationStatus || !latestJobId) {
        return;
      }

      console.log("🔍 Fetching automation status for job", latestJobId);

      try {
        const response = await fetchAutomationStatus(latestJobId);

        if (response.success && response.data?.automationStatus) {
          console.log("🔍 Got automation status for job:", {
            jobId: latestJobId,
            status: response.data.automationStatus.status,
            currentStep: response.data.automationStatus.currentStep,
          });
          setAutomationStatus(response.data.automationStatus);
        }
      } catch (err) {
        console.error("❌ Failed to fetch job automation status:", err);
      }
    };

    fetchJobAutomationStatus();
  }, [
    isLoading,
    latestJobIsApproved,
    latestJobIsClientApproved,
    latestJobId,
    automationStatus,
    isWizardActive,
  ]);

  // Demo data for wizard mode - Referral Velocity
  const wizardMonthlyData = useMemo(() => {
    const demoData = wizardDemoData?.referralData?.monthlyData;
    if (!demoData) {
      // Fallback demo data
      return [
        { month: "Jan", selfReferrals: 12, doctorReferrals: 8, total: 20, totalReferrals: 20, productionTotal: 24000 },
        { month: "Feb", selfReferrals: 15, doctorReferrals: 10, total: 25, totalReferrals: 25, productionTotal: 30000 },
        { month: "Mar", selfReferrals: 18, doctorReferrals: 12, total: 30, totalReferrals: 30, productionTotal: 36000 },
        { month: "Apr", selfReferrals: 14, doctorReferrals: 11, total: 25, totalReferrals: 25, productionTotal: 30000 },
        { month: "May", selfReferrals: 20, doctorReferrals: 14, total: 34, totalReferrals: 34, productionTotal: 40000 },
        { month: "Jun", selfReferrals: 22, doctorReferrals: 13, total: 35, totalReferrals: 35, productionTotal: 42000 },
      ];
    }
    return demoData.map((m) => ({
      month: m.month,
      selfReferrals: m.marketing,
      doctorReferrals: m.doctor,
      total: m.marketing + m.doctor,
      totalReferrals: m.marketing + m.doctor,
      productionTotal: (m.marketing + m.doctor) * 1200,
    }));
  }, [wizardDemoData]);

  // Demo data for wizard mode - Referral Engine / Intelligence Hub
  const wizardReferralEngineData = useMemo((): ReferralEngineData => {
    return {
      observed_period: {
        start_date: "2025-01-01",
        end_date: "2025-06-30",
      },
      executive_summary: [
        "Marketing referrals show strong growth trajectory",
        "Doctor referral network expanding steadily",
        "Overall conversion rates above industry average",
      ],
      doctor_referral_matrix: [
        { referrer_name: "Dr. Sarah Johnson", referred: 12, pct_scheduled: 92, pct_examined: 85, pct_started: 75, net_production: 18500, trend_label: "increasing" },
        { referrer_name: "Dr. Michael Chen", referred: 8, pct_scheduled: 88, pct_examined: 80, pct_started: 70, net_production: 12000, trend_label: "stable" },
        { referrer_name: "Dr. Emily Davis", referred: 6, pct_scheduled: 95, pct_examined: 90, pct_started: 82, net_production: 10800, trend_label: "new" },
        { referrer_name: "Dr. Robert Wilson", referred: 5, pct_scheduled: 80, pct_examined: 75, pct_started: 65, net_production: 7500, trend_label: "decreasing" },
      ],
      non_doctor_referral_matrix: [
        { source_label: "Google Search", source_type: "digital", referred: 35, pct_scheduled: 78, pct_examined: 70, pct_started: 58, net_production: 42000, trend_label: "increasing" },
        { source_label: "Patient Referral", source_type: "patient", referred: 28, pct_scheduled: 95, pct_examined: 90, pct_started: 85, net_production: 52000, trend_label: "increasing" },
        { source_label: "Facebook Ads", source_type: "digital", referred: 18, pct_scheduled: 65, pct_examined: 55, pct_started: 45, net_production: 18000, trend_label: "stable" },
        { source_label: "Website Direct", source_type: "digital", referred: 14, pct_scheduled: 72, pct_examined: 65, pct_started: 55, net_production: 16800, trend_label: "new" },
      ],
      growth_opportunity_summary: {
        top_three_fixes: [
          "Increase follow-up on Google Search leads to improve conversion",
          "Implement patient referral program incentives",
          "Optimize Facebook ad targeting for higher quality leads",
        ],
        estimated_additional_annual_revenue: 45000,
      },
    };
  }, []);

  const monthlyData = useMemo(() => {
    // Use wizard demo data if wizard is active and no real data
    if (isWizardActive && !keyData?.months?.length) {
      return wizardMonthlyData;
    }

    if (!keyData?.months?.length) {
      return [];
    }

    return keyData.months.map((month) => {
      const selfReferrals = Number(month.selfReferrals ?? 0);
      const doctorReferrals = Number(month.doctorReferrals ?? 0);
      const totalReferrals = Number(month.totalReferrals ?? 0);
      const productionTotal = Number(month.productionTotal ?? 0);

      return {
        month: formatMonthLabel(month.month),
        selfReferrals,
        doctorReferrals,
        total: totalReferrals || selfReferrals + doctorReferrals,
        totalReferrals: totalReferrals || selfReferrals + doctorReferrals,
        productionTotal,
      };
    });
  }, [keyData, isWizardActive, wizardMonthlyData]);

  // Effective referral data - use wizard demo data if wizard is active and no real data
  const effectiveReferralData = useMemo(() => {
    if (isWizardActive && !referralData) {
      return wizardReferralEngineData;
    }
    return referralData;
  }, [isWizardActive, referralData, wizardReferralEngineData]);

  const latestTimestamp = keyData?.stats?.latestJobTimestamp
    ? new Date(keyData.stats.latestJobTimestamp)
    : null;

  // Temporarily unused - Data Confidence card removed
  // const monthCount = keyData?.stats?.distinctMonths ?? 0;

  // Calculate total production from sources
  const topSources = keyData?.sources ?? [];

  const totalProduction = useMemo(() => {
    const realProduction = topSources.reduce((sum, s) => sum + (s.production || 0), 0);
    // Use wizard demo data if wizard is active and no real production data
    if (isWizardActive && realProduction === 0) {
      return wizardDemoData?.referralData?.keyData?.mktProduction ?? 89000;
    }
    return realProduction;
  }, [topSources, isWizardActive, wizardDemoData]);

  const totalReferrals = useMemo(() => {
    return monthlyData.reduce((sum, m) => sum + m.totalReferrals, 0);
  }, [monthlyData]);

  // Temporarily unused - Practice Diagnosis hidden
  // const selfReferralCount = useMemo(() => {
  //   return monthlyData.reduce((sum, m) => sum + m.selfReferrals, 0);
  // }, [monthlyData]);

  const doctorReferralCount = useMemo(() => {
    return monthlyData.reduce((sum, m) => sum + m.doctorReferrals, 0);
  }, [monthlyData]);

  // Temporarily unused - Practice Diagnosis hidden
  // const marketingCapture =
  //   totalReferrals > 0
  //     ? Math.round((selfReferralCount / totalReferrals) * 100)
  //     : 0;

  const doctorPercentage = useMemo(() => {
    if (totalReferrals > 0) {
      return Math.round((doctorReferralCount / totalReferrals) * 100);
    }
    // Fallback for wizard mode when no real data
    if (isWizardActive) {
      const demoKeyData = wizardDemoData?.referralData?.keyData;
      if (demoKeyData) {
        const total = (demoKeyData.mktProduction ?? 0) + (demoKeyData.docProduction ?? 0);
        if (total > 0) {
          return Math.round(((demoKeyData.docProduction ?? 0) / total) * 100);
        }
      }
      return 43; // Fallback percentage
    }
    return 0;
  }, [totalReferrals, doctorReferralCount, isWizardActive, wizardDemoData]);

  // Debug: Log calculated data only on change (not on every render)
  useMemo(() => {
    console.log("📈 Calculated data:", {
      monthlyData: monthlyData,
      topSources: topSources,
      totalProduction: totalProduction,
      totalReferrals: totalReferrals,
      doctorReferralCount: doctorReferralCount,
      doctorPercentage: doctorPercentage,
      mktProduction: totalProduction,
      docProduction: (totalProduction * doctorPercentage) / 100,
    });
    console.log("🔍 Data source breakdown:", {
      "referralVelocity.selfReferrals": monthlyData.map((m) => ({
        month: m.month,
        selfReferrals: m.selfReferrals,
      })),
      "referralVelocity.doctorReferrals": monthlyData.map((m) => ({
        month: m.month,
        doctorReferrals: m.doctorReferrals,
      })),
      "productionCards.topSources": topSources.map((s) => ({
        name: s.name,
        production: s.production,
      })),
      "productionCards.totalProduction": totalProduction,
      "productionCards.doctorPercentage": doctorPercentage,
    });
  }, [
    monthlyData,
    topSources,
    totalProduction,
    totalReferrals,
    doctorReferralCount,
    doctorPercentage,
  ]);

  const showClientApprovalBanner =
    !isLoading &&
    latestJobIsApproved === true &&
    latestJobIsClientApproved !== true &&
    latestJobId !== null;

  // Only show processing notice if:
  // 1. Not loading
  // 2. Not showing client approval banner
  // 3. There's actually a job that exists (latestJobId is not null)
  // 4. Either localProcessing is true OR job status is pending
  // 5. The job is not yet admin approved (otherwise client approval banner shows)
  const showProcessingNotice =
    !isLoading &&
    !showClientApprovalBanner &&
    latestJobId !== null &&
    latestJobIsApproved !== true &&
    (localProcessing || latestJobStatus?.toLowerCase() === "pending");

  // Auto-open disabled - user requested manual control
  // useEffect(() => {
  //   if (showClientApprovalBanner && hasLatestJobRaw && latestJobId) {
  //     setIsEditorOpen(true);
  //   }
  // }, [showClientApprovalBanner, hasLatestJobRaw, latestJobId]);

  const handleConfirmApproval = useCallback(async () => {
    if (!latestJobId) {
      return;
    }

    console.log(
      "✅ handleConfirmApproval called with latestJobId:",
      latestJobId,
    );
    console.log("📊 Current state BEFORE confirmation:", {
      keyData_months: keyData?.months,
      keyData_sources: keyData?.sources,
      monthlyData: monthlyData,
      totalProduction: totalProduction,
      doctorPercentage: doctorPercentage,
      totalReferrals: totalReferrals,
    });

    setIsConfirming(true);
    setBannerError(null);

    // Immediately set pending state to hide stale data
    // This shows "Generating Your Attribution Matrix" right away
    setReferralPending(true);
    setReferralData(null);

    try {
      await updatePmsJobClientApproval(latestJobId, true);

      showSparkleToast(
        "Perfect!",
        "We're now setting up your summary and action items for this month",
      );

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(storageKey);
      }

      console.log(
        "🔄 Calling loadKeyData AFTER confirmation (with silent: false to see fresh data)",
      );
      await loadKeyData({ silent: false });

      // Don't refetch referral data immediately - it will return pending anyway
      // The user will see the "Generating" state until they refresh
      // or until we implement polling
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to confirm PMS data approval.";
      setBannerError(message);
      // Reset pending state on error
      setReferralPending(false);
    } finally {
      setIsConfirming(false);
    }
  }, [latestJobId, loadKeyData, storageKey]);

  const handleEditorSaved = useCallback(async () => {
    setIsEditorOpen(false);
    await loadKeyData();
  }, [loadKeyData]);

  const handleUploadWizardSuccess = useCallback(async () => {
    setShowUploadWizard(false);
    // Set pending state to show processing timeline
    setReferralPending(true);
    setReferralData(null);
    await loadKeyData({ silent: true });
    // Fetch automation status to show timeline progress
    await loadAutomationStatus();
  }, [loadKeyData, loadAutomationStatus]);

  // Get max value for bar chart scaling
  const maxBarValue = useMemo(() => {
    if (!monthlyData.length) return 25;
    return Math.max(
      ...monthlyData.map((m) => m.selfReferrals + m.doctorReferrals),
      25,
    );
  }, [monthlyData]);

  // Scroll to Data Ingestion Hub section with highlight animation
  const scrollToIngestionHub = useCallback(() => {
    const ingestionSection = document.getElementById("data-ingestion-hub");
    if (ingestionSection) {
      ingestionSection.scrollIntoView({ behavior: "smooth" });
      // Trigger highlight animation after short delay
      setTimeout(() => {
        setIsIngestionHighlighted(true);
        // Remove highlight after 700ms
        setTimeout(() => {
          setIsIngestionHighlighted(false);
        }, 700);
      }, 200);
    }
  }, []);

  // Check for scroll-to-upload flag from sessionStorage (set by PMSUploadBanner)
  useEffect(() => {
    const shouldScroll = sessionStorage.getItem("scrollToUpload");
    if (shouldScroll === "true") {
      sessionStorage.removeItem("scrollToUpload");
      // Delay to ensure component is fully rendered
      setTimeout(() => {
        scrollToIngestionHub();
      }, 500);
    }
  }, [scrollToIngestionHub]);

  // Scroll to Client Approval Banner with highlight animation
  const scrollToApprovalBanner = () => {
    const tryScroll = (attempts = 0) => {
      const approvalBanner = document.getElementById("client-approval-banner");
      if (approvalBanner) {
        approvalBanner.scrollIntoView({ behavior: "smooth", block: "center" });
        // Trigger highlight animation after short delay
        setTimeout(() => {
          setIsApprovalBannerHighlighted(true);
          // Remove highlight after 700ms
          setTimeout(() => {
            setIsApprovalBannerHighlighted(false);
          }, 700);
        }, 200);
      } else if (attempts < 3) {
        // Banner might not be rendered yet, retry after short delay
        setTimeout(() => tryScroll(attempts + 1), 100);
      } else {
        // Fallback: scroll to top where banner should appear
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    tryScroll();
  };

  // Show setup required screen if not all services are connected
  if (!connectionStatus.isLoading && !allServicesConnected && !isWizardActive) {
    const disconnectedServices = [];
    if (!connectionStatus.gbpConnected) disconnectedServices.push("Business Profile");

    return (
      <div className="min-h-screen bg-[#F8FAFC] font-body text-alloro-navy flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          {/* Welcome header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
              <span className="w-2 h-2 bg-alloro-orange rounded-full animate-pulse"></span>
              <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">
                Setup Required
              </span>
            </div>
            <h1 className="text-4xl font-black text-alloro-navy font-heading tracking-tight mb-3">
              Let's Set Up Your Dashboard
            </h1>
            <p className="text-lg text-slate-500 font-medium">
              Complete these two steps to unlock your practice insights
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {/* Step 1 - Connect Properties */}
            <div
              onClick={() => navigate("/settings")}
              className="group relative bg-white rounded-3xl border-2 border-alloro-orange shadow-xl shadow-alloro-orange/10 p-8 cursor-pointer hover:shadow-2xl hover:shadow-alloro-orange/20 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex items-start gap-6">
                {/* Step number */}
                <div className="shrink-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-alloro-orange to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-alloro-orange/30 group-hover:scale-110 transition-transform">
                    <span className="text-2xl font-black text-white">1</span>
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-black text-alloro-navy tracking-tight">
                      Connect Your Google Business Profile
                    </h3>
                    <span className="px-2 py-1 bg-alloro-orange/10 text-alloro-orange text-[10px] font-black uppercase tracking-wider rounded-lg">
                      Required
                    </span>
                  </div>
                  <p className="text-slate-500 font-medium leading-relaxed mb-3">
                    Link your Google Business Profile to enable tracking and insights.
                  </p>
                  <p className="text-sm text-amber-600 font-semibold">
                    Missing: {disconnectedServices.join(", ")}
                  </p>
                  <div className="flex items-center gap-2 text-alloro-orange font-bold text-sm group-hover:gap-3 transition-all mt-3">
                    <Settings className="w-4 h-4" />
                    <span>Go to Settings</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
              {/* Decorative arrow */}
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center z-10">
                <ChevronDown className="w-4 h-4 text-slate-300" />
              </div>
            </div>

            {/* Step 2 - PMS Data (Locked) */}
            <div className="relative bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-8 opacity-60">
              <div className="flex items-start gap-6">
                {/* Step number */}
                <div className="shrink-0">
                  <div className="w-14 h-14 bg-slate-200 rounded-2xl flex items-center justify-center">
                    <span className="text-2xl font-black text-slate-400">2</span>
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-black text-slate-400 tracking-tight">
                      Upload Your PMS Data
                    </h3>
                    <span className="px-2 py-1 bg-slate-200 text-slate-400 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Locked
                    </span>
                  </div>
                  <p className="text-slate-400 font-medium leading-relaxed">
                    Once properties are connected, upload your practice management
                    data to see referral analytics and revenue attribution.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Help text */}
          <p className="text-center text-sm text-slate-400 mt-8">
            Need help?{" "}
            <a
              href="mailto:support@alloro.io"
              className="text-alloro-orange font-semibold hover:underline"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-body text-alloro-navy">
      {/* Professional Header - Matching newdesign */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 lg:sticky lg:top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
              <BarChart3 size={20} />
            </div>
            <div>
              <h1 className="text-[10px] font-bold font-heading text-alloro-navy uppercase tracking-[0.2em]">
                Revenue Attribution
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  PMS Sync Verified
                </span>
                {latestTimestamp && (
                  <>
                    <span className="text-slate-300 mx-1">•</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      Updated {latestTimestamp.toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* CTA Button - Always visible */}
          <button
            onClick={scrollToIngestionHub}
            className="flex items-center gap-2.5 px-5 py-3 bg-alloro-orange hover:brightness-110 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-alloro-orange/20 active:scale-[0.98]"
          >
            <Plus size={16} />
            Enter Referral Data
          </button>
        </div>
      </header>

      <main className="w-full max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 space-y-12 lg:space-y-16">
        {/* Processing Notice Banner */}
        {showProcessingNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-3 rounded-2xl border border-alloro-teal/20 bg-alloro-teal/5 p-5 text-sm text-alloro-navy shadow-premium"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-alloro-teal/10 rounded-xl">
                <Clock className="h-5 w-5 text-alloro-teal" />
              </div>
              <div>
                <p className="font-bold text-alloro-navy text-sm">
                  Your latest PMS data is now being processed.
                </p>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">
                  We'll notify you when the analysis is complete.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Client Approval Banner */}
        {showClientApprovalBanner && (
          <motion.div
            id="client-approval-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col gap-4 rounded-2xl border bg-alloro-orange/5 p-6 sm:flex-row sm:items-center sm:justify-between shadow-premium transition-all duration-300 ${
              isApprovalBannerHighlighted
                ? "border-2 border-alloro-orange ring-8 ring-alloro-orange/30 scale-[1.01]"
                : "border-alloro-orange/20"
            }`}
          >
            <div className="flex-1 space-y-1">
              <div className="font-bold text-alloro-navy text-base">
                Your PMS data is processed.
              </div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">
                Review the latest results and confirm once everything looks
                good.
              </div>
              {bannerError && (
                <div className="flex items-center gap-2 text-xs text-red-600 mt-2">
                  <AlertCircle className="h-4 w-4" />
                  {bannerError}
                </div>
              )}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setIsEditorOpen(true)}
                disabled={latestJobId == null || !hasLatestJobRaw}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-alloro-orange bg-white px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-alloro-orange transition hover:bg-alloro-orange/5 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm and get insights
              </button>
            </div>
          </motion.div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm shadow-premium"
          >
            <div className="p-2 bg-red-100 rounded-xl">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-red-800">
                Unable to retrieve PMS data.
              </p>
              <p className="text-[10px] text-red-600 font-semibold uppercase tracking-widest mt-0.5">
                {error}
              </p>
            </div>
          </motion.div>
        )}

        {/* Main Content - Show titles during loading, with skeleton placeholders for data */}
        {!error && (keyData || isWizardActive || isLoading) && (
          <>
            {/* 1. ATTRIBUTION VITALS - Matching newdesign */}
            <section data-wizard-target="pms-attribution" className="space-y-4">
              <div className="flex items-center gap-4 px-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                  Your PMS Vitals (YTD)
                </h3>
                <div className="h-px flex-1 bg-slate-100"></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                <MetricCard
                  label="MKT Production"
                  value={`$${(totalProduction / 1000).toFixed(1)}K`}
                  sub="Marketing Attribution"
                  trend={monthlyData.length > 1 ? "+11%" : undefined}
                  isHighlighted
                  isLoading={isLoading}
                />
                <MetricCard
                  label="DOC Production"
                  value={`$${(
                    (totalProduction * doctorPercentage) /
                    100 /
                    1000
                  ).toFixed(1)}K`}
                  sub="Referral Attribution"
                  trend={monthlyData.length > 1 ? "+4%" : undefined}
                  isLoading={isLoading}
                />
                <MetricCard
                  label="Total Referrals"
                  value={totalReferrals.toString()}
                  sub="Synced Ledger"
                  isLoading={isLoading}
                />
              </div>
            </section>

            {/* 2. REFERRAL VELOCITY - Matching newdesign */}
            <section
              data-wizard-target="pms-velocity"
              className="bg-white rounded-2xl border border-slate-200 shadow-premium overflow-hidden"
            >
              <div className="px-6 sm:px-10 py-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <Calendar size={20} className="text-alloro-orange" />
                  <h2 className="text-xl font-bold font-heading text-alloro-navy tracking-tight">
                    Referral Velocity
                  </h2>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-alloro-orange"></div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      Marketing
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-alloro-navy"></div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      Doctor
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-6 sm:p-10 space-y-8 max-h-[500px] overflow-y-auto">
                {isLoading ? (
                  // Loading skeleton for velocity chart
                  <div className="space-y-6 animate-pulse">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center gap-8">
                        <div className="w-16 shrink-0">
                          <div className="h-4 w-12 bg-slate-200 rounded" />
                          <div className="h-2 w-8 bg-slate-100 rounded mt-1" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-slate-200 rounded-lg" style={{ width: `${70 - i * 15}%` }} />
                          <div className="h-2.5 bg-slate-100 rounded-lg" style={{ width: `${40 - i * 8}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {monthlyData.map((data, index) => (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8"
                      >
                        <div className="w-16 sm:text-right shrink-0">
                          <div className="text-[12px] font-bold text-alloro-navy uppercase">
                            {data.month}
                          </div>
                        </div>
                        <div className="flex-1 space-y-2.5">
                          <div className="relative h-4 flex items-center gap-4">
                            <motion.div
                              className="h-full bg-alloro-orange rounded-lg shadow-sm"
                              initial={{ width: 0 }}
                              animate={{
                                width: `${
                                  (data.selfReferrals / maxBarValue) * 100
                                }%`,
                              }}
                              transition={{
                                delay: index * 0.05 + 0.2,
                                duration: 0.6,
                                ease: "easeOut",
                              }}
                            />
                            <span className="text-[11px] font-bold text-alloro-navy tabular-nums">
                              {data.selfReferrals}
                            </span>
                          </div>
                          {data.doctorReferrals > 0 && (
                            <div className="relative h-2.5 flex items-center gap-4">
                              <motion.div
                                className="h-full bg-alloro-navy rounded-lg opacity-80"
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${
                                    (data.doctorReferrals / maxBarValue) * 100
                                  }%`,
                                }}
                                transition={{
                                  delay: index * 0.05 + 0.3,
                                  duration: 0.6,
                                  ease: "easeOut",
                                }}
                              />
                              <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                                {data.doctorReferrals}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {monthlyData.length === 0 && (
                      <div className="text-center py-12 text-slate-400">
                        <Calendar size={32} className="mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-semibold">
                          No monthly data available
                        </p>
                        <p className="text-[10px] uppercase tracking-widest mt-1">
                          Upload PMS data to see trends
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* 3. INTELLIGENCE HUB MATRICES - Always show, including during client approval */}
            {/* When client approval banner is shown, show the progress timeline at "Your confirmation" step */}
            <section data-wizard-target="pms-matrices" className="space-y-4">
              <div className="flex items-center gap-4 px-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                  Intelligence Hub Matrices
                </h3>
                <div className="h-px flex-1 bg-slate-100"></div>
              </div>
              <>
                <ReferralMatrices
                  referralData={effectiveReferralData}
                  isLoading={(isLoading || referralLoading) && !isWizardActive}
                  isPending={(referralPending || showClientApprovalBanner) && !isWizardActive}
                  automationStatus={isWizardActive ? null : automationStatus}
                  onConfirmationClick={scrollToApprovalBanner}
                />
              </>
            </section>

            {/* 4. INGESTION HUB - Matching newdesign full-width style */}
            {canUploadPMS ? (
              <section
                id="data-ingestion-hub"
                data-wizard-target="pms-upload"
                className={`bg-white rounded-2xl shadow-premium p-6 sm:p-10 lg:p-14 flex flex-col md:flex-row items-center justify-between gap-12 transition-all duration-300 ${
                  isIngestionHighlighted
                    ? "border-2 border-alloro-orange ring-8 ring-alloro-orange/30 scale-[1.01]"
                    : "border border-slate-100"
                }`}
              >
                <div className="space-y-8 flex-1 text-center">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-12 h-12 bg-alloro-orange/10 text-alloro-orange rounded-2xl flex items-center justify-center">
                      <PenLine size={24} />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-2xl sm:text-3xl font-bold font-heading text-alloro-navy tracking-tight leading-tight">
                      Update your referral data
                    </h3>
                    <p className="text-base sm:text-lg text-slate-400 font-normal tracking-tight leading-relaxed max-w-xl mx-auto">
                      Enter your monthly referral numbers directly. Takes about 2 minutes.
                      We recommend updating monthly for the most accurate analysis.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={() => setShowManualEntry(true)}
                      className="group inline-flex items-center gap-3 px-8 py-4 text-white rounded-2xl transition-all text-base font-semibold hover:brightness-110 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] bg-alloro-orange"
                    >
                      <PenLine size={20} />
                      Upload Month's Data
                    </button>
                    <p className="text-xs text-slate-400">
                      Need to backfill? You can enter data for any previous month too.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-6 pt-2">
                    <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      <Lock size={14} className="text-slate-300" /> HIPAA SECURE
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      <ShieldCheck size={14} className="text-green-500" /> ENCRYPTED
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section
                data-wizard-target="pms-upload"
                className="bg-white rounded-2xl border border-slate-100 shadow-premium p-6 sm:p-10 lg:p-14"
              >
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center">
                    {!hasProperties && !isWizardActive ? (
                      <Lock size={32} className="text-amber-600" />
                    ) : (
                      <AlertCircle size={32} className="text-amber-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-heading text-alloro-navy mb-2">
                      {!hasProperties && !isWizardActive ? "Connect Properties First" : "Upload Restricted"}
                    </h3>
                    <p className="text-sm text-slate-500 font-medium max-w-md">
                      {!hasProperties && !isWizardActive
                        ? "Please connect your Google Business Profile in Settings before uploading PMS data."
                        : "Only admins and managers can upload PMS data"}
                    </p>
                    {!hasProperties && !isWizardActive && (
                      <a
                        href="/settings"
                        className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-alloro-orange text-white rounded-xl text-sm font-bold hover:bg-alloro-orange/90 transition-colors"
                      >
                        Go to Settings
                      </a>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Practice Diagnosis Card - Temporarily hidden
              <section className="bg-alloro-navy rounded-2xl p-8 lg:p-10 text-white shadow-xl relative overflow-hidden border border-white/5">
                <div className="absolute top-0 right-0 p-40 bg-alloro-orange/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                <div className="relative z-10 space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-alloro-orange rounded-xl flex items-center justify-center shadow-lg border border-white/10">
                      <Target size={20} className="text-white" />
                    </div>
                    <h3 className="text-xl font-bold font-heading tracking-tight leading-none">
                      Practice Diagnosis
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <DiagnosisBlock
                      title="Acquisition Balance"
                      desc={`Marketing volume accounts for ${marketingCapture}% of Starts. ${
                        marketingCapture > 70
                          ? "Expanding peer networks is your primary growth lever."
                          : "Good balance between marketing and referrals."
                      }`}
                    />
                    <DiagnosisBlock
                      title="Data Confidence"
                      desc={`${monthCount} month${
                        monthCount !== 1 ? "s" : ""
                      } of PMS data analyzed. ${
                        monthCount >= 6
                          ? "High confidence attribution."
                          : "More data will improve insights."
                      }`}
                    />
                  </div>
                  <button className="w-full md:w-auto py-3.5 px-8 bg-alloro-orange rounded-xl text-[10px] font-bold uppercase tracking-widest hover:brightness-110 transition-all shadow-lg active:scale-95">
                    View Strategic Plan
                  </button>
                </div>
              </section>
              */}
          </>
        )}
      </main>

      {latestJobId && hasLatestJobRaw && (
        <PMSLatestJobEditor
          isOpen={isEditorOpen}
          jobId={latestJobId}
          initialData={latestJobRaw}
          onClose={() => setIsEditorOpen(false)}
          onSaved={handleEditorSaved}
          onConfirmApproval={handleConfirmApproval}
        />
      )}

      {/* Upload Wizard Modal - for "Not sure?" flow */}
      <PMSUploadWizardModal
        isOpen={showUploadWizard}
        onClose={() => setShowUploadWizard(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />

      {/* Template Upload Modal */}
      <TemplateUploadModal
        isOpen={showTemplateUpload}
        onClose={() => setShowTemplateUpload(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />

      {/* Direct Upload Modal */}
      <DirectUploadModal
        isOpen={showDirectUpload}
        onClose={() => setShowDirectUpload(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />

      {/* Manual Entry Modal */}
      <PMSManualEntryModal
        isOpen={showManualEntry}
        onClose={() => setShowManualEntry(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />
    </div>
  );
};
