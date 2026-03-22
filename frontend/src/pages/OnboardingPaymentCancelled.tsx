/**
 * Onboarding Payment Cancelled Page
 *
 * Users land here when they cancel/exit Stripe Checkout during onboarding.
 * Provides a "Try Again" button to return to the onboarding plan chooser.
 * Onboarding is NOT complete — they must pay to enter the app.
 */

import { motion } from "framer-motion";
import { XCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function OnboardingPaymentCancelled() {
  const navigate = useNavigate();

  const handleTryAgain = () => {
    // Return to onboarding — the container will resume at Step 4 (plan chooser)
    navigate("/new-account-onboarding");
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen font-body relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(214, 104, 83, 0.08) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(214, 104, 83, 0.05) 0%, transparent 40%), #F3F4F6",
      }}
    >
      <div className="text-center space-y-8 max-w-md px-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="space-y-6"
        >
          <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
            <XCircle className="w-10 h-10 text-slate-400" />
          </div>
          <h1 className="text-3xl font-bold font-heading text-alloro-navy tracking-tight">
            Payment Cancelled
          </h1>
          <p className="text-slate-500">
            No worries — you can try again whenever you're ready. A subscription
            is required to access Alloro.
          </p>
          <button
            onClick={handleTryAgain}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white font-semibold hover:shadow-lg hover:shadow-alloro-orange/30 hover:-translate-y-0.5 transition-all flex items-center gap-2 mx-auto"
          >
            <ArrowLeft size={18} />
            Try Again
          </button>
        </motion.div>
      </div>
    </div>
  );
}
