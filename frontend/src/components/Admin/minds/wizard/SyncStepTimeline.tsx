import { useState } from "react";
import { motion } from "framer-motion";
import { Check, AlertCircle } from "lucide-react";
import type { SyncStep } from "../../../../api/minds";

const STEP_LABELS: Record<string, { label: string; description: string }> = {
  INIT: { label: "Initializing", description: "Setting up the sync run" },
  FETCH_APPROVED_POSTS: { label: "Fetching Posts", description: "Loading approved posts from discovery" },
  EXTRACT_CONTENT: { label: "Extracting Content", description: "Scraping approved posts for content" },
  COMPILE_MARKDOWN: { label: "Compiling Content", description: "Assembling scraped content into markdown" },
  LOAD_CURRENT_VERSION: { label: "Loading Brain", description: "Reading the current knowledge base" },
  RUN_LLM_COMPARISON: { label: "AI Comparison", description: "Comparing new content against knowledge" },
  VALIDATE_PROPOSALS: { label: "Validating", description: "Checking proposal integrity" },
  STORE_PROPOSALS: { label: "Saving Proposals", description: "Storing proposals for review" },
  COMPLETE: { label: "Complete", description: "Finished successfully" },
  APPLY_APPROVED_PROPOSALS: { label: "Applying Changes", description: "Merging approved proposals into brain" },
  VALIDATE_BRAIN_SIZE: { label: "Validating Size", description: "Ensuring brain stays within limits" },
  CREATE_NEW_VERSION: { label: "Creating Version", description: "Saving the new brain version" },
  PUBLISH_VERSION: { label: "Publishing", description: "Making the new version live" },
  FINALIZE_PROPOSALS: { label: "Finalizing", description: "Closing out processed proposals" },
};

type StepState = "completed" | "running" | "pending" | "failed";

function getStepState(step: SyncStep): StepState {
  return step.status as StepState;
}

function getStepLabel(stepName: string) {
  return STEP_LABELS[stepName] || { label: stepName, description: "" };
}

interface SyncStepTimelineProps {
  steps: SyncStep[];
  className?: string;
}

export function SyncStepTimeline({ steps, className = "" }: SyncStepTimelineProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const currentStepIndex = (() => {
    for (let i = 0; i < steps.length; i++) {
      const state = getStepState(steps[i]);
      if (state === "running") return i;
      if (state === "pending") return Math.max(0, i - 1);
      if (state === "failed") return i;
    }
    return steps.length - 1;
  })();

  return (
    <div className={`w-full ${className}`}>
      <div className="relative px-8 pt-12 pb-28">
        {/* Connection Lines */}
        <div className="absolute top-[5.5rem] left-0 w-full -translate-y-1/2 px-16">
          <div className="h-1 bg-gray-100 rounded-full w-full" />
          <div className="absolute top-0 left-0 h-1 rounded-full overflow-hidden w-full px-16">
            <motion.div
              className="h-full bg-gradient-to-r from-alloro-orange/60 via-alloro-orange to-alloro-orange"
              initial={{ width: "0%" }}
              animate={{
                width: `${(currentStepIndex / Math.max(steps.length - 1, 1)) * 100}%`,
              }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="relative z-10 flex justify-between items-start w-full">
          {steps.map((step, index) => {
            const state = getStepState(step);
            const { label, description } = getStepLabel(step.step_name);
            const isHovered = hoveredIndex === index;
            const isExpanded = state === "running" || isHovered;

            return (
              <div
                key={step.id}
                className={`relative flex flex-col items-center group transition-all duration-300 ${
                  isHovered ? "z-20" : "z-10"
                }`}
                style={{ width: `${100 / steps.length}%`, maxWidth: "120px" }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Node */}
                <div className="relative flex items-center justify-center h-20 w-20 shrink-0">
                  {/* Running: rotating SVG border */}
                  {state === "running" && (
                    <div className="absolute inset-0 z-0">
                      <svg
                        className="w-full h-full text-alloro-orange drop-shadow-[0_4px_10px_rgba(214,104,83,0.3)]"
                        viewBox="0 0 100 100"
                      >
                        <circle
                          cx="50" cy="50" r="44"
                          fill="none"
                          stroke="currentColor"
                          strokeOpacity="0.1"
                          strokeWidth="3"
                        />
                        <motion.circle
                          cx="50" cy="50" r="44"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray="70 200"
                          initial={{ rotate: -90 }}
                          animate={{ rotate: 270 }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          style={{ transformOrigin: "center" }}
                        />
                        <motion.circle
                          cx="50" cy="50" r="38"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                          strokeLinecap="round"
                          strokeDasharray="40 200"
                          strokeOpacity="0.5"
                          initial={{ rotate: 90 }}
                          animate={{ rotate: -270 }}
                          transition={{
                            duration: 2.5,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          style={{ transformOrigin: "center" }}
                        />
                      </svg>
                    </div>
                  )}

                  {/* Hover ring */}
                  {isHovered && state !== "running" && (
                    <motion.div
                      className="absolute inset-2 rounded-full border-2 border-alloro-orange/30"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    />
                  )}

                  {/* Circle */}
                  <motion.div
                    animate={{
                      width: isExpanded ? 64 : 44,
                      height: isExpanded ? 64 : 44,
                      backgroundColor:
                        state === "completed"
                          ? "#D66853"
                          : state === "failed"
                          ? "#ef4444"
                          : "var(--step-node-bg, #ffffff)",
                      borderColor:
                        state === "completed"
                          ? "#D66853"
                          : state === "failed"
                          ? "#ef4444"
                          : isExpanded
                          ? "var(--step-node-border-expanded, #D66853)"
                          : "var(--step-node-border, #e2e8f0)",
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className={`relative z-10 flex items-center justify-center rounded-full border-2 shadow-sm ${
                      state === "pending" ? "text-gray-300" : ""
                    } ${state === "running" ? "text-alloro-orange shadow-inner" : ""} ${
                      state === "completed" || state === "failed" ? "text-white" : ""
                    }`}
                  >
                    {state === "completed" ? (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: isExpanded ? 1.2 : 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Check className={`stroke-[3] ${isExpanded ? "h-7 w-7" : "h-5 w-5"}`} />
                      </motion.div>
                    ) : state === "failed" ? (
                      <AlertCircle className={isExpanded ? "h-7 w-7" : "h-5 w-5"} />
                    ) : (
                      <span
                        className={`font-bold ${
                          isExpanded ? "text-lg" : "text-sm"
                        } ${state === "running" ? "text-alloro-orange" : "text-gray-300"}`}
                      >
                        {index + 1}
                      </span>
                    )}
                  </motion.div>
                </div>

                {/* Label & Description */}
                <div className="absolute top-20 w-40 flex flex-col items-center text-center pointer-events-none">
                  <motion.span
                    animate={{
                      scale: state === "running" ? 1.05 : 0.9,
                      color:
                        state === "running"
                          ? "var(--step-label-running, #1e3a5f)"
                          : state === "completed"
                          ? "#D66853"
                          : state === "failed"
                          ? "#ef4444"
                          : "var(--step-label-pending, #94a3b8)",
                      fontWeight: state === "running" ? 700 : 500,
                      y: state === "running" ? 0 : 4,
                    }}
                    className={`transition-colors mb-1 block ${
                      state === "running" ? "text-xs" : "text-[10px]"
                    }`}
                  >
                    {label}
                  </motion.span>

                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{
                      opacity: isExpanded ? 1 : 0,
                      height: isExpanded ? "auto" : 0,
                      y: isExpanded ? 0 : -10,
                    }}
                    className="overflow-hidden px-1"
                  >
                    <p
                      className={`font-medium leading-relaxed py-1 px-2 rounded-lg border backdrop-blur-sm text-[9px] ${
                        state === "running"
                          ? "bg-white/80 text-alloro-orange/80 border-alloro-orange/20 shadow-sm"
                          : state === "completed"
                          ? "bg-alloro-orange/5 text-alloro-orange/70 border-alloro-orange/10"
                          : state === "failed"
                          ? "bg-red-50 text-red-600 border-red-100"
                          : "bg-gray-50 text-gray-400 border-gray-100"
                      }`}
                    >
                      {state === "failed" && step.error_message
                        ? step.error_message.slice(0, 80)
                        : description}
                    </p>
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
