import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, ChevronDown, CheckCircle2, HelpCircle, ArrowRight } from "lucide-react";
import { GoogleConnectButton } from "../components/GoogleConnectButton";
import { GoogleAPITermsModal } from "../components/settings/GoogleAPITermsModal";
import { AccountSelectionHelperModal } from "../components/AccountSelectionHelperModal";

export default function NewAccountOnboarding() {
  const navigate = useNavigate();
  const [step1Completed, setStep1Completed] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showAccountHelp, setShowAccountHelp] = useState(false);

  const handleTermsAccepted = () => {
    setStep1Completed(true);
    setShowTermsModal(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-alloro-bg font-body">
      <div className="max-w-2xl w-full">
        {/* Logo/Brand */}
        <div className="flex justify-center mb-6">
          <img
            src="/logo.png"
            alt="Alloro"
            className="w-14 h-14 rounded-xl shadow-lg shadow-blue-900/20"
          />
        </div>

        {/* Welcome header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
            <span className="w-2 h-2 bg-alloro-orange rounded-full animate-pulse"></span>
            <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">
              New Account Setup
            </span>
          </div>
          <h1 className="text-4xl font-black text-alloro-navy font-heading tracking-tight mb-3">
            Connect Your Practice
          </h1>
          <p className="text-lg text-slate-500 font-medium">
            Link your Google Business Profile to unlock practice insights
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {/* Step 1 - Read API Terms */}
          <AnimatePresence mode="wait">
            {!step1Completed ? (
              <motion.div
                key="step1-active"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                onClick={() => setShowTermsModal(true)}
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
                        Read Our Google API Terms
                      </h3>
                      <span className="px-2 py-1 bg-alloro-orange/10 text-alloro-orange text-[10px] font-black uppercase tracking-wider rounded-lg">
                        Required
                      </span>
                    </div>
                    <p className="text-slate-500 font-medium leading-relaxed mb-4">
                      Review how Alloro uses Google APIs to provide you with
                      analytics and insights for your practice.
                    </p>
                    <div className="flex items-center gap-2 text-alloro-orange font-bold text-sm group-hover:gap-3 transition-all">
                      <FileText className="w-4 h-4" />
                      <span>Read Terms</span>
                    </div>
                  </div>
                </div>
                {/* Decorative arrow */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center z-10">
                  <ChevronDown className="w-4 h-4 text-slate-300" />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step1-completed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative bg-green-50 rounded-3xl border-2 border-green-200 p-8"
              >
                <div className="flex items-start gap-6">
                  {/* Step number */}
                  <div className="shrink-0">
                    <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/30">
                      <CheckCircle2 className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-black text-green-700 tracking-tight">
                        Google API Terms Reviewed
                      </h3>
                      <span className="px-2 py-1 bg-green-100 text-green-600 text-[10px] font-black uppercase tracking-wider rounded-lg">
                        Completed
                      </span>
                    </div>
                    <p className="text-green-600 font-medium leading-relaxed">
                      You've reviewed how Alloro uses Google APIs.
                    </p>
                  </div>
                </div>
                {/* Decorative arrow */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center z-10">
                  <ChevronDown className="w-4 h-4 text-slate-300" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 2 - Connect Google Account */}
          <AnimatePresence mode="wait">
            {step1Completed ? (
              <motion.div
                key="step2-active"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative bg-white rounded-3xl border-2 border-alloro-orange shadow-xl shadow-alloro-orange/10 p-8"
              >
                <div className="flex items-start gap-6">
                  {/* Step number */}
                  <div className="shrink-0">
                    <div className="w-14 h-14 bg-gradient-to-br from-alloro-orange to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-alloro-orange/30">
                      <span className="text-2xl font-black text-white">2</span>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-black text-alloro-navy tracking-tight">
                        Connect Google Business Profile
                      </h3>
                      <span className="px-2 py-1 bg-alloro-orange/10 text-alloro-orange text-[10px] font-black uppercase tracking-wider rounded-lg">
                        Required
                      </span>
                    </div>
                    <p className="text-slate-500 font-medium leading-relaxed mb-4">
                      Connect your Google Business Profile to enable reviews,
                      rankings, and insights for your practice.
                    </p>

                    {/* Google Connect Button */}
                    <div className="space-y-4">
                      <GoogleConnectButton variant="outline" size="lg" />

                      {/* Multiple Accounts Helper Link */}
                      <button
                        onClick={() => setShowAccountHelp(true)}
                        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-alloro-orange transition-colors group"
                      >
                        <HelpCircle className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" />
                        <span className="underline decoration-dashed underline-offset-4 decoration-slate-300 group-hover:decoration-alloro-orange">
                          Seeing multiple accounts? Not sure which to use?
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step2-locked"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-8 opacity-60"
              >
                <div className="flex items-start gap-6">
                  {/* Step number */}
                  <div className="shrink-0">
                    <div className="w-14 h-14 bg-slate-200 rounded-2xl flex items-center justify-center">
                      <span className="text-2xl font-black text-slate-400">
                        2
                      </span>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-black text-slate-400 tracking-tight">
                        Connect Google Business Profile
                      </h3>
                      <span className="px-2 py-1 bg-slate-200 text-slate-400 text-[10px] font-black uppercase tracking-wider rounded-lg">
                        Next
                      </span>
                    </div>
                    <p className="text-slate-400 font-medium leading-relaxed">
                      Complete step 1 first to unlock this step.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Skip option */}
        <div className="text-center mt-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-alloro-orange transition-colors font-medium"
          >
            <span>Skip for now and go to dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Google API Terms Modal */}
      <GoogleAPITermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        onAccept={handleTermsAccepted}
      />

      {/* Account Selection Helper Modal */}
      <AccountSelectionHelperModal
        isOpen={showAccountHelp}
        onClose={() => setShowAccountHelp(false)}
      />
    </div>
  );
}
