/**
 * "What If" Score Simulator
 *
 * Interactive component that lets the business owner see how
 * specific actions would change their clarity reading.
 *
 * Client-side calculation only, no API calls needed.
 * Uses the same sub-score weights as the backend scoring engine.
 *
 * Renders below the Score Improvement Plan on the dashboard.
 */

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Zap, TrendingUp, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/index";
import { warmCardVariants } from "@/lib/animations";

import { REVIEW_VOLUME_BENCHMARKS } from "@/constants/businessMetrics";

const REVIEW_OPTIONS = [0, 5, 10, 25, 50];
const PHOTO_OPTIONS = [0, 5, 10, 20];

interface SimulatorData {
  currentScore: number;
  reviewCount: number;
  photoCount: number;
  specialty: string;
  hasResponseData: boolean;
  reviewResponseRate: number;
}

function calculateProjectedScore(
  data: SimulatorData,
  addReviews: number,
  addPhotos: number,
  respondToAll: boolean,
): number {
  const specKey = data.specialty.toLowerCase();
  const benchmark = REVIEW_VOLUME_BENCHMARKS[specKey] || 50;

  // Calculate new trust signal from added reviews
  const newReviewCount = data.reviewCount + addReviews;
  const volumeRatio = newReviewCount / benchmark;
  let reviewVolumePts = 0;
  if (volumeRatio >= 3) reviewVolumePts = 10;
  else if (volumeRatio >= 2) reviewVolumePts = 9;
  else if (volumeRatio >= 1.5) reviewVolumePts = 8;
  else if (volumeRatio >= 1) reviewVolumePts = 7;
  else if (volumeRatio >= 0.5) reviewVolumePts = 5;
  else if (volumeRatio >= 0.25) reviewVolumePts = 3;
  else if (volumeRatio > 0) reviewVolumePts = 1;

  // Old volume points for delta
  const oldVolumeRatio = data.reviewCount / benchmark;
  let oldReviewVolumePts = 0;
  if (oldVolumeRatio >= 3) oldReviewVolumePts = 10;
  else if (oldVolumeRatio >= 2) oldReviewVolumePts = 9;
  else if (oldVolumeRatio >= 1.5) oldReviewVolumePts = 8;
  else if (oldVolumeRatio >= 1) oldReviewVolumePts = 7;
  else if (oldVolumeRatio >= 0.5) oldReviewVolumePts = 5;
  else if (oldVolumeRatio >= 0.25) oldReviewVolumePts = 3;
  else if (oldVolumeRatio > 0) oldReviewVolumePts = 1;

  let trustDelta = reviewVolumePts - oldReviewVolumePts;

  // More reviews also improve recency (assuming new reviews are recent)
  if (addReviews > 0) {
    // New reviews push recency to "within a week" = 8 pts
    // Estimate current recency as moderate (4 pts) if we don't know
    trustDelta += 4; // Conservative recency boost
  }

  // Photo delta for first impression
  const newPhotos = data.photoCount + addPhotos;
  let newPhotoPts = 0;
  if (newPhotos >= 8) newPhotoPts = 10;
  else if (newPhotos >= 5) newPhotoPts = 8;
  else if (newPhotos >= 2) newPhotoPts = 5;
  else if (newPhotos >= 1) newPhotoPts = 3;

  let oldPhotoPts = 0;
  if (data.photoCount >= 8) oldPhotoPts = 10;
  else if (data.photoCount >= 5) oldPhotoPts = 8;
  else if (data.photoCount >= 2) oldPhotoPts = 5;
  else if (data.photoCount >= 1) oldPhotoPts = 3;

  const impressionDelta = newPhotoPts - oldPhotoPts;

  // Responsiveness delta from responding to all reviews
  let responsivenessDelta = 0;
  if (respondToAll && !data.hasResponseData) {
    // If no response data before, responding moves from neutral (14) toward full (20)
    responsivenessDelta = 6;
  } else if (respondToAll && data.reviewResponseRate < 80) {
    // Boost from current response rate to 80%+
    responsivenessDelta = 4;
  }

  // Cap the total at 100
  return Math.min(100, data.currentScore + trustDelta + impressionDelta + responsivenessDelta);
}

export default function ScoreSimulator() {
  const [addReviews, setAddReviews] = useState(0);
  const [addPhotos, setAddPhotos] = useState(0);
  const [respondToAll, setRespondToAll] = useState(false);

  // Fetch the org's current score and place data from the improvement plan endpoint
  const { data: planData } = useQuery({
    queryKey: ["improvement-plan"],
    queryFn: () => apiGet({ path: "/user/improvement-plan" }),
    staleTime: 5 * 60 * 1000,
  });

  // Also fetch checkup context for more data
  const { data: dashData } = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    staleTime: 5 * 60 * 1000,
  });

  const simulatorData: SimulatorData | null = useMemo(() => {
    const score = planData?.currentScore;
    if (!score && score !== 0) return null;

    const checkup = dashData?.checkup_context?.data;
    const place = checkup?.place || {};
    const market = checkup?.market || {};

    return {
      currentScore: score,
      reviewCount: place.reviewCount || 0,
      photoCount: place.photoCount || place.photos || 0,
      specialty: market.specialty || "local business",
      hasResponseData: false, // Neutral assumption
      reviewResponseRate: 0,
    };
  }, [planData, dashData]);

  if (!simulatorData || simulatorData.currentScore === 0) return null;

  const projectedScore = calculateProjectedScore(
    simulatorData,
    addReviews,
    addPhotos,
    respondToAll,
  );

  const delta = projectedScore - simulatorData.currentScore;
  const hasChanges = addReviews > 0 || addPhotos > 0 || respondToAll;

  return (
    <motion.div
      variants={warmCardVariants}
      className="card-primary"
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#D56753]/15 to-[#D56753]/5 flex items-center justify-center">
          <Zap className="w-4 h-4 text-[#D56753]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1A1D23]">What If...</p>
          <p className="text-xs text-gray-400">See how actions change your score</p>
        </div>
      </div>

      {/* Score projection display */}
      {hasChanges && (
        <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-[#D56753]/5 to-emerald-50/50 border border-[#D56753]/10">
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl font-semibold text-[#1A1D23]">{simulatorData.currentScore}</span>
            <ArrowRight className="w-5 h-5 text-[#D56753]" />
            <span className="text-2xl font-semibold text-emerald-600">{projectedScore}</span>
            <span className={`text-sm font-semibold px-2 py-0.5 rounded-lg ${
              delta > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
            }`}>
              {delta > 0 ? "+" : ""}{delta}
            </span>
          </div>
          <p className="text-xs text-center text-gray-400 mt-1.5">Projected clarity reading</p>
        </div>
      )}

      {/* Review slider */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Add more reviews</span>
            <span className="text-xs font-semibold text-[#1A1D23]">
              {addReviews === 0 ? "None" : `+${addReviews}`}
            </span>
          </div>
          <div className="flex gap-1.5">
            {REVIEW_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAddReviews(n)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  addReviews === n
                    ? "bg-[#D56753] text-white shadow-sm"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {n === 0 ? "0" : `+${n}`}
              </button>
            ))}
          </div>
        </div>

        {/* Photo slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Add more photos</span>
            <span className="text-xs font-semibold text-[#1A1D23]">
              {addPhotos === 0 ? "None" : `+${addPhotos}`}
            </span>
          </div>
          <div className="flex gap-1.5">
            {PHOTO_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAddPhotos(n)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  addPhotos === n
                    ? "bg-[#D56753] text-white shadow-sm"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {n === 0 ? "0" : `+${n}`}
              </button>
            ))}
          </div>
        </div>

        {/* Respond to reviews toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">Respond to all reviews</span>
          <button
            type="button"
            onClick={() => setRespondToAll(!respondToAll)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              respondToAll ? "bg-[#D56753]" : "bg-gray-200"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                respondToAll ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* CTA */}
      {hasChanges && delta > 0 && (
        <a
          href="#improvement-plan"
          className="mt-5 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#D56753]/10 text-[#D56753] text-sm font-semibold hover:bg-[#D56753]/15 transition-colors"
        >
          <TrendingUp className="w-4 h-4" />
          Start with your improvement plan
        </a>
      )}

      {!hasChanges && (
        <p className="mt-4 text-xs text-center text-gray-400">
          Adjust the options above to see how your score could change
        </p>
      )}
    </motion.div>
  );
}
