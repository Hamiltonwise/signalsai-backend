/**
 * Step3_PlanChooser — Onboarding Step 4
 *
 * Single-product model: displays one subscription card for Alloro
 * and proceeds to Stripe Checkout. No plan selection needed.
 */

import React from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Globe,
  Users,
  Zap,
  Crown,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Shield,
} from "lucide-react";

interface Step3PlanChooserProps {
  onSubscribe: () => void;
  onBack: () => void;
  isProcessing: boolean;
}

const FEATURES = [
  { icon: BarChart3, label: "Practice rankings & insights" },
  { icon: Globe, label: "AI-powered website builder" },
  { icon: Users, label: "Team collaboration tools" },
  { icon: Zap, label: "AI-powered intelligence" },
  { icon: CheckCircle2, label: "Task management & alerts" },
  { icon: Crown, label: "Custom domain support" },
];

export const Step3PlanChooser: React.FC<Step3PlanChooserProps> = ({
  onSubscribe,
  onBack,
  isProcessing,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl md:text-3xl font-bold font-heading text-alloro-navy tracking-tight">
          Subscribe to Alloro
        </h2>
        <p className="text-slate-500 text-sm">
          Get full access to your practice intelligence platform.
        </p>
      </div>

      {/* Single Plan Card */}
      <motion.div
        className="relative rounded-2xl border border-alloro-orange/40 bg-alloro-orange/[0.03] shadow-lg shadow-alloro-orange/10 p-6 max-w-md mx-auto"
        whileHover={{ y: -2, boxShadow: "0 8px 30px rgba(214,104,83,0.15)" }}
      >
        {/* Plan Name */}
        <h3 className="text-sm font-black text-alloro-navy uppercase tracking-wider mb-1">
          Alloro Intelligence
        </h3>
        <p className="text-slate-400 text-xs mb-4">
          Full-service digital presence managed by AI and our team
        </p>

        {/* Price */}
        <div className="flex items-baseline gap-1 mb-5">
          <span className="text-3xl font-black text-alloro-navy tracking-tighter">
            $2,000
          </span>
          <span className="text-slate-400 font-bold text-sm">/month</span>
        </div>

        {/* Features */}
        <div className="space-y-2.5 mb-6">
          {FEATURES.map((feature, i) => (
            <div key={i} className="flex items-center gap-2">
              <feature.icon
                size={14}
                className="text-alloro-orange shrink-0"
              />
              <span className="text-sm text-slate-600 font-medium">
                {feature.label}
              </span>
            </div>
          ))}
        </div>

        {/* Subscribe Button */}
        <button
          onClick={onSubscribe}
          disabled={isProcessing}
          className="w-full px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white hover:shadow-lg hover:shadow-alloro-orange/30 hover:-translate-y-0.5"
        >
          {isProcessing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Subscribe Now
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </motion.div>

      {/* Trust signal */}
      <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
        <Shield size={12} />
        <span>Secure payment via Stripe. Cancel anytime.</span>
      </div>

      {/* Back button */}
      <div className="flex justify-start pt-2">
        <button
          onClick={onBack}
          disabled={isProcessing}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>
    </div>
  );
};
