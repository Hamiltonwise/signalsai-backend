/**
 * BillingTab Component
 *
 * Displays subscription billing information in the Settings page.
 * Shows current plan, upgrade options, and billing management.
 *
 * Handles three states:
 * 1. Paid subscription (Stripe active) — show plan + manage button
 * 2. Admin-granted (no Stripe) — show plan + add payment CTA
 * 3. Locked out — show urgent payment CTA
 */

import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CreditCard,
  Crown,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Globe,
  BarChart3,
  FileText,
  Users,
  Lock,
} from "lucide-react";
import {
  getBillingStatus,
  createCheckoutSession,
  createPortalSession,
  type BillingStatus,
} from "../../api/billing";
import { showWarningToast } from "../../lib/toast";

// ─── Plan Details (Single Product) ───

const PLAN = {
  name: "Alloro Intelligence",
  price: "$2,000",
  period: "/month",
  features: [
    { icon: BarChart3, label: "Practice rankings tracking" },
    { icon: FileText, label: "Task management" },
    { icon: Users, label: "Team collaboration" },
    { icon: Zap, label: "AI-powered insights" },
    { icon: Globe, label: "AI-powered website builder" },
    { icon: Crown, label: "Custom domain support" },
  ],
};

export const BillingTab: React.FC = () => {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  useEffect(() => {
    fetchBillingStatus();
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();

  // Handle ?cancelled=true → show warning toast + clean URL
  useEffect(() => {
    if (searchParams.get("cancelled") === "true") {
      showWarningToast(
        "Payment interrupted",
        "Your checkout was cancelled. You can try again anytime."
      );
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Handle billing success (legacy param from Stripe success_url)
  useEffect(() => {
    if (searchParams.get("billing") === "success") {
      fetchBillingStatus();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchBillingStatus = async () => {
    try {
      const status = await getBillingStatus();
      if (status.success !== false) {
        setBilling(status);
      }
    } catch (err) {
      console.error("Failed to fetch billing status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckout = async () => {
    setIsCheckoutLoading(true);
    try {
      const response = await createCheckoutSession("DFY");
      if (response.success && response.url) {
        window.location.href = response.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsPortalLoading(true);
    try {
      const response = await createPortalSession();
      if (response.success && response.url) {
        window.location.href = response.url;
      }
    } catch (err) {
      console.error("Portal error:", err);
    } finally {
      setIsPortalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-[2rem] border border-black/5 p-8 shadow-premium animate-pulse">
          <div className="h-6 w-48 bg-slate-100 rounded mb-4" />
          <div className="h-4 w-72 bg-slate-100 rounded mb-8" />
          <div className="h-48 bg-slate-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  const isAdminGranted = billing?.isAdminGranted ?? false;
  const hasStripe = billing?.hasStripeSubscription ?? false;
  const isLockedOut = billing?.isLockedOut ?? false;

  return (
    <div className="space-y-8">
      {/* Locked Out Banner */}
      {isLockedOut && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-4"
        >
          <div className="p-2 bg-red-100 rounded-xl shrink-0">
            <Lock size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-red-900 font-bold text-sm">
              Account Locked
            </h3>
            <p className="text-red-700 text-sm mt-1">
              Your account has been locked. Please add a payment method to
              restore full access to the application.
            </p>
          </div>
        </motion.div>
      )}

      {/* Admin-Granted Banner */}
      {isAdminGranted && !isLockedOut && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-4"
        >
          <div className="p-2 bg-amber-100 rounded-xl shrink-0">
            <AlertTriangle size={20} className="text-amber-600" />
          </div>
          <div>
            <h3 className="text-amber-900 font-bold text-sm">
              Payment Method Required
            </h3>
            <p className="text-amber-700 text-sm mt-1">
              Add a payment method to ensure uninterrupted access to Alloro.
            </p>
          </div>
        </motion.div>
      )}

      {/* Plan Card — subscribed vs unsubscribed */}
      {hasStripe ? (
        /* ── Active Subscription Card ── */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[2rem] border border-black/5 shadow-premium relative overflow-hidden"
        >
          {/* Navy header strip */}
          <div className="bg-alloro-navy px-6 lg:px-8 pt-6 lg:pt-8 pb-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-alloro-orange/[0.06] rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/[0.02] rounded-full blur-2xl -ml-24 -mb-24 pointer-events-none" />

            <div className="relative z-10 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
                    <Crown size={18} className="text-alloro-orange" />
                  </div>
                  <div className="px-2.5 py-1 bg-green-500/20 border border-green-400/30 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-green-400" />
                    <span className="text-green-300 text-[10px] font-black uppercase tracking-wider">
                      Active
                    </span>
                  </div>
                </div>
                <h3 className="text-xl font-black text-white tracking-tight mb-0.5">
                  {PLAN.name}
                </h3>
                <p className="text-white/40 text-sm font-medium">
                  Your active subscription
                </p>
              </div>

              <div className="text-right">
                <div className="flex items-baseline gap-0.5 justify-end">
                  <span className="text-3xl font-black text-white tracking-tighter">
                    {PLAN.price}
                  </span>
                  <span className="text-white/30 font-bold text-sm">
                    {PLAN.period}
                  </span>
                </div>
                {billing?.currentPeriodEnd && (
                  <p className="text-white/25 text-xs font-medium mt-1">
                    Renews{" "}
                    {new Date(billing.currentPeriodEnd).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" }
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* White body with features + action */}
          <div className="bg-white px-6 lg:px-8 pb-6 lg:pb-8 pt-6 relative">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-6">
              {PLAN.features.map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.04 }}
                  className="flex items-center gap-2.5 group"
                >
                  <div className="w-7 h-7 rounded-lg bg-alloro-orange/[0.07] flex items-center justify-center shrink-0 group-hover:bg-alloro-orange/15 transition-colors">
                    <feature.icon
                      size={14}
                      className="text-alloro-orange"
                    />
                  </div>
                  <span className="text-sm text-slate-600 font-medium">
                    {feature.label}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="pt-4 border-t border-black/5">
              <button
                onClick={handleManageSubscription}
                disabled={isPortalLoading}
                className="px-5 py-2.5 bg-alloro-navy text-white rounded-xl text-sm font-bold hover:bg-alloro-navy/90 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <CreditCard size={16} />
                {isPortalLoading ? "Opening..." : "Manage Subscription"}
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
        /* ── Subscribe CTA Card ── */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] border border-black/5 shadow-premium relative overflow-hidden group"
        >
          {/* Dual glow orbs */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-alloro-orange/[0.04] rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none group-hover:bg-alloro-orange/[0.08] transition-all duration-700" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-alloro-orange/[0.02] rounded-full blur-2xl -ml-24 -mb-24 pointer-events-none group-hover:bg-alloro-orange/[0.05] transition-all duration-700" />

          <div className="relative z-10 p-6 lg:p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-alloro-orange to-[#c45a47] flex items-center justify-center shadow-lg shadow-alloro-orange/20 shrink-0">
                <Zap size={22} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-alloro-navy tracking-tight mb-0.5">
                  Get Started with Alloro
                </h3>
                <p className="text-slate-400 text-sm font-medium">
                  Subscribe to unlock the full platform
                </p>
              </div>
            </div>

            <div className="px-3 py-1.5 bg-alloro-orange/[0.07] rounded-lg w-fit mb-6">
              <span className="text-alloro-orange font-black text-[10px] tracking-[0.15em] uppercase">
                {PLAN.name}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-8">
              {PLAN.features.map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.04 }}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-7 h-7 rounded-lg bg-alloro-orange/[0.07] flex items-center justify-center shrink-0">
                    <feature.icon
                      size={14}
                      className="text-alloro-orange"
                    />
                  </div>
                  <span className="text-sm text-slate-600 font-medium">
                    {feature.label}
                  </span>
                </motion.div>
              ))}
            </div>

            <button
              onClick={handleCheckout}
              disabled={isCheckoutLoading}
              className="px-6 py-3 bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white rounded-xl text-sm font-bold hover:shadow-xl hover:shadow-alloro-orange/30 hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <CreditCard size={16} />
              {isCheckoutLoading ? "Processing..." : "Add Payment Method"}
            </button>
          </div>
        </motion.div>
      )}

    </div>
  );
};
