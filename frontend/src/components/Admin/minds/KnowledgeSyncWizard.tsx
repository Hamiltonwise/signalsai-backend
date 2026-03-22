import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, BookOpen, School, ClipboardCheck, Check } from "lucide-react";
import {
  getMindStatus,
  getDiscoveryBatch,
  type DiscoveryBatch,
  type DiscoveredPost,
  type MindStatus,
} from "../../../api/minds";
import { SlideDiscoveryTriage } from "./wizard/SlideDiscoveryTriage";
import { SlideSyncProgress } from "./wizard/SlideSyncProgress";
import { SlideProposalsReview } from "./wizard/SlideProposalsReview";

interface KnowledgeSyncWizardProps {
  mindId: string;
  mindName: string;
}

type SlideKey = 1 | 2 | 3;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

const slideTransition = {
  x: { type: "spring" as const, stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};

interface StepConfig {
  label: string;
  description: string;
  icon: React.ReactNode;
}

function buildSteps(mindName: string): StepConfig[] {
  return [
    {
      label: "Agentic Library",
      description: `Today's reading list for ${mindName}`,
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      label: "Agentic Classroom",
      description: `${mindName} is in class, learning and understanding`,
      icon: <School className="h-4 w-4" />,
    },
    {
      label: "Intake",
      description: "You decide what sticks after class",
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
  ];
}

export function KnowledgeSyncWizard({
  mindId,
  mindName,
}: KnowledgeSyncWizardProps) {
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState<SlideKey>(1);
  const [direction, setDirection] = useState(1);

  // Server state
  const [, setStatus] = useState<MindStatus | null>(null);
  const [batch, setBatch] = useState<DiscoveryBatch | null>(null);
  const [posts, setPosts] = useState<DiscoveredPost[]>([]);

  // Run tracking for slides 2 & 3
  const [activeScrapeRunId, setActiveScrapeRunId] = useState<string | null>(
    null
  );
  const [scrapeRunIdForProposals, setScrapeRunIdForProposals] = useState<
    string | null
  >(null);
  const [initialCompileRunId, setInitialCompileRunId] = useState<
    string | null
  >(null);

  const fetchState = useCallback(async () => {
    const [statusData, discoveryData] = await Promise.all([
      getMindStatus(mindId),
      getDiscoveryBatch(mindId),
    ]);
    setStatus(statusData);
    setBatch(discoveryData.batch);
    setPosts(discoveryData.posts);
    return { statusData, discoveryData };
  }, [mindId]);

  const deriveSlide = useCallback(
    (
      statusData: MindStatus,
      batchData: DiscoveryBatch | null,
      postList: DiscoveredPost[]
    ): SlideKey => {
      if (!batchData) return 1;

      if (statusData.activeSyncRunId) {
        // Active compile_publish run — go to slide 3 in compile mode
        if (statusData.activeSyncRunType === "compile_publish") {
          setScrapeRunIdForProposals(statusData.latestScrapeRunId);
          setInitialCompileRunId(statusData.activeSyncRunId);
          return 3;
        }
        // Active scrape_compare run — go to slide 2
        setActiveScrapeRunId(statusData.activeSyncRunId);
        return 2;
      }

      if (statusData.latestScrapeRunId) {
        setScrapeRunIdForProposals(statusData.latestScrapeRunId);
        return 3;
      }

      const pendingCount = postList.filter((p) => p.status === "pending").length;
      if (pendingCount > 0) return 1;

      return 1;
    },
    []
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { statusData, discoveryData } = await fetchState();
      const slide = deriveSlide(
        statusData,
        discoveryData.batch,
        discoveryData.posts
      );
      setCurrentSlide(slide);
      setLoading(false);
    })();
  }, [mindId]);

  const goToSlide = (slide: SlideKey) => {
    setDirection(slide > currentSlide ? 1 : -1);
    setCurrentSlide(slide);
  };

  const refreshAndNotify = async () => {
    await fetchState();
  };

  // ─── Slide callbacks ──────────────────────────────────────────

  const handleTriageContinue = () => {
    goToSlide(2);
  };

  const handlePostsChanged = () => {
    refreshAndNotify();
  };

  const handleBatchDeleted = async () => {
    await fetchState();
    setActiveScrapeRunId(null);
    setScrapeRunIdForProposals(null);
    goToSlide(1);
  };

  const handleSyncRunStarted = (runId: string) => {
    setActiveScrapeRunId(runId);
  };

  const handleSyncComplete = (runId: string) => {
    setScrapeRunIdForProposals(runId);
    refreshAndNotify();
    goToSlide(3);
  };

  const handleSyncBack = () => {
    goToSlide(1);
  };

  const handleProposalsDone = async () => {
    setActiveScrapeRunId(null);
    setScrapeRunIdForProposals(null);
    setInitialCompileRunId(null);
    await fetchState();
    goToSlide(1);
  };

  const handleProposalsBack = () => {
    goToSlide(2);
  };

  // ─── Loading ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Wizard Step Indicator ─────────────────────────────────────

  const steps = buildSteps(mindName);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Step indicator — prominent */}
      <div className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 px-8 py-5">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {steps.map((step, i) => {
            const stepNum = (i + 1) as SlideKey;
            const isActive = currentSlide === stepNum;
            const isPast = currentSlide > stepNum;
            return (
              <div key={step.label} className="flex items-center flex-1">
                {i > 0 && (
                  <div className="flex-1 mx-3">
                    <div
                      className={`h-0.5 rounded-full transition-colors duration-500 ${
                        isPast ? "bg-alloro-orange" : "bg-gray-200"
                      }`}
                    />
                  </div>
                )}
                <div className="flex flex-col items-center text-center min-w-0">
                  <motion.div
                    animate={{
                      scale: isActive ? 1 : 0.9,
                      backgroundColor: isActive
                        ? "#D66853"
                        : isPast
                          ? "#D66853"
                          : "var(--step-node-bg, #f3f4f6)",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 shadow-sm ${
                      isActive || isPast ? "text-white" : "text-gray-400"
                    }`}
                  >
                    {isPast ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      step.icon
                    )}
                  </motion.div>
                  <span
                    className={`text-sm font-semibold transition-colors ${
                      isActive
                        ? "text-gray-900"
                        : isPast
                          ? "text-alloro-orange"
                          : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span
                    className={`text-[11px] mt-0.5 transition-colors max-w-[160px] ${
                      isActive
                        ? "text-gray-500"
                        : isPast
                          ? "text-alloro-orange/60"
                          : "text-gray-300"
                    }`}
                  >
                    {step.description}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Slide content */}
      <div className="relative overflow-hidden px-6 py-5">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentSlide}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
          >
            {currentSlide === 1 && (
              <SlideDiscoveryTriage
                mindId={mindId}
                mindName={mindName}
                batch={batch}
                posts={posts}
                onPostsChanged={handlePostsChanged}
                onBatchDeleted={handleBatchDeleted}
                onContinue={handleTriageContinue}
              />
            )}

            {currentSlide === 2 && (
              <SlideSyncProgress
                mindId={mindId}
                mindName={mindName}
                runId={activeScrapeRunId}
                onRunStarted={handleSyncRunStarted}
                onComplete={handleSyncComplete}
                onBack={handleSyncBack}
              />
            )}

            {currentSlide === 3 && scrapeRunIdForProposals && (
              <SlideProposalsReview
                mindId={mindId}
                mindName={mindName}
                scrapeRunId={scrapeRunIdForProposals}
                initialCompileRunId={initialCompileRunId}
                onBack={handleProposalsBack}
                onDone={handleProposalsDone}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
