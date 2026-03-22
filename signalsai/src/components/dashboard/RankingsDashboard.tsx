import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Trophy,
  Star,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ArrowUpRight,
  Target,
  Rocket,
  HelpCircle,
  ExternalLink,
  Settings,
  ChevronRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Zap,
  Lightbulb,
  X,
  ChevronLeft,
} from "lucide-react";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../contexts/OnboardingWizardContext";
import { useLocationContext } from "../../contexts/locationContext";

// Type for client GBP data
interface ClientGbpData {
  totalReviewCount?: number;
  averageRating?: number;
  primaryCategory?: string;
  reviewsLast30d?: number;
  postsLast90d?: number;
  photosCount?: number;
  hasWebsite?: boolean;
  hasPhone?: boolean;
  hasHours?: boolean;
  gbpLocationId?: string;
  gbpLocationName?: string;
  performance?: {
    calls?: number;
    directions?: number;
    clicks?: number;
  };
  _raw?: {
    locations?: Array<{
      displayName?: string;
      data?: {
        performance?: {
          series?: Array<{
            dailyMetricTimeSeries?: Array<{
              dailyMetric: string;
              timeSeries?: {
                datedValues?: Array<{
                  value?: string;
                }>;
              };
            }>;
          }>;
        };
      };
    }>;
  };
}

interface RankingResult {
  id: number;
  specialty: string;
  location: string | null;
  gbpLocationId?: string | null;
  gbpLocationName?: string | null;
  observedAt: string;
  rankScore: number | string;
  rankPosition: number;
  totalCompetitors: number;
  rankingFactors: {
    category_match: { score: number; weighted: number; weight: number };
    review_count: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
    };
    star_rating: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
    };
    keyword_name: { score: number; weighted: number; weight: number };
    review_velocity: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
    };
    nap_consistency: { score: number; weighted: number; weight: number };
    gbp_activity: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
    };
    sentiment: { score: number; weighted: number; weight: number };
  } | null;
  rawData: {
    client_gbp: ClientGbpData | null;
    competitors: Array<{
      name: string;
      rankScore: number;
      rankPosition: number;
      totalReviews: number;
      averageRating: number;
      reviewsLast30d?: number;
      primaryCategory?: string;
    }>;
    competitors_discovered?: number;
    competitors_from_cache?: boolean;
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
      insight?: string;
    }>;
    render_text: string;
    client_summary?: string | null;
    top_recommendations?: Array<{
      priority: number;
      title: string;
      description?: string;
      expected_outcome?: string;
    }>;
    verdict: string;
    confidence: number;
  } | null;
  // Previous analysis data for trend comparison
  previousAnalysis: {
    id: number;
    observedAt: string;
    rankScore: number | string;
    rankPosition: number;
    totalCompetitors: number;
    rawData: {
      client_gbp: ClientGbpData | null;
    } | null;
  } | null;
}

// Ranking Task from the tasks endpoint (approved tasks only)
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

interface RankingsDashboardProps {
  organizationId: number | null;
  locationId?: number | null;
}

// KPICard Component - Matching newdesign
const KPICard = ({
  label,
  value,
  sub,
  trend,
  dir,
  rating,
  suffix,
  warning,
  tooltip,
}: {
  label: string;
  value: string | number;
  sub: string;
  trend?: string;
  dir?: "up" | "down";
  rating?: boolean;
  suffix?: string;
  warning?: boolean;
  tooltip?: string;
}) => (
  <div className="bg-white border border-black/5 rounded-2xl p-8 shadow-premium flex flex-col transition-all hover:shadow-2xl hover:-translate-y-1 group">
    <div className="flex justify-between items-start mb-8">
      <div className="flex items-center gap-2">
        {tooltip && (
          <div className="relative group/tooltip">
            <HelpCircle
              size={14}
              className="text-slate-300 hover:text-alloro-orange cursor-help transition-colors"
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-alloro-navy text-white text-[11px] font-medium rounded-lg shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 w-48 text-center leading-relaxed z-50">
              {tooltip}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-alloro-navy"></div>
            </div>
          </div>
        )}
        <span className="text-[10px] font-black text-alloro-navy uppercase tracking-[0.25em] leading-none">
          {label}
        </span>
      </div>
      {trend && (
        <span
          className={`text-[10px] font-black px-2.5 py-1 rounded-lg border tabular-nums leading-none ${
            dir === "up"
              ? "bg-green-50 text-green-700 border-green-100"
              : dir === "down"
              ? "bg-red-50 text-red-700 border-red-100"
              : "bg-slate-50 text-slate-600 border-slate-200"
          }`}
        >
          {dir === "up" && "+"}
          {trend}
        </span>
      )}
    </div>

    <div className="flex items-baseline gap-1 mb-2">
      <span className="text-4xl lg:text-5xl font-black font-sans text-alloro-navy tracking-tighter leading-none tabular-nums group-hover:text-alloro-orange transition-colors">
        {value}
      </span>
      {suffix && (
        <span className="text-base font-black text-slate-300 ml-1">
          {suffix}
        </span>
      )}
      {rating && (
        <Star size={20} className="text-amber-500 fill-amber-500 ml-2 mb-1.5" />
      )}
      {warning && (
        <AlertTriangle
          size={20}
          className="text-alloro-orange ml-2 mb-1.5 animate-pulse"
        />
      )}
    </div>

    <div className="mt-auto text-[13px] font-bold text-slate-500 leading-tight tracking-tight pt-4">
      {sub}
    </div>
  </div>
);

export function RankingsDashboard({ organizationId, locationId }: RankingsDashboardProps) {
  const navigate = useNavigate();
  const isWizardActive = useIsWizardActive();
  const { signalContentReady } = useLocationContext();
  const wizardDemoData = useWizardDemoData();
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState<RankingResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rankingTasks, setRankingTasks] = useState<
    Record<number, RankingTask[]>
  >({});

  // Skip fetching during wizard mode - use demo data instead
  useEffect(() => {
    if (isWizardActive) {
      setLoading(false);
      return;
    }
    if (organizationId) {
      fetchLatestRankings();
    } else {
      setLoading(false);
    }
  }, [organizationId, locationId, isWizardActive]);

  const fetchLatestRankings = async () => {
    try {
      setLoading(true);
      const token = getPriorityItem("token");

      // Fetch the latest rankings for all locations of this google account
      const response = await fetch(
        `/api/practice-ranking/latest?googleAccountId=${organizationId}${locationId ? `&locationId=${locationId}` : ""}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          // No ranking found yet
          setRankings([]);
          return;
        }
        throw new Error("Failed to fetch ranking data");
      }

      const data = await response.json();
      // Handle both old format (single ranking) and new format (rankings array)
      if (data.rankings && Array.isArray(data.rankings)) {
        setRankings(data.rankings);
      } else if (data.ranking) {
        // Legacy single ranking format
        setRankings([data.ranking]);
      }
    } catch (err) {
      console.error("Error fetching rankings:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load ranking data"
      );
    } finally {
      setLoading(false);
      signalContentReady();
    }
  };

  // Fetch approved tasks for a specific ranking
  const fetchRankingTasks = async (practiceRankingId: number) => {
    try {
      const token = getPriorityItem("token");
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

  // Fetch tasks when rankings are loaded - skip during wizard mode
  useEffect(() => {
    if (isWizardActive) return;
    if (rankings.length > 0) {
      // Fetch tasks for all rankings
      rankings.forEach((ranking) => {
        if (!rankingTasks[ranking.id]) {
          fetchRankingTasks(ranking.id);
        }
      });
    }
  }, [rankings, isWizardActive]);

  if (loading && !isWizardActive) {
    return (
      <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
        {/* Header */}
        <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
          <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
                <Target size={20} />
              </div>
              <div className="flex flex-col text-left">
                <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
                  Market Intelligence
                </h1>
                <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
                  Loading data...
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Skeleton Content */}
        <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-12 lg:space-y-20">
          <LoadingSkeleton />
        </main>
      </div>
    );
  }

  // When wizard is active, bypass error/empty checks and use demo data
  if (error && !isWizardActive) {
    return (
      <div className="min-h-screen bg-alloro-bg font-body flex items-center justify-center py-16">
        <div className="text-center max-w-md bg-white rounded-2xl border border-slate-200 shadow-premium p-10">
          <div className="p-4 bg-red-50 rounded-2xl w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>
          <h3 className="text-xl font-black text-alloro-navy font-heading mb-2 tracking-tight">
            Unable to Load Rankings
          </h3>
          <p className="text-slate-500 text-sm font-bold mb-6">{error}</p>
          <button
            onClick={fetchLatestRankings}
            className="px-6 py-3 bg-alloro-orange text-white rounded-xl hover:bg-blue-700 transition-colors font-black text-sm flex items-center gap-2 mx-auto uppercase tracking-widest"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!organizationId && !isWizardActive) {
    return (
      <div className="min-h-screen bg-alloro-bg font-body flex items-center justify-center py-16">
        <div className="text-center max-w-md bg-white rounded-2xl border border-slate-200 shadow-premium p-10">
          <div className="p-4 bg-slate-100 rounded-2xl w-fit mx-auto mb-4">
            <Trophy className="h-10 w-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-black text-alloro-navy font-heading mb-2 tracking-tight">
            No Account Connected
          </h3>
          <p className="text-slate-500 text-sm font-bold">
            Please connect your Google account to view ranking data.
          </p>
        </div>
      </div>
    );
  }

  if (rankings.length === 0 && !isWizardActive) {
    return (
      <div className="min-h-screen bg-alloro-bg font-body flex items-center justify-center py-16 px-6">
        <div className="max-w-xl w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
              <Sparkles className="w-4 h-4 text-alloro-orange" />
              <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">Almost There</span>
            </div>
            <h1 className="text-3xl font-black text-alloro-navy font-heading tracking-tight mb-3">
              Local Rankings Coming Soon
            </h1>
            <p className="text-base text-slate-500 font-medium max-w-md mx-auto">
              We're preparing your competitive analysis. Make sure your Google Business Profile is connected to get started.
            </p>
          </div>

          {/* Action Card */}
          <div
            onClick={() => navigate("/settings/integrations")}
            className="group bg-white rounded-3xl border-2 border-alloro-orange shadow-xl shadow-alloro-orange/10 p-8 cursor-pointer hover:shadow-2xl hover:shadow-alloro-orange/20 transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex items-start gap-6">
              <div className="shrink-0">
                <div className="w-14 h-14 bg-gradient-to-br from-alloro-orange to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-alloro-orange/30 group-hover:scale-110 transition-transform">
                  <Target className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-xl font-black text-alloro-navy tracking-tight mb-2">
                  Connect Your Google Business Profile
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-4">
                  Link your GBP to unlock local ranking insights, competitor analysis, and visibility tracking.
                </p>
                <div className="flex items-center gap-2 text-alloro-orange font-bold text-sm group-hover:gap-3 transition-all">
                  <Settings className="w-4 h-4" />
                  <span>Go to Settings</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Help text */}
          <p className="text-center text-sm text-slate-400 mt-6">
            Already connected? Rankings typically appear within 24 hours.
          </p>
        </div>
      </div>
    );
  }

  // Create demo ranking for wizard mode
  const demoRanking: RankingResult | null =
    isWizardActive && wizardDemoData
      ? {
          id: 1,
          specialty: "Orthodontics",
          location: "San Francisco, CA",
          gbpLocationId: "demo-location",
          gbpLocationName: wizardDemoData.rankingData[0].locationName,
          observedAt: new Date().toISOString(),
          rankScore: 78,
          rankPosition: wizardDemoData.rankingData[0].rank,
          totalCompetitors: wizardDemoData.rankingData[0].totalCompetitors,
          rankingFactors: {
            category_match: { score: 85, weighted: 12.75, weight: 15 },
            review_count: {
              score: 72,
              weighted: 14.4,
              weight: 20,
              value: wizardDemoData.rankingData[0].reviews,
            },
            star_rating: {
              score: 96,
              weighted: 14.4,
              weight: 15,
              value: wizardDemoData.rankingData[0].rating,
            },
            keyword_name: { score: 80, weighted: 8, weight: 10 },
            review_velocity: { score: 65, weighted: 9.75, weight: 15, value: 8 },
            nap_consistency: { score: 90, weighted: 9, weight: 10 },
            gbp_activity: { score: 70, weighted: 7, weight: 10, value: 12 },
            sentiment: { score: 88, weighted: 4.4, weight: 5 },
          },
          rawData: {
            client_gbp: {
              totalReviewCount: wizardDemoData.rankingData[0].reviews,
              averageRating: wizardDemoData.rankingData[0].rating,
              primaryCategory: "Orthodontist",
              reviewsLast30d: 8,
              postsLast90d: 5,
              photosCount: 24,
              hasWebsite: true,
              hasPhone: true,
              hasHours: true,
            },
            competitors: [
              {
                name: "Smile Orthodontics",
                rankScore: 82,
                rankPosition: 1,
                totalReviews: 156,
                averageRating: 4.9,
              },
              {
                name: "Perfect Teeth Ortho",
                rankScore: 80,
                rankPosition: 2,
                totalReviews: 134,
                averageRating: 4.7,
              },
              {
                name: "City Orthodontics",
                rankScore: 75,
                rankPosition: 4,
                totalReviews: 98,
                averageRating: 4.6,
              },
            ],
          },
          llmAnalysis: {
            gaps: [
              {
                type: "review_velocity",
                impact: "medium",
                reason: "Your review velocity is below competitors",
              },
            ],
            drivers: [
              { factor: "Star Rating", weight: "15%", direction: "positive" },
              { factor: "Review Count", weight: "20%", direction: "positive" },
            ],
            render_text:
              "Your practice is performing well but has room for improvement in review velocity.",
            verdict: "Good standing with growth opportunities",
            confidence: 85,
            top_recommendations: [
              {
                priority: 1,
                title: "Increase review requests",
                description:
                  "Send review requests to recent patients to boost velocity",
              },
              {
                priority: 2,
                title: "Post more GBP updates",
                description: "Increase posting frequency to improve GBP activity score",
              },
            ],
          },
          previousAnalysis: null,
        }
      : null;

  // Use demo ranking when wizard is active and no real data, otherwise use real data
  const effectiveRankings =
    isWizardActive && wizardDemoData && rankings.length === 0
      ? [demoRanking!]
      : rankings;

  // Use the first ranking (backend filters by locationId)
  const selectedRanking = effectiveRankings[0] || null;

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      {/* Header */}
      <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
              <Target size={20} />
            </div>
            <div className="flex flex-col text-left">
              <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
                Local Rankings
              </h1>
              <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
                How you compare to others
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-5 bg-white px-6 py-3 rounded-2xl border border-black/5 shadow-premium">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Latest Analysis:
            </span>
            <span className="text-[11px] font-black text-alloro-navy flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>{" "}
              {selectedRanking?.gbpLocationName || "Location"} •{" "}
              {new Date(
                selectedRanking?.observedAt || new Date()
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-12 lg:space-y-20">
        {/* HERO SECTION */}
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 text-left pt-2">
          <div className="flex items-center gap-4 mb-3">
            <div className="px-3 py-1.5 bg-alloro-orange/5 rounded-lg text-alloro-orange text-[10px] font-black uppercase tracking-widest border border-alloro-orange/10 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-alloro-orange"></span>
              Local SEO Tracking On
            </div>
          </div>
          <h1 className="text-5xl lg:text-6xl font-black font-heading text-alloro-navy tracking-tight leading-none mb-4">
            Local Reputation.
          </h1>
          <p className="text-xl lg:text-2xl text-slate-500 font-medium tracking-tight leading-relaxed max-w-4xl">
            See how your{" "}
            <span className="text-alloro-orange underline underline-offset-8 font-black">
              Rank and Reviews
            </span>{" "}
            compare to the practices nearby.
          </p>
        </section>

        {/* CLIENT SUMMARY CARD */}
        {selectedRanking?.llmAnalysis?.client_summary && (
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150">
            <div className="bg-gradient-to-r from-alloro-orange/90 to-alloro-orange rounded-3xl p-6 lg:p-8 shadow-lg">
              <p className="text-white text-base lg:text-lg font-medium leading-relaxed">
                {selectedRanking.llmAnalysis.client_summary}
              </p>
            </div>
          </section>
        )}

        {/* Selected Location Detail */}
        {selectedRanking && (
          <PerformanceDashboard
            result={selectedRanking}
            tasks={rankingTasks[selectedRanking.id] || []}
          />
        )}
      </main>
    </div>
  );
}

// Performance Dashboard View Component
function PerformanceDashboard({
  result,
  tasks,
}: {
  result: RankingResult;
  tasks: RankingTask[];
}) {
  const factors = result.rankingFactors;
  const competitors = result.rawData?.competitors || [];

  // Sort competitors by rankPosition for correct display order
  const sortedCompetitors = [...competitors].sort(
    (a, b) => a.rankPosition - b.rankPosition
  );

  // Calculate market averages from competitors
  const marketAvgRating =
    competitors.length > 0
      ? competitors.reduce((sum, c) => sum + (c.averageRating || 0), 0) /
        competitors.length
      : 4.5;

  // Client metrics
  const clientReviews = result.rawData?.client_gbp?.totalReviewCount || 0;
  const clientRating =
    factors?.star_rating?.value ??
    result.rawData?.client_gbp?.averageRating ??
    0;
  const leaderReviews = sortedCompetitors[0]?.totalReviews || 0;
  const reviewGap = leaderReviews - clientReviews;

  // Calculate trend directions
  const getRankTrend = () => {
    if (!result.previousAnalysis) return undefined;
    const change = result.rankPosition - result.previousAnalysis.rankPosition;
    if (change === 0) return undefined;
    return {
      value: Math.abs(change).toString(),
      dir: change < 0 ? "up" : ("down" as "up" | "down"),
    };
  };

  const getScoreTrend = () => {
    if (!result.previousAnalysis) return undefined;
    const prev = Number(result.previousAnalysis.rankScore);
    const curr = Number(result.rankScore);
    const change = curr - prev;
    if (change === 0) return undefined;
    return {
      value: Math.abs(change).toFixed(0),
      dir: change > 0 ? "up" : ("down" as "up" | "down"),
    };
  };

  const rankTrend = getRankTrend();
  const scoreTrend = getScoreTrend();

  // Modal state for driver insights carousel
  const [selectedDriverIndex, setSelectedDriverIndex] = useState<number | null>(null);
  const drivers = result.llmAnalysis?.drivers || [];
  const selectedDriver = selectedDriverIndex !== null ? drivers[selectedDriverIndex] : null;

  const goToPrevDriver = () => {
    if (selectedDriverIndex !== null && selectedDriverIndex > 0) {
      setSelectedDriverIndex(selectedDriverIndex - 1);
    }
  };

  const goToNextDriver = () => {
    if (selectedDriverIndex !== null && selectedDriverIndex < drivers.length - 1) {
      setSelectedDriverIndex(selectedDriverIndex + 1);
    }
  };

  return (
    <div className="space-y-12 lg:space-y-20">
      {/* 2. MARKET VITALS - KPIS */}
      <section
        data-wizard-target="rankings-score"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <KPICard
          label="Local Rank"
          value={`#${result.rankPosition}`}
          sub={`of ${result.totalCompetitors} Competitors`}
          trend={rankTrend?.value}
          dir={rankTrend?.dir}
        />
        <KPICard
          label="Happy Patients"
          value={Number(clientRating).toFixed(1)}
          rating
          sub={`Market Avg: ${marketAvgRating.toFixed(1)}`}
          tooltip="Measures overall patient satisfaction based on review ratings and feedback sentiment analysis."
        />
        <KPICard
          label="Total Reviews"
          value={clientReviews.toString()}
          warning={reviewGap > 0}
          sub={
            reviewGap > 0 ? `${reviewGap} behind Leader` : "Leading position"
          }
          tooltip="Total number of reviews across all platforms. Higher volume improves local search visibility."
        />
        <KPICard
          label="Market Reach"
          value={Number(result.rankScore).toFixed(0)}
          suffix="/100"
          sub={
            Number(result.rankScore) >= 80
              ? "Excellent performance"
              : Number(result.rankScore) >= 60
              ? "Good, room to grow"
              : "Needs improvement"
          }
          trend={scoreTrend?.value}
          dir={scoreTrend?.dir}
          tooltip="Alloro's proprietary score measuring your practice's overall digital authority and local search dominance."
        />
      </section>

      {/* 3. COMPETITIVE MATRIX */}
      <section
        data-wizard-target="rankings-competitors"
        className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden"
      >
        <div className="px-10 py-8 border-b border-black/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="text-left">
            <h2 className="text-xl font-black font-heading text-alloro-navy tracking-tight">
              Nearby Practices
            </h2>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
              How you compare to the neighbors
            </p>
          </div>
          <div className="bg-slate-50 px-6 py-3 rounded-2xl border border-black/5 text-[10px] font-black text-alloro-orange uppercase tracking-widest">
            Last checked today
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-50/50 text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.25em] border-b border-black/5">
              <tr>
                <th className="px-10 py-5 w-[40%]">Practice Name</th>
                <th className="px-4 py-5 text-center w-[15%]">Rank</th>
                <th className="px-4 py-5 text-center w-[20%]">Reviews</th>
                <th className="px-10 py-5 text-right w-[25%]">
                  Monthly Growth
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                // Build display list: top competitors + client
                const clientPosition = result.rankPosition;

                // Filter out the client from competitors using GBP location name
                const clientNameBase = (
                  result.gbpLocationName ||
                  result.rawData?.client_gbp?.gbpLocationName ||
                  ""
                )
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, "");

                const isClientMatch = (name: string) => {
                  if (!clientNameBase) return false;
                  const normalizedName = name
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "");
                  return (
                    normalizedName.includes(clientNameBase) ||
                    clientNameBase.includes(normalizedName) ||
                    (clientNameBase.length > 5 &&
                      normalizedName.includes(clientNameBase.slice(0, 6)))
                  );
                };

                const filteredCompetitors = sortedCompetitors.filter(
                  (c) => !isClientMatch(c.name)
                );

                const clientDisplayName =
                  result.gbpLocationName ||
                  result.rawData?.client_gbp?._raw?.locations?.[0]
                    ?.displayName ||
                  result.specialty;

                const clientEntry = {
                  name: clientDisplayName,
                  rankPosition: clientPosition,
                  totalReviews: clientReviews,
                  reviewsLast30d:
                    result.rawData?.client_gbp?.reviewsLast30d || 0,
                  isClient: true,
                };

                const displayList = [
                  ...filteredCompetitors
                    .slice(0, 5)
                    .map((c) => ({ ...c, isClient: false })),
                  clientEntry,
                ]
                  .sort((a, b) => a.rankPosition - b.rankPosition)
                  .slice(0, 6);

                return displayList.map((comp, idx) => (
                  <tr
                    key={idx}
                    className={`${
                      comp.isClient
                        ? "bg-alloro-orange/[0.03]"
                        : "hover:bg-slate-50/30"
                    } transition-all group`}
                  >
                    <td className="px-10 py-7 text-left">
                      <div className="flex flex-col">
                        <span
                          className={`text-[16px] font-black tracking-tight ${
                            comp.isClient
                              ? "text-alloro-orange"
                              : "text-alloro-navy"
                          }`}
                        >
                          {comp.name}
                        </span>
                        {comp.isClient ? (
                          <span className="text-[9px] font-black bg-alloro-orange text-white px-2 py-0.5 rounded uppercase tracking-widest w-fit mt-1.5 leading-none">
                            You
                          </span>
                        ) : (
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest w-fit mt-1.5 leading-none">
                            Competitor
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-7 text-center">
                      <span
                        className={`text-2xl font-black font-heading tabular-nums ${
                          comp.rankPosition <= 3
                            ? "text-alloro-orange"
                            : "text-slate-300"
                        }`}
                      >
                        #{comp.rankPosition}
                      </span>
                    </td>
                    <td className="px-4 py-7 text-center font-black text-alloro-navy tabular-nums font-sans text-lg">
                      {comp.totalReviews.toLocaleString()}
                    </td>
                    <td className="px-10 py-7 text-right">
                      <div className="flex items-center justify-end gap-2 text-green-600 font-black text-lg font-sans">
                        +{comp.reviewsLast30d || 0}
                        <ArrowUpRight size={18} className="opacity-40" />
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. VISIBILITY PROTOCOL (Action Plan) - Only approved tasks */}
      <VisibilityProtocol tasks={tasks} />

      {/* 5. RANK DRIVERS */}
      {result.llmAnalysis?.drivers && result.llmAnalysis.drivers.length > 0 && (
        <section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden text-left">
          <div className="px-10 py-8 border-b border-black/5 flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-black font-heading text-alloro-navy tracking-tight leading-none">
                What's Driving Your Rank
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Key factors influencing your position
              </p>
            </div>
            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center shadow-inner">
              <Zap size={24} />
            </div>
          </div>
          <div className="p-8 lg:p-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.llmAnalysis.drivers.map((driver, idx) => (
                <div
                  key={idx}
                  className={`p-6 rounded-2xl border ${
                    driver.direction === "positive"
                      ? "bg-green-50/50 border-green-100"
                      : "bg-red-50/50 border-red-100"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {driver.direction === "positive" ? (
                      <TrendingUp size={20} className="text-green-600 shrink-0" />
                    ) : (
                      <TrendingDown size={20} className="text-red-600 shrink-0" />
                    )}
                    <p
                      className={`font-black text-lg tracking-tight ${
                        driver.direction === "positive"
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {driver.factor
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDriverIndex(idx)}
                    className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer ${
                      driver.direction === "positive"
                        ? "text-green-600 hover:text-green-700"
                        : "text-red-600 hover:text-red-700"
                    }`}
                  >
                    See details <ChevronRight size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Driver Insight Modal Carousel */}
      {selectedDriverIndex !== null && selectedDriver && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 bg-black/60 z-50 flex flex-col items-center justify-center p-4"
          style={{ margin: 0 }}
          onClick={() => setSelectedDriverIndex(null)}
        >
          <div className="relative flex items-center justify-center w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            {/* Previous Card Preview - Behind and to the left */}
            {selectedDriverIndex > 0 && (
              <motion.div
                key={`prev-${selectedDriverIndex}`}
                initial={{ opacity: 0, x: 50, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={`absolute left-0 z-0 w-80 bg-white rounded-3xl p-6 shadow-lg border hidden lg:block ${
                  drivers[selectedDriverIndex - 1].direction === "positive"
                    ? "border-green-200"
                    : "border-red-200"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  {drivers[selectedDriverIndex - 1].direction === "positive" ? (
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                      <TrendingUp size={20} className="text-green-600" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                      <TrendingDown size={20} className="text-red-600" />
                    </div>
                  )}
                  <p className={`font-black text-base tracking-tight ${
                    drivers[selectedDriverIndex - 1].direction === "positive"
                      ? "text-green-700"
                      : "text-red-700"
                  }`}>
                    {drivers[selectedDriverIndex - 1].factor
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-sm text-slate-500 line-clamp-2">
                    {drivers[selectedDriverIndex - 1].insight || "No insight available"}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Next Card Preview - Behind and to the right */}
            {selectedDriverIndex < drivers.length - 1 && (
              <motion.div
                key={`next-${selectedDriverIndex}`}
                initial={{ opacity: 0, x: -50, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={`absolute right-0 z-0 w-80 bg-white rounded-3xl p-6 shadow-lg border hidden lg:block ${
                  drivers[selectedDriverIndex + 1].direction === "positive"
                    ? "border-green-200"
                    : "border-red-200"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  {drivers[selectedDriverIndex + 1].direction === "positive" ? (
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                      <TrendingUp size={20} className="text-green-600" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                      <TrendingDown size={20} className="text-red-600" />
                    </div>
                  )}
                  <p className={`font-black text-base tracking-tight ${
                    drivers[selectedDriverIndex + 1].direction === "positive"
                      ? "text-green-700"
                      : "text-red-700"
                  }`}>
                    {drivers[selectedDriverIndex + 1].factor
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-sm text-slate-500 line-clamp-2">
                    {drivers[selectedDriverIndex + 1].insight || "No insight available"}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Active Card - Front and center */}
            <motion.div
              key={selectedDriverIndex}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`relative z-10 bg-white rounded-3xl w-full max-w-xl p-10 shadow-2xl border-2 mx-auto ${
                selectedDriver.direction === "positive"
                  ? "border-green-300"
                  : "border-red-300"
              }`}
            >
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  {selectedDriver.direction === "positive" ? (
                    <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center">
                      <TrendingUp size={28} className="text-green-600" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center">
                      <TrendingDown size={28} className="text-red-600" />
                    </div>
                  )}
                  <h3
                    className={`text-2xl font-black tracking-tight ${
                      selectedDriver.direction === "positive"
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {selectedDriver.factor
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedDriverIndex(null)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X size={24} className="text-slate-400" />
                </button>
              </div>
              <div className="bg-slate-50 rounded-2xl p-8">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Insight
                </p>
                <p className="text-slate-700 font-medium leading-relaxed text-lg">
                  {selectedDriver.insight || "No additional insight available for this factor."}
                </p>
              </div>
            </motion.div>
          </div>

          {/* Navigation and pagination - Outside the card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-center gap-6 mt-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Previous button */}
            <button
              onClick={goToPrevDriver}
              disabled={selectedDriverIndex === 0}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                selectedDriverIndex === 0
                  ? "bg-white/20 text-white/40 cursor-not-allowed"
                  : "bg-white text-alloro-navy shadow-lg hover:scale-110 cursor-pointer"
              }`}
            >
              <ChevronLeft size={24} />
            </button>

            {/* Pagination dots */}
            <div className="flex items-center justify-center gap-3">
              {drivers.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedDriverIndex(idx)}
                  className={`h-3 rounded-full transition-all cursor-pointer ${
                    idx === selectedDriverIndex
                      ? "bg-white w-8"
                      : "bg-white/40 hover:bg-white/60 w-3"
                  }`}
                />
              ))}
            </div>

            {/* Next button */}
            <button
              onClick={goToNextDriver}
              disabled={selectedDriverIndex === drivers.length - 1}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                selectedDriverIndex === drivers.length - 1
                  ? "bg-white/20 text-white/40 cursor-not-allowed"
                  : "bg-white text-alloro-navy shadow-lg hover:scale-110 cursor-pointer"
              }`}
            >
              <ChevronRight size={24} />
            </button>
          </motion.div>
        </div>
      )}

      {/* 6. GAPS / OPPORTUNITIES */}
      {result.llmAnalysis?.gaps && result.llmAnalysis.gaps.length > 0 && (
        <section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden text-left">
          <div className="px-10 py-8 border-b border-black/5 flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-black font-heading text-alloro-navy tracking-tight leading-none">
                Opportunities to Improve
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Areas where you can gain ground
              </p>
            </div>
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shadow-inner">
              <Lightbulb size={24} />
            </div>
          </div>
          <div className="p-8 lg:p-10 space-y-4">
            {result.llmAnalysis.gaps.map((gap, idx) => (
              <div
                key={idx}
                className="p-6 bg-slate-50/50 rounded-2xl border border-black/5"
              >
                <span
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border inline-block mb-3 ${
                    gap.impact === "high"
                      ? "bg-red-50 text-red-600 border-red-100"
                      : gap.impact === "medium"
                      ? "bg-amber-50 text-amber-600 border-amber-100"
                      : "bg-blue-50 text-blue-600 border-blue-100"
                  }`}
                >
                  {gap.impact} impact
                </span>
                <p className="font-black text-alloro-navy tracking-tight">
                  {gap.type
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </p>
                <p className="text-sm text-slate-500 font-medium mt-1">
                  {gap.reason}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Visibility Protocol Component - Only shows approved tasks with "View in Tasks" CTA
function VisibilityProtocol({ tasks }: { tasks: RankingTask[] }) {
  const navigate = useNavigate();
  const isWizardActive = useIsWizardActive();

  // Demo tasks for wizard mode
  const demoTasks: RankingTask[] = [
    {
      id: 1,
      title: "Respond to 3 pending Google reviews",
      description: "You have 3 reviews from the past week that need responses. Responding to reviews improves your local ranking and shows potential patients you care.",
      status: "pending",
      category: "Reputation",
      agentType: "ranking",
      isApproved: true,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      metadata: { practiceRankingId: 1, gbpLocationId: null, gbpLocationName: null, priority: "High", impact: "High", effort: "Low", timeline: "This week" },
    },
    {
      id: 2,
      title: "Add 5 new photos to Google Business Profile",
      description: "Practices with 100+ photos get 520% more calls. Your current photo count is below average for your area.",
      status: "pending",
      category: "GBP",
      agentType: "ranking",
      isApproved: true,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      metadata: { practiceRankingId: 1, gbpLocationId: null, gbpLocationName: null, priority: "Medium", impact: "Medium", effort: "Low", timeline: "This week" },
    },
    {
      id: 3,
      title: "Create a Google Business post about services",
      description: "Regular GBP posts boost your visibility. Post about a service or special offer to engage potential patients.",
      status: "pending",
      category: "GBP",
      agentType: "ranking",
      isApproved: true,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      metadata: { practiceRankingId: 1, gbpLocationId: null, gbpLocationName: null, priority: "Medium", impact: "Medium", effort: "Low", timeline: "This week" },
    },
  ];

  // Use demo tasks when wizard is active and no real tasks
  const effectiveTasks = isWizardActive && (!tasks || tasks.length === 0) ? demoTasks : tasks;

  return (
    <section
      data-wizard-target="rankings-factors"
      className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden text-left"
    >
      <div className="px-10 py-8 border-b border-black/5 flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-xl font-black font-heading text-alloro-navy tracking-tight leading-none">
            Rank Improvement Plan
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Steps to reach #1
          </p>
        </div>
        <div className="w-12 h-12 bg-alloro-orange/10 text-alloro-orange rounded-xl flex items-center justify-center shadow-inner">
          <Rocket size={24} />
        </div>
      </div>
      <div className="p-8 lg:p-12 space-y-6">
        {/* Only render approved tasks */}
        {effectiveTasks && effectiveTasks.length > 0 ? (
          effectiveTasks.slice(0, 3).map((task) => (
            <div
              key={task.id}
              className="p-8 bg-slate-50/50 rounded-2xl border border-black/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 hover:bg-white hover:border-alloro-orange/20 hover:shadow-premium transition-all group"
            >
              <div className="space-y-3">
                <h4 className="font-black text-alloro-navy text-xl tracking-tight leading-none group-hover:text-alloro-orange transition-colors">
                  {task.title}
                </h4>
                <p className="text-[15px] text-slate-500 font-bold tracking-tight leading-relaxed max-w-2xl line-clamp-2">
                  {task.description}
                </p>
              </div>
              <div className="flex items-center gap-6 shrink-0">
                <span
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm ${
                    task.metadata?.priority === "High" ||
                    task.metadata?.priority === "1"
                      ? "bg-red-50 text-red-600 border-red-100"
                      : "bg-blue-50 text-blue-600 border-blue-100"
                  }`}
                >
                  {task.metadata?.priority === "High" ||
                  task.metadata?.priority === "1"
                    ? "High"
                    : "Medium"}{" "}
                  Priority
                </span>
                <button
                  onClick={() =>
                    navigate("/tasks", { state: { scrollToTaskId: task.id } })
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 text-alloro-orange rounded-xl text-[10px] font-black uppercase tracking-widest border border-alloro-orange/20 hover:bg-alloro-orange hover:text-white transition-all cursor-pointer"
                >
                  <ExternalLink size={14} />
                  View in Tasks
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm font-bold">
              No approved protocol tasks available yet.
            </p>
            <p className="text-xs text-slate-300 mt-2">
              Tasks will appear here once they're approved by your team.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// Loading Skeleton Component
function LoadingSkeleton() {
  return (
    <div className="space-y-12 animate-pulse">
      {/* Location Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="p-10 rounded-3xl border-2 border-slate-100 bg-white"
          >
            <div className="flex gap-6 mb-10">
              <div className="w-14 h-14 bg-slate-200 rounded-2xl" />
              <div>
                <div className="h-6 w-40 bg-slate-200 rounded mb-2" />
                <div className="h-3 w-24 bg-slate-200 rounded" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="bg-slate-50 rounded-2xl p-5">
                  <div className="h-8 w-12 bg-slate-200 rounded mx-auto mb-2" />
                  <div className="h-3 w-16 bg-slate-200 rounded mx-auto" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* KPI Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-white p-8"
          >
            <div className="h-3 w-24 bg-slate-200 rounded mb-8" />
            <div className="h-12 w-32 bg-slate-200 rounded mb-2" />
            <div className="h-3 w-40 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default RankingsDashboard;
