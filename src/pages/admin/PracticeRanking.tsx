import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Star,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Trophy,
  Zap,
  Trash2,
  Users,
  Layers,
  Info,
  Loader2,
  BarChart3,
  Check,
  Building,
  Building2,
  Target,
} from "lucide-react";
import { fetchOrganizations } from "../../api/agentOutputs";
import { toast } from "react-hot-toast";
import {
  AdminPageHeader,
  ActionButton,
  EmptyState,
  Badge,
  HorizontalProgressBar,
} from "../../components/ui/DesignSystem";
import {
  staggerContainer,
  cardVariants,
  fadeInUp,
  expandCollapse,
  chevronVariants,
} from "../../lib/animations";
import { useConfirm } from "../../components/ui/ConfirmModal";

// GBP Location from the API
interface GbpLocation {
  accountId: string;
  locationId: string;
  displayName: string;
  address?: string;
}

interface GoogleAccount {
  id: number;
  domain: string;
  practiceName: string;
  hasGbp: boolean;
  gbpLocations: GbpLocation[];
  gbpCount: number;
}

// Location form state for multi-location trigger (simplified - specialty/location auto-detected)
interface LocationFormData {
  gbpAccountId: string;
  gbpLocationId: string;
  gbpLocationName: string;
}

interface StatusDetail {
  currentStep: string;
  message: string;
  progress: number;
  stepsCompleted: string[];
  timestamps: Record<string, string>;
}

// Search params from Identifier Agent for Apify
interface SearchParams {
  city?: string | null;
  state?: string | null;
  county?: string | null;
  postalCode?: string | null;
}

interface RankingJob {
  id: number;
  organizationId?: number;
  organization_id?: number;
  location_id?: number | null;
  organization_name?: string | null;
  location_name?: string | null;
  specialty: string;
  location: string | null;
  rankKeywords?: string | null;
  rank_keywords?: string | null;
  gbpLocationId?: string | null;
  gbp_location_id?: string | null;
  gbpLocationName?: string | null;
  gbp_location_name?: string | null;
  batchId?: string | null;
  batch_id?: string | null;
  status: string;
  rankScore?: number | null;
  rank_score?: number | null;
  rankPosition?: number | null;
  rank_position?: number | null;
  totalCompetitors?: number | null;
  total_competitors?: number | null;
  observedAt?: string;
  observed_at?: string;
  createdAt?: string;
  created_at?: string;
  statusDetail?: StatusDetail | null;
  status_detail?: StatusDetail | null;
  // Search params used for Apify (for debugging)
  searchParams?: SearchParams | null;
}

// Helper to normalize job data (handle both camelCase and snake_case)
const normalizeJob = (job: RankingJob): RankingJob => ({
  ...job,
  organization_id: job.organizationId || job.organization_id,
  gbp_location_id: job.gbpLocationId || job.gbp_location_id,
  gbp_location_name: job.gbpLocationName || job.gbp_location_name,
  batch_id: job.batchId || job.batch_id,
  rank_score: job.rankScore ?? job.rank_score,
  rank_position: job.rankPosition ?? job.rank_position,
  total_competitors: job.totalCompetitors ?? job.total_competitors,
  observed_at: job.observedAt || job.observed_at,
  created_at: job.createdAt || job.created_at,
  status_detail: job.statusDetail || job.status_detail,
});

// Batch status for polling
interface BatchStatus {
  batchId: string;
  status: "processing" | "completed" | "failed";
  totalLocations: number;
  completedLocations: number;
  failedLocations: number;
  currentLocationIndex: number;
  currentLocationName: string;
  rankingIds: number[];
  progress: number;
  errors?: Array<{ locationId: string; error: string; attempt: number }>;
}

interface RankingResult {
  id: number;
  specialty: string;
  location: string | null;
  rankKeywords?: string | null;
  gbpLocationId?: string | null;
  gbpLocationName?: string | null;
  // Search params used for Apify (for debugging)
  searchParams?: SearchParams | null;
  observedAt: string;
  rankScore: number | string;
  rankPosition: number;
  totalCompetitors: number;
  rankingFactors: {
    category_match: {
      score: number;
      weighted: number;
      weight: number;
      details?: string;
    };
    review_count: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
      details?: string;
    };
    star_rating: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
      details?: string;
    };
    keyword_name: {
      score: number;
      weighted: number;
      weight: number;
      details?: string;
    };
    review_velocity: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
      details?: string;
    };
    nap_consistency: {
      score: number;
      weighted: number;
      weight: number;
      details?: string;
    };
    gbp_activity: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
      details?: string;
    };
    sentiment: {
      score: number;
      weighted: number;
      weight: number;
      details?: string;
    };
  } | null;
  rawData: {
    client_gbp: {
      totalReviewCount?: number;
      averageRating?: number;
      primaryCategory?: string;
      reviewsLast30d?: number;
      postsLast30d?: number;
      photosCount?: number;
      hasWebsite?: boolean;
      hasPhone?: boolean;
      hasHours?: boolean;
      performance?: {
        calls?: number;
        directions?: number;
        clicks?: number;
      };
      gbpLocationId?: string;
      gbpLocationName?: string;
      _raw?: unknown;
    } | null;
    competitors: Record<string, unknown>[];
    competitors_discovered?: number;
    competitors_from_cache?: boolean;
    website_audit: Record<string, unknown> | null;
  } | null;
  llmAnalysis: {
    gaps: Array<{
      type: string;
      query_class?: string;
      area?: string;
      impact: string;
      reason: string;
    }>;
    drivers: Array<{
      factor: string;
      weight: string | number;
      direction: string;
    }>;
    render_text: string;
    client_summary?: string | null;
    top_recommendations?: Array<{
      priority: number;
      title: string;
      description?: string;
      expected_outcome?: string;
      impact?: string;
      effort?: string;
      timeline?: string;
    }>;
    verdict: string;
    confidence: number;
  } | null;
}

// Ranking Task from the tasks endpoint
interface RankingTask {
  id: number;
  title: string;
  description: string;
  status: string;
  category: string;
  agentType: string;
  isApproved: boolean;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  metadata: {
    practiceRankingId: number | null;
    gbpLocationId: string | null;
    gbpLocationName: string | null;
    priority: string | null;
    impact: string | null;
    effort: string | null;
    timeline: string | null;
  };
}

// Group structure for display - flat batch list
interface BatchGroup {
  batchId: string;
  organization_id: number | null;
  organization_name: string | null;
  jobs: RankingJob[];
  status: "processing" | "completed" | "failed" | "pending";
  createdAt: Date;
  totalLocations: number;
  completedLocations: number;
}

// Month group for card layout
interface MonthGroup {
  label: string; // e.g. "February 2026"
  sortKey: string; // e.g. "2026-02"
  batches: BatchGroup[];
}

const getWeekLabel = (date: Date): string => {
  const ordinals = ["1st", "2nd", "3rd", "4th", "5th"];
  const week = Math.ceil(date.getDate() / 7);
  const month = date.toLocaleDateString("en-US", { month: "long" });
  return `${month} ${ordinals[week - 1]} Week`;
};

// Filter Dropdown Component
interface FilterDropdownOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface FilterDropdownProps {
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  icon?: React.ReactNode;
  label?: string;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select...",
  icon,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      )}
      <div ref={dropdownRef} className="relative">
        <motion.button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 disabled:opacity-50 disabled:cursor-not-allowed"
          whileHover={{ scale: disabled ? 1 : 1.01 }}
          whileTap={{ scale: disabled ? 1 : 0.99 }}
        >
          <span className="truncate text-left">
            {currentOption?.label || placeholder}
          </span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-1 z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg max-h-72 overflow-y-auto"
            >
              {options.map((option) => (
                <motion.button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left text-sm transition-colors ${
                    option.value === value
                      ? "bg-alloro-orange/10 text-alloro-orange"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  whileHover={{
                    backgroundColor:
                      option.value === value ? undefined : "rgba(0,0,0,0.03)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    {option.value === value && (
                      <Check className="h-4 w-4 text-alloro-orange flex-shrink-0" />
                    )}
                    <div className={option.value === value ? "" : "ml-6"}>
                      <span className="font-medium">{option.label}</span>
                      {option.subtitle && (
                        <span className="text-xs text-gray-500 ml-2">
                          {option.subtitle}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export function PracticeRanking() {
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [jobs, setJobs] = useState<RankingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState(false);
  const [retryingJob, setRetryingJob] = useState<number | null>(null);
  const [retryingBatch, setRetryingBatch] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(
    new Set()
  );
  const [jobResults, setJobResults] = useState<Record<number, RankingResult>>(
    {}
  );
  const [rankingTasks, setRankingTasks] = useState<
    Record<number, RankingTask[]>
  >({});
  const [loadingResults, setLoadingResults] = useState<number | null>(null);
  const [pollingJobs, setPollingJobs] = useState<Set<number>>(new Set());
  const [pollingBatches, setPollingBatches] = useState<Set<string>>(new Set());

  const [, setBatchStatuses] = useState<Record<string, BatchStatus>>({});
  const [deletingJob, setDeletingJob] = useState<number | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [refreshingCompetitors, setRefreshingCompetitors] = useState(false);
  const [organizations, setOrganizations] = useState<{ id: number; name: string }[]>([]);
  const [organizationFilter, setOrganizationFilter] = useState<string>("");

  // Get selected account data
  const selectedAccountData = accounts.find(
    (a) => String(a.id) === String(selectedAccount)
  );

  // Helper to get organization name by ID
  const getOrgName = (orgId: number | null | undefined): string => {
    if (!orgId) return "Unknown Organization";
    return organizations.find((o) => o.id === orgId)?.name || `Org #${orgId}`;
  };

  // Group jobs by batch - flat list sorted by date (newest first)
  const groupedBatches = useMemo((): BatchGroup[] => {
    const batchMap = new Map<string, BatchGroup>();

    jobs.forEach((job) => {
      if (job.batch_id) {
        const jobDate = new Date(job.created_at || 0);

        if (!batchMap.has(job.batch_id)) {
          batchMap.set(job.batch_id, {
            batchId: job.batch_id,
            organization_id: job.organization_id ?? null,
            organization_name: job.organization_name ?? null,
            jobs: [],
            status: "pending",
            createdAt: jobDate,
            totalLocations: 0,
            completedLocations: 0,
          });
        }

        const batch = batchMap.get(job.batch_id)!;
        batch.jobs.push(job);
        batch.totalLocations = batch.jobs.length;
        batch.completedLocations = batch.jobs.filter(
          (j) => j.status === "completed"
        ).length;

        // Use org name from the first job that has it
        if (!batch.organization_name && job.organization_name) {
          batch.organization_name = job.organization_name;
        }

        // Determine batch status
        const hasProcessing = batch.jobs.some(
          (j) => j.status === "processing" || j.status === "pending"
        );
        const hasFailed = batch.jobs.some((j) => j.status === "failed");
        const allCompleted = batch.jobs.every((j) => j.status === "completed");

        if (allCompleted) {
          batch.status = "completed";
        } else if (hasFailed) {
          batch.status = "failed";
        } else if (hasProcessing) {
          batch.status = "processing";
        } else {
          batch.status = "pending";
        }
      }
    });

    return Array.from(batchMap.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }, [jobs]);

  // Group batches by month for card layout
  const monthGroups = useMemo((): MonthGroup[] => {
    const monthMap = new Map<string, MonthGroup>();

    groupedBatches.forEach((batch) => {
      const d = batch.createdAt;
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

      if (!monthMap.has(sortKey)) {
        monthMap.set(sortKey, { label, sortKey, batches: [] });
      }
      monthMap.get(sortKey)!.batches.push(batch);
    });

    return Array.from(monthMap.values()).sort(
      (a, b) => b.sortKey.localeCompare(a.sortKey)
    );
  }, [groupedBatches]);

  // Get standalone jobs (no batch) sorted by date
  const standaloneJobs = useMemo(() => {
    return jobs
      .filter((job) => !job.batch_id)
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );
  }, [jobs]);

  // Toggle batch expansion
  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  useEffect(() => {
    fetchAccounts();
    fetchOrganizations().then((res) => setOrganizations(res.organizations || [])).catch(() => {});
  }, []);

  // Re-fetch jobs when organization filter changes
  useEffect(() => {
    fetchJobs();
  }, [organizationFilter]);

  // When account is selected, select all locations by default
  useEffect(() => {
    if (selectedAccountData && selectedAccountData.gbpLocations.length > 0) {
      setSelectedLocationIds(
        new Set(selectedAccountData.gbpLocations.map((loc) => loc.locationId))
      );
    } else {
      setSelectedLocationIds(new Set());
    }
  }, [selectedAccount, selectedAccountData]);

  // Derive location forms from selected IDs
  const locationForms: LocationFormData[] = useMemo(() => {
    if (!selectedAccountData) return [];
    return selectedAccountData.gbpLocations
      .filter((loc) => selectedLocationIds.has(loc.locationId))
      .map((loc) => ({
        gbpAccountId: loc.accountId,
        gbpLocationId: loc.locationId,
        gbpLocationName: loc.displayName,
      }));
  }, [selectedAccountData, selectedLocationIds]);

  // Poll for job status updates
  useEffect(() => {
    if (pollingJobs.size === 0 && pollingBatches.size === 0) return;

    const interval = setInterval(() => {
      pollingJobs.forEach((jobId) => {
        fetchJobStatus(jobId);
      });
      pollingBatches.forEach((batchId) => {
        fetchBatchStatus(batchId);
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [pollingJobs, pollingBatches]);

  const fetchAccounts = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/admin/practice-ranking/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch accounts");

      const data = await response.json();
      setAccounts(data.accounts);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    }
  };

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const params = new URLSearchParams();
      if (organizationFilter) {
        params.set("organization_id", organizationFilter);
      }
      const url = `/api/admin/practice-ranking/list${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch jobs");

      const data = await response.json();
      setJobs(data.rankings.map(normalizeJob));

      // Start polling for any in-progress jobs
      const inProgress = data.rankings
        .filter(
          (j: RankingJob) =>
            j.status === "processing" || j.status === "pending"
        )
        .map((j: RankingJob) => j.id);
      setPollingJobs(new Set(inProgress));

      // Collect unique batch IDs that are still in progress
      const inProgressBatches = new Set<string>();
      data.rankings.forEach((j: RankingJob) => {
        const batchId = j.batchId || j.batch_id;
        if (batchId && (j.status === "processing" || j.status === "pending")) {
          inProgressBatches.add(batchId);
        }
      });
      setPollingBatches(inProgressBatches);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const fetchJobStatus = async (jobId: number) => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `/api/admin/practice-ranking/status/${jobId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) return;

      const data = await response.json();

      const statusUpdate: Partial<RankingJob> = {
        status: data.status,
        status_detail: data.statusDetail,
        rank_score: data.rankScore,
        rank_position: data.rankPosition,
        total_competitors: data.totalCompetitors,
        gbp_location_id: data.gbpLocationId,
        gbp_location_name: data.gbpLocationName,
        batch_id: data.batchId,
      };

      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, ...statusUpdate } : j))
      );

      if (data.status === "completed" || data.status === "failed") {
        setPollingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
        fetchJobs();
      }
    } catch (error) {
      console.error("Failed to fetch job status:", error);
    }
  };

  const fetchBatchStatus = async (batchId: string) => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `/api/admin/practice-ranking/batch/${batchId}/status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      setBatchStatuses((prev) => ({
        ...prev,
        [batchId]: data as BatchStatus,
      }));

      if (data.status === "completed" || data.status === "failed") {
        setPollingBatches((prev) => {
          const next = new Set(prev);
          next.delete(batchId);
          return next;
        });
        fetchJobs();
      }
    } catch (error) {
      console.error("Failed to fetch batch status:", error);
    }
  };

  const fetchJobResults = async (jobId: number) => {
    if (jobResults[jobId]) return;

    setLoadingResults(jobId);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `/api/admin/practice-ranking/results/${jobId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch results");

      const data = await response.json();
      setJobResults((prev) => ({ ...prev, [jobId]: data.ranking }));

      fetchRankingTasks(jobId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoadingResults(null);
    }
  };

  const fetchRankingTasks = async (practiceRankingId: number) => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `/api/practice-ranking/tasks?practiceRankingId=${practiceRankingId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        console.error("Failed to fetch ranking tasks");
        return;
      }

      const data = await response.json();
      setRankingTasks((prev) => ({ ...prev, [practiceRankingId]: data.tasks }));
    } catch (error) {
      console.error("Error fetching ranking tasks:", error);
    }
  };

  const triggerAnalysis = async () => {
    if (!selectedAccount || locationForms.length === 0) {
      toast.error("Please select an account");
      return;
    }

    setTriggering(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/admin/practice-ranking/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          googleAccountId: selectedAccount,
          locations: locationForms.map((form) => ({
            gbpAccountId: form.gbpAccountId,
            gbpLocationId: form.gbpLocationId,
            gbpLocationName: form.gbpLocationName,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.message || error.error || "Failed to trigger analysis"
        );
      }

      const data = await response.json();
      toast.success(
        `Batch analysis started for ${data.totalLocations} location(s)!`
      );

      if (data.batchId) {
        setPollingBatches((prev) => new Set([...prev, data.batchId]));
      }

      fetchJobs();
      setSelectedAccount(null);
      setSelectedLocationIds(new Set());
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setTriggering(false);
    }
  };

  const toggleExpand = (jobId: number) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
    } else {
      setExpandedJobId(jobId);
      const job = jobs.find((j) => j.id === jobId);
      if (job?.status === "completed") {
        fetchJobResults(jobId);
      }
    }
  };

  const deleteJob = async (jobId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    const ok = await confirm({ title: "Delete this analysis?", message: "This action cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    setDeletingJob(jobId);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/admin/practice-ranking/${jobId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete analysis");
      }

      toast.success("Analysis deleted successfully");

      setJobs((prev) => prev.filter((j) => j.id !== jobId));

      if (expandedJobId === jobId) {
        setExpandedJobId(null);
      }
      if (jobResults[jobId]) {
        setJobResults((prev) => {
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
      }
      setPollingJobs((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setDeletingJob(null);
    }
  };

  const deleteBatch = async (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const batch = groupedBatches.find((b) => b.batchId === batchId);
    const locationCount = batch?.totalLocations || 0;

    const ok = await confirm({ title: "Delete entire batch?", message: `This will delete ${locationCount} analysis record${locationCount !== 1 ? "s" : ""}. This action cannot be undone.`, confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    setDeletingBatch(batchId);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `/api/admin/practice-ranking/batch/${batchId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete batch");
      }

      const data = await response.json();
      toast.success(`Batch deleted (${data.deletedCount} analyses removed)`);

      setJobs((prev) => prev.filter((j) => j.batch_id !== batchId));

      setExpandedBatches((prev) => {
        const next = new Set(prev);
        next.delete(batchId);
        return next;
      });
      setPollingBatches((prev) => {
        const next = new Set(prev);
        next.delete(batchId);
        return next;
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setDeletingBatch(null);
    }
  };

  const retryJob = async (rankingId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingJob(rankingId);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `/api/admin/practice-ranking/retry/${rankingId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to retry");
      }
      toast.success("Retry queued");
      setPollingJobs((prev) => new Set([...prev, rankingId]));
      fetchJobs();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setRetryingJob(null);
    }
  };

  const retryBatchFn = async (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingBatch(batchId);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `/api/admin/practice-ranking/retry-batch/${batchId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to retry batch");
      }
      const data = await response.json();
      toast.success(data.message || "Batch retry queued");
      setPollingBatches((prev) => new Set([...prev, batchId]));
      fetchJobs();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setRetryingBatch(null);
    }
  };

  const refreshCompetitors = async (specialty: string, location: string) => {
    setRefreshingCompetitors(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        "/api/admin/practice-ranking/refresh-competitors",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ specialty, location }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to refresh competitors");
      }

      const data = await response.json();
      toast.success(data.message);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setRefreshingCompetitors(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="success">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="danger">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="info">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      default:
        return (
          <Badge variant="default">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getScoreColorLocal = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<BarChart3 className="w-6 h-6" />}
          title="Practice Ranking"
          description="Analyze competitive positioning and track performance"
        />
        <div className="flex items-center justify-center h-64">
          <motion.div
            className="flex items-center gap-3 text-gray-500"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading practice rankings...
          </motion.div>
        </div>
      </div>
    );
  }

  // Calculate summary stats
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const processingJobs = jobs.filter(
    (j) => j.status === "processing" || j.status === "pending"
  );
  const avgScore =
    completedJobs.length > 0
      ? completedJobs.reduce((sum, j) => sum + (j.rank_score ?? 0), 0) /
        completedJobs.length
      : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<BarChart3 className="w-6 h-6" />}
        title="Practice Ranking"
        description="Analyze competitive positioning and track performance"
        actionButtons={
          <ActionButton
            label="Refresh"
            icon={<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />}
            onClick={fetchJobs}
            variant="secondary"
            disabled={loading}
          />
        }
      />

      {/* Summary Stats Bar */}
      <motion.div
        className="grid grid-cols-4 gap-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{jobs.length}</p>
            <p className="text-xs text-gray-500">Total Analyses</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{completedJobs.length}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
            <Loader2 className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-600">{processingJobs.length}</p>
            <p className="text-xs text-gray-500">Processing</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Target className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">
              {avgScore > 0 ? avgScore.toFixed(1) : "—"}
            </p>
            <p className="text-xs text-gray-500">Avg Score</p>
          </div>
        </div>
      </motion.div>

      {/* Trigger New Analysis Card */}
      <motion.div
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <h3 className="mb-4 flex items-center gap-3 text-base font-semibold text-gray-900">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <span>Run New Analysis</span>
            <p className="text-sm font-normal text-gray-500 mt-0.5">
              Select a practice to analyze their competitive ranking
            </p>
          </div>
        </h3>

        {/* Account Selector - Animated Dropdown */}
        <div className="mb-4 max-w-lg">
          <FilterDropdown
            value={selectedAccount?.toString() || ""}
            onChange={(value) =>
              setSelectedAccount(value ? Number(value) : null)
            }
            label="Google Account"
            icon={<Building className="w-4 h-4" />}
            placeholder="Select an account to analyze..."
            options={[
              { value: "", label: "Select account...", subtitle: "" },
              ...accounts.map((account) => ({
                value: account.id.toString(),
                label: account.practiceName,
                subtitle: `${account.domain} • ${account.gbpCount} location(s)`,
              })),
            ]}
          />
          {selectedAccountData && (
            <div className="mt-3 flex items-center gap-2">
              {selectedAccountData.hasGbp && (
                <Badge variant="success">
                  <MapPin className="w-3 h-3 mr-1" />
                  {selectedAccountData.gbpCount} GBP Location{selectedAccountData.gbpCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Location Selection */}
        <AnimatePresence>
          {selectedAccountData && selectedAccountData.gbpLocations.length > 0 && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Select Locations ({selectedLocationIds.size} of{" "}
                  {selectedAccountData.gbpLocations.length})
                </div>
                <button
                  onClick={() => {
                    if (selectedLocationIds.size === selectedAccountData.gbpLocations.length) {
                      setSelectedLocationIds(new Set());
                    } else {
                      setSelectedLocationIds(
                        new Set(selectedAccountData.gbpLocations.map((loc) => loc.locationId))
                      );
                    }
                  }}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {selectedLocationIds.size === selectedAccountData.gbpLocations.length
                    ? "Deselect All"
                    : "Select All"}
                </button>
              </div>

              <motion.div
                className="space-y-2"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {selectedAccountData.gbpLocations.map((loc) => {
                  const isSelected = selectedLocationIds.has(loc.locationId);
                  return (
                    <motion.label
                      key={loc.locationId}
                      variants={cardVariants}
                      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                        isSelected
                          ? "border-blue-200 bg-blue-50/50"
                          : "border-gray-200 bg-gray-50 opacity-60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedLocationIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(loc.locationId)) {
                              next.delete(loc.locationId);
                            } else {
                              next.add(loc.locationId);
                            }
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate block">
                          {loc.displayName}
                        </span>
                        {loc.address && (
                          <span className="text-xs text-gray-500 truncate block">
                            {loc.address}
                          </span>
                        )}
                      </div>
                    </motion.label>
                  );
                })}
              </motion.div>

              {/* Trigger Button */}
              <div className="pt-2">
                <ActionButton
                  label={
                    triggering
                      ? "Starting Batch..."
                      : `Run Analysis (${locationForms.length}${
                          locationForms.length !== selectedAccountData.gbpLocations.length
                            ? ` of ${selectedAccountData.gbpLocations.length}`
                            : ""
                        } location${locationForms.length !== 1 ? "s" : ""})`
                  }
                  icon={
                    triggering ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )
                  }
                  onClick={triggerAnalysis}
                  variant="primary"
                  disabled={triggering || locationForms.length === 0}
                  loading={triggering}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {selectedAccount && selectedAccountData && selectedAccountData.gbpLocations.length === 0 && (
          <motion.div
            className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 flex items-start gap-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>
              This account has no GBP locations configured. Please set up GBP
              locations first.
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Jobs List - Grouped by Month */}
      <motion.div
        className="space-y-6"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.1 }}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-alloro-orange" />
              Analysis History
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {groupedBatches.length} batch
              {groupedBatches.length !== 1 ? "es" : ""} • {jobs.length} total
              analyses
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Organization Filter */}
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <select
                value={organizationFilter}
                onChange={(e) => setOrganizationFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange"
              >
                <option value="">All Organizations</option>
                {organizations.map((org) => (
                  <option key={org.id} value={String(org.id)}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Processing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>Failed</span>
            </div>
            </div>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <EmptyState
              icon={<TrendingUp className="w-12 h-12" />}
              title="No analyses yet"
              description="Run your first practice ranking analysis above"
            />
          </div>
        ) : (
          <>
            {/* Month Cards */}
            {monthGroups.map((month) => (
              <motion.div
                key={month.sortKey}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {/* Month Header */}
                <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                  <h4 className="text-sm font-semibold text-gray-900">
                    {month.label}
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {month.batches.length} batch{month.batches.length !== 1 ? "es" : ""} •{" "}
                    {month.batches.reduce((sum, b) => sum + b.totalLocations, 0)} analyses
                  </p>
                </div>

                <div className="divide-y divide-gray-100">
                  {month.batches.map((batch) => (
                    <div key={batch.batchId} className="bg-white">
                      {/* Batch Header */}
                      <motion.div
                        className="flex cursor-pointer items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                        onClick={() => toggleBatch(batch.batchId)}
                        whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                          <Layers className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">
                              {batch.organization_name || getOrgName(batch.organization_id)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                            <span>
                              {getWeekLabel(batch.createdAt)} •{" "}
                              {batch.createdAt.toLocaleDateString("en-US", {
                                month: "2-digit",
                                day: "2-digit",
                                year: "numeric",
                              })}
                            </span>
                            {batch.jobs[0]?.location_name && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {batch.jobs.map((j) => j.location_name || j.gbp_location_name).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                            <span>
                              {batch.totalLocations} location
                              {batch.totalLocations !== 1 ? "s" : ""}
                            </span>
                            {batch.status === "processing" && (
                              <span className="flex items-center gap-1 text-blue-600">
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                {batch.completedLocations}/{batch.totalLocations}{" "}
                                completed
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {getStatusBadge(batch.status)}
                          {(batch.status === "failed" || batch.status === "completed") && (
                            <motion.button
                              onClick={(e) => retryBatchFn(batch.batchId, e)}
                              disabled={retryingBatch === batch.batchId}
                              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-blue-50"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              title="Retry batch"
                            >
                              {retryingBatch === batch.batchId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </motion.button>
                          )}
                          <motion.button
                            onClick={(e) => deleteBatch(batch.batchId, e)}
                            disabled={deletingBatch === batch.batchId}
                            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-red-50"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            title="Delete entire batch"
                          >
                            {deletingBatch === batch.batchId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </motion.button>
                          <motion.div
                            variants={chevronVariants}
                            animate={expandedBatches.has(batch.batchId) ? "open" : "closed"}
                            className="text-gray-400"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </motion.div>
                        </div>
                      </motion.div>

                      {/* Expanded Batch - Individual Locations */}
                      <AnimatePresence>
                        {expandedBatches.has(batch.batchId) && (
                          <motion.div
                            className="bg-gray-50/50 border-t border-gray-100"
                            variants={expandCollapse}
                            initial="collapsed"
                            animate="expanded"
                            exit="collapsed"
                          >
                            {batch.jobs.map((job) => (
                              <JobRow
                                key={job.id}
                                job={job}
                                isExpanded={expandedJobId === job.id}
                                onToggle={() => toggleExpand(job.id)}
                                onDelete={(e) => deleteJob(job.id, e)}
                                onRetry={(e) => retryJob(job.id, e)}
                                deletingJob={deletingJob}
                                retryingJob={retryingJob}
                                loadingResults={loadingResults}
                                jobResults={jobResults}
                                rankingTasks={rankingTasks}
                                refreshingCompetitors={refreshingCompetitors}
                                onRefreshCompetitors={() =>
                                  refreshCompetitors(job.specialty, job.location || "")
                                }
                                getStatusBadge={getStatusBadge}
                                getScoreColor={getScoreColorLocal}
                                indentLevel={1}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}

            {/* Standalone Jobs (no batch) */}
            {standaloneJobs.length > 0 && (
              <motion.div
                className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-600">
                    Individual Analyses (No Batch)
                  </h4>
                </div>
                {standaloneJobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    isExpanded={expandedJobId === job.id}
                    onToggle={() => toggleExpand(job.id)}
                    onDelete={(e) => deleteJob(job.id, e)}
                    onRetry={(e) => retryJob(job.id, e)}
                    deletingJob={deletingJob}
                    retryingJob={retryingJob}
                    loadingResults={loadingResults}
                    jobResults={jobResults}
                    rankingTasks={rankingTasks}
                    refreshingCompetitors={refreshingCompetitors}
                    onRefreshCompetitors={() =>
                      refreshCompetitors(job.specialty, job.location || "")
                    }
                    getStatusBadge={getStatusBadge}
                    getScoreColor={getScoreColorLocal}
                    indentLevel={0}
                  />
                ))}
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

// Job Row Component for displaying individual ranking jobs
function JobRow({
  job,
  isExpanded,
  onToggle,
  onDelete,
  onRetry,
  deletingJob,
  retryingJob,
  loadingResults,
  jobResults,
  rankingTasks,
  refreshingCompetitors,
  onRefreshCompetitors,
  getStatusBadge,
  getScoreColor,
  indentLevel = 0,
}: {
  job: RankingJob;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onRetry: (e: React.MouseEvent) => void;
  deletingJob: number | null;
  retryingJob: number | null;
  loadingResults: number | null;
  jobResults: Record<number, RankingResult>;
  rankingTasks: Record<number, RankingTask[]>;
  refreshingCompetitors: boolean;
  onRefreshCompetitors: () => void;
  getStatusBadge: (status: string) => React.ReactNode;
  getScoreColor: (score: number) => string;
  indentLevel?: number;
}) {
  const paddingLeft =
    indentLevel === 2 ? "pl-20" : indentLevel === 1 ? "pl-12" : "pl-6";

  return (
    <div className="transition-colors hover:bg-gray-50/80">
      {/* Job Header */}
      <motion.div
        className={`flex cursor-pointer items-center gap-4 p-3 pr-6 ${paddingLeft}`}
        onClick={onToggle}
        whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
          <MapPin className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900 text-sm">
              {job.gbp_location_name || job.specialty}
            </h4>
            <Badge variant="default">{job.specialty}</Badge>
            {(job.location_name || job.location) && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3 w-3" />
                {job.location_name || job.location}
              </span>
            )}
          </div>
          {/* Progress bar for pending/processing jobs */}
          {(job.status === "processing" || job.status === "pending") && (
            <div className="mt-2">
              <HorizontalProgressBar
                value={job.status_detail?.progress ?? 0}
                height={4}
              />
              {job.status_detail?.message && (
                <span className="text-xs text-gray-500 mt-1 block truncate">
                  {job.status_detail.message}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {job.status === "completed" && job.rank_score != null && (
            <div className="text-right">
              <div
                className={`text-xl font-bold ${getScoreColor(
                  Number(job.rank_score)
                )}`}
              >
                {Number(job.rank_score).toFixed(1)}
              </div>
              <div className="text-xs text-gray-500">
                #{job.rank_position ?? "-"} of {job.total_competitors ?? "-"}
              </div>
            </div>
          )}
          {getStatusBadge(job.status)}
          {(job.status === "failed" || job.status === "completed") && (
            <motion.button
              onClick={onRetry}
              disabled={retryingJob === job.id}
              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-blue-50"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Retry analysis"
            >
              {retryingJob === job.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </motion.button>
          )}
          <motion.button
            onClick={onDelete}
            disabled={deletingJob === job.id}
            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-red-50"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Delete analysis"
          >
            {deletingJob === job.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </motion.button>
          <motion.div
            variants={chevronVariants}
            animate={isExpanded ? "open" : "closed"}
            className="text-gray-400"
          >
            <ChevronRight className="h-4 w-4" />
          </motion.div>
        </div>
      </motion.div>

      {/* Expanded Results */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className={`border-t border-gray-100 bg-gray-50/50 p-6 ${paddingLeft}`}
            variants={expandCollapse}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
          >
            {job.status === "completed" ? (
              loadingResults === job.id ? (
                <div className="flex items-center justify-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 className="h-6 w-6 text-blue-600" />
                  </motion.div>
                </div>
              ) : jobResults[job.id] ? (
                <RankingResultsView
                  result={jobResults[job.id]}
                  onRefreshCompetitors={onRefreshCompetitors}
                  refreshingCompetitors={refreshingCompetitors}
                  rankingTasks={rankingTasks}
                />
              ) : (
                <div className="text-center text-gray-500">
                  Failed to load results
                </div>
              )
            ) : job.status === "failed" ? (
              <motion.div
                className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <AlertCircle className="h-5 w-5" />
                <span>Analysis failed. Please try again.</span>
              </motion.div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 className="h-5 w-5 text-blue-600" />
                  </motion.div>
                  <span className="text-gray-600">
                    {job.status_detail?.message || "Processing..."}
                  </span>
                </div>
                {job.status_detail && (
                  <HorizontalProgressBar value={job.status_detail.progress} />
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Admin Results View - Technical Details
function RankingResultsView({
  result,
  onRefreshCompetitors,
  refreshingCompetitors,
  rankingTasks,
}: {
  result: RankingResult;
  onRefreshCompetitors?: () => void;
  refreshingCompetitors?: boolean;
  rankingTasks?: Record<number, RankingTask[]>;
}) {
  const factors = result.rankingFactors;
  const competitors =
    (result.rawData?.competitors as Array<{
      name: string;
      rankScore: number;
      rankPosition: number;
      totalReviews: number;
      averageRating: number;
      reviewsLast30d?: number;
      primaryCategory?: string;
    }>) || [];

  const getScoreColorLocal = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <motion.div
      className="space-y-6"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Location Info Header */}
      {result.gbpLocationName && (
        <motion.div
          className="flex items-center gap-2 text-sm text-gray-600"
          variants={cardVariants}
        >
          <MapPin className="h-4 w-4" />
          <span className="font-medium">{result.gbpLocationName}</span>
          {result.location && (
            <>
              <span className="text-gray-400">•</span>
              <span>{result.location}</span>
            </>
          )}
          {result.specialty && (
            <>
              <span className="text-gray-400">•</span>
              <Badge variant="default">{result.specialty}</Badge>
            </>
          )}
        </motion.div>
      )}

      {/* Keywords Used for Ranking */}
      {result.rankKeywords && (
        <motion.div
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
          variants={cardVariants}
        >
          <h4 className="mb-2 text-sm font-semibold text-gray-700">
            Keywords Used for Ranking
          </h4>
          <div className="flex flex-wrap gap-2">
            {result.rankKeywords.split(",").map((kw: string) => (
              <Badge key={kw.trim()} variant="info">
                {kw.trim()}
              </Badge>
            ))}
          </div>
        </motion.div>
      )}

      {/* Apify Search Parameters (for debugging) */}
      {result.searchParams && (
        <motion.div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4"
          variants={cardVariants}
        >
          <h4 className="mb-2 text-sm font-semibold text-amber-700 flex items-center gap-2">
            <Info className="h-4 w-4" />
            Apify Search Parameters (Debug)
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">City:</span>{" "}
              <span className="font-medium text-gray-900">
                {result.searchParams.city || "(not set)"}
              </span>
            </div>
            <div>
              <span className="text-gray-600">State:</span>{" "}
              <span className="font-medium text-gray-900">
                {result.searchParams.state || "(not set)"}
              </span>
            </div>
            <div>
              <span className="text-gray-600">County:</span>{" "}
              <span className="font-medium text-gray-900">
                {result.searchParams.county || "(not set)"}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Postal Code:</span>{" "}
              <span className="font-medium text-gray-900">
                {result.searchParams.postalCode || "(not set)"}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Score Overview */}
      <motion.div className="grid gap-4 md:grid-cols-4" variants={cardVariants}>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Rank Score</span>
            <Trophy className={`w-5 h-5 ${getScoreColorLocal(Number(result.rankScore))}`} />
          </div>
          <div className={`text-3xl font-bold ${getScoreColorLocal(Number(result.rankScore))}`}>
            {Number(result.rankScore).toFixed(1)}
            <span className="text-sm font-normal text-gray-400">/100</span>
          </div>
          <div className="mt-2">
            <HorizontalProgressBar value={Number(result.rankScore)} height={6} />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Position</span>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            #{result.rankPosition}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            of {result.totalCompetitors} competitors
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Reviews</span>
            <Star className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {result.rawData?.client_gbp?.totalReviewCount || 0}
          </div>
          <p className="text-sm text-gray-500 mt-1">total reviews</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Rating</span>
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-3xl font-bold text-gray-900">
              {(
                factors?.star_rating?.value ??
                result.rawData?.client_gbp?.averageRating ??
                0
              ).toFixed(1)}
            </span>
            <span className="text-sm text-gray-400">/5.0</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">average rating</p>
        </div>
      </motion.div>

      {/* LLM Analysis Summary */}
      {result.llmAnalysis?.client_summary && (
        <motion.div
          className="rounded-xl border border-blue-200 bg-blue-50 p-4"
          variants={cardVariants}
        >
          <h4 className="mb-2 font-semibold text-blue-900">Analysis Summary</h4>
          <p className="text-sm text-blue-800 whitespace-pre-wrap">
            {result.llmAnalysis.client_summary}
          </p>
        </motion.div>
      )}

      {/* Action Plans Card */}
      {rankingTasks &&
        rankingTasks[result.id] &&
        rankingTasks[result.id].length > 0 && (
          <motion.div
            className="rounded-xl border border-green-200 bg-green-50 p-4"
            variants={cardVariants}
          >
            <h4 className="mb-3 font-semibold text-green-900 flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Action Plans ({rankingTasks[result.id].length})
            </h4>
            <div className="space-y-3">
              {rankingTasks[result.id].map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-green-100 bg-white p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="font-medium text-gray-900">
                        {task.title}
                      </h5>
                      {task.metadata?.priority && (
                        <Badge
                          variant={
                            task.metadata.priority === "1" ||
                            task.metadata.priority === "high"
                              ? "danger"
                              : task.metadata.priority === "2" ||
                                  task.metadata.priority === "medium"
                                ? "warning"
                                : "default"
                          }
                        >
                          Priority {task.metadata.priority}
                        </Badge>
                      )}
                      {task.metadata?.impact && (
                        <Badge variant="info">{task.metadata.impact} impact</Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
                        {task.description}
                      </p>
                    )}
                  </div>
                  <a
                    href={`/admin/action-items?taskId=${task.id}`}
                    className="shrink-0 flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start Task
                  </a>
                </div>
              ))}
            </div>
          </motion.div>
        )}

      {/* Ranking Factors Breakdown */}
      <motion.div
        className="rounded-xl border border-gray-200 bg-white p-4"
        variants={cardVariants}
      >
        <h4 className="mb-4 font-semibold text-gray-900">
          Ranking Factors Breakdown
        </h4>
        <div className="space-y-3">
          {factors &&
            Object.entries(factors).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <div className="w-44 text-sm text-gray-600 capitalize flex items-center gap-1.5">
                  {value?.details && (
                    <div className="relative group">
                      <Info className="h-3.5 w-3.5 text-gray-400 cursor-help hover:text-blue-500 transition-colors" />
                      <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                        <div className="font-medium mb-1 capitalize">
                          {key.replace(/_/g, " ")}
                        </div>
                        <div className="text-gray-300">{value.details}</div>
                      </div>
                    </div>
                  )}
                  {key.replace(/_/g, " ")}
                </div>
                <div className="flex-1">
                  <HorizontalProgressBar
                    value={(value?.score ?? 0) * 100}
                    height={8}
                  />
                </div>
                <div className="w-16 text-right text-sm font-medium text-gray-900">
                  {((value?.score ?? 0) * 100).toFixed(0)}%
                </div>
                <div className="w-16 text-right text-xs text-gray-500">
                  +{value?.weighted?.toFixed(1) ?? "0.0"}
                </div>
              </div>
            ))}
        </div>
      </motion.div>

      {/* Top Competitors */}
      <motion.div
        className="rounded-xl border border-gray-200 bg-white p-4"
        variants={cardVariants}
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Top Competitors
          </h4>
          {onRefreshCompetitors && (
            <ActionButton
              label={refreshingCompetitors ? "Refreshing..." : "Refresh"}
              icon={
                refreshingCompetitors ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )
              }
              onClick={onRefreshCompetitors}
              variant="secondary"
              disabled={refreshingCompetitors}
            />
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-500">
                  Rank
                </th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">
                  Name
                </th>
                <th className="text-center py-2 px-2 font-medium text-gray-500">
                  Score
                </th>
                <th className="text-center py-2 px-2 font-medium text-gray-500">
                  Reviews
                </th>
                <th className="text-center py-2 px-2 font-medium text-gray-500">
                  Rating
                </th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">
                  Category
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const clientEntry = {
                  name: result.gbpLocationName || result.specialty,
                  rankScore: Number(result.rankScore),
                  rankPosition: result.rankPosition,
                  totalReviews:
                    result.rawData?.client_gbp?.totalReviewCount || 0,
                  averageRating:
                    factors?.star_rating?.value ??
                    result.rawData?.client_gbp?.averageRating ??
                    0,
                  primaryCategory:
                    result.rawData?.client_gbp?.primaryCategory ||
                    result.specialty,
                  isClient: true,
                };

                const allEntries = [
                  clientEntry,
                  ...competitors.map((c) => ({ ...c, isClient: false })),
                ].sort((a, b) => a.rankPosition - b.rankPosition);

                return allEntries.slice(0, 10).map((comp, idx) => (
                  <motion.tr
                    key={idx}
                    className={`border-b border-gray-100 ${
                      comp.isClient ? "bg-blue-50" : ""
                    }`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <td className="py-2 px-2">
                      <span className="flex items-center gap-1">
                        {comp.rankPosition === 1 && (
                          <Trophy className="h-4 w-4 text-yellow-500" />
                        )}
                        #{comp.rankPosition}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-medium text-gray-900">
                      {comp.name}
                      {comp.isClient && (
                        <span className="ml-2 text-xs text-blue-600 font-medium">
                          (You)
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-2 px-2 text-center font-medium ${getScoreColorLocal(
                        comp.rankScore
                      )}`}
                    >
                      {comp.rankScore?.toFixed(1) || "-"}
                    </td>
                    <td className="py-2 px-2 text-center text-gray-700">
                      {comp.totalReviews}
                    </td>
                    <td className="py-2 px-2 text-center text-gray-700">
                      {comp.averageRating?.toFixed(1) || "-"}
                    </td>
                    <td className="py-2 px-2 text-gray-600 truncate max-w-[150px]">
                      {comp.primaryCategory || "-"}
                    </td>
                  </motion.tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* LLM Analysis Details */}
      {result.llmAnalysis && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Gaps */}
          {result.llmAnalysis.gaps && result.llmAnalysis.gaps.length > 0 && (
            <motion.div
              className="rounded-xl border border-gray-200 bg-white p-4"
              variants={cardVariants}
            >
              <h4 className="mb-3 font-semibold text-gray-900">
                Identified Gaps
              </h4>
              <div className="space-y-2">
                {result.llmAnalysis.gaps.map((gap, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3"
                  >
                    <Badge
                      variant={
                        gap.impact === "high"
                          ? "danger"
                          : gap.impact === "medium"
                            ? "warning"
                            : "default"
                      }
                    >
                      {gap.impact}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {gap.type}: {gap.area || gap.query_class}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {gap.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Drivers */}
          {result.llmAnalysis.drivers &&
            result.llmAnalysis.drivers.length > 0 && (
              <motion.div
                className="rounded-xl border border-gray-200 bg-white p-4"
                variants={cardVariants}
              >
                <h4 className="mb-3 font-semibold text-gray-900">
                  Key Drivers
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.llmAnalysis.drivers.map((driver, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          driver.direction === "positive"
                            ? "bg-green-500"
                            : driver.direction === "negative"
                              ? "bg-red-500"
                              : "bg-gray-400"
                        }`}
                      />
                      <span className="text-gray-700">{driver.factor}</span>
                      <span className="text-xs text-gray-400">
                        ({driver.weight})
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
        </div>
      )}

      {/* Data Source Info */}
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
          variants={cardVariants}
        >
          <h4 className="text-sm font-semibold text-gray-900 mb-2">
            Data Collection
          </h4>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Competitors Discovered:</span>
              <span className="font-medium">
                {result.rawData?.competitors_discovered ||
                  result.rawData?.competitors?.length ||
                  0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Data Source:</span>
              <span className="font-medium">
                {result.rawData?.competitors_from_cache ? "Cached" : "Fresh"}
              </span>
            </div>
          </div>
        </motion.div>
        <motion.div
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
          variants={cardVariants}
        >
          <h4 className="text-sm font-semibold text-gray-900 mb-2">
            GBP Profile
          </h4>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Category:</span>
              <span className="font-medium truncate max-w-[100px]">
                {result.rawData?.client_gbp?.primaryCategory || "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Latest Posts (30d):</span>
              <span className="font-medium">
                {result.rawData?.client_gbp?.postsLast30d ?? 0}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default PracticeRanking;
