/**
 * WarmEmptyState -- WO-61 Component 5
 *
 * Every empty section should feel like an invitation, not a dead end.
 * Answers three questions:
 * 1. What is happening right now?
 * 2. When will it be ready?
 * 3. What will it feel like?
 *
 * Design: warm off-white, subtle pulse dot, no alarm, no anxiety.
 * References: Calm before meditation, Apple during setup.
 */

import { motion } from "framer-motion";

interface WarmEmptyStateProps {
  /** What Alloro is doing right now */
  happening: string;
  /** When the data will be ready */
  when: string;
  /** What the owner will see when it arrives (the promise) */
  promise?: string;
  /** Optional icon -- default is a gentle pulse dot */
  icon?: React.ReactNode;
  /** Optional section name for context */
  section?: string;
}

export default function WarmEmptyState({ happening, when, promise, icon, section }: WarmEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-6 sm:p-8"
    >
      <div className="flex items-start gap-4">
        {/* Pulse indicator -- alive, not dead */}
        <div className="flex-shrink-0 mt-1">
          {icon || (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D56753]/30" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#D56753]/60" />
            </span>
          )}
        </div>

        <div className="space-y-2">
          {section && (
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{section}</p>
          )}

          {/* What's happening */}
          <p className="text-sm font-medium text-[#1A1D23]">{happening}</p>

          {/* When */}
          <p className="text-sm text-gray-500">{when}</p>

          {/* The promise */}
          {promise && (
            <p className="text-sm text-[#1A1D23]/60 italic">{promise}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Preset Empty States ────────────────────────────────────────────
// Use these across pages for consistency

export const WARM_STATES = {
  rankings: {
    happening: "We're scanning your market right now.",
    when: "Your first position report arrives within 24 hours.",
    promise: "You'll see exactly where you stand relative to every competitor in your area.",
  },
  reviews: {
    happening: "Alloro is syncing your Google reviews.",
    when: "Individual reviews appear within 24 hours of your first data refresh.",
    promise: "Each review will include an AI-drafted response you can approve with one tap.",
  },
  sentiment: {
    happening: "We're comparing your review themes against your top competitor.",
    when: "This analysis runs automatically after your reviews sync.",
    promise: "You'll see the exact themes patients praise in your competitor that yours never mention.",
  },
  referrals: {
    happening: "When you connect your data, we'll map your referral network.",
    when: "Upload takes 2 minutes. Intelligence appears immediately.",
    promise: "Most owners are surprised by who actually drives their revenue.",
  },
  presence: {
    happening: "Alloro is reading your Google Business Profile.",
    when: "Your profile data refreshes automatically every week.",
    promise: "You'll see exactly which fields are complete and which ones cost you visibility.",
  },
  progress: {
    happening: "Your first progress snapshot is being recorded.",
    when: "Trends appear after your second week of monitoring.",
    promise: "You'll see where you started, where you are, and where you're headed.",
  },
  intelligence: {
    happening: "Your first intelligence brief is being prepared.",
    when: "It arrives within 4 hours of signup, without you doing anything.",
    promise: "One finding. One action. Specific to your market.",
  },
  proofOfWork: {
    happening: "Alloro is working behind the scenes.",
    when: "Actions appear here as your market is monitored and analyzed.",
    promise: "Every action Alloro takes on your behalf shows up here with a timestamp.",
  },
} as const;
