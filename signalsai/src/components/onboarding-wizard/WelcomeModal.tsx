import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Info } from "lucide-react";

interface WelcomeModalProps {
  onStart: () => void;
  onSkip: () => void;
}

/**
 * WelcomeModal - Full-screen orange modal shown before the wizard steps begin
 * Introduces the user to Alloro and explains the onboarding experience
 */
export function WelcomeModal({ onStart, onSkip }: WelcomeModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="fixed inset-0 z-[100] flex items-center justify-center origin-center"
    >
      {/* Orange gradient background */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-alloro-orange via-alloro-orange to-orange-600"
        exit={{ scale: 0, borderRadius: "50%" }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-48 -mt-48 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/10 rounded-full -ml-40 -mb-40 blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-white/5 rounded-full blur-2xl" />
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0 }}
        transition={{ delay: 0.1, type: "spring", duration: 0.5 }}
        className="relative z-10 max-w-xl mx-auto px-6 text-center"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
        >
          <Sparkles size={40} className="text-white" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-5xl font-black text-white font-heading mb-4"
        >
          Welcome to Alloro
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-xl text-white/90 mb-6 leading-relaxed"
        >
          We're excited to have you here! Let us show you around and help you
          get the most out of your practice intelligence platform.
        </motion.p>

        {/* Demo data notice */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 mb-10 inline-flex items-start gap-3 text-left max-w-md mx-auto"
        >
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Info size={18} className="text-white" />
          </div>
          <p className="text-white/90 text-sm leading-relaxed">
            <span className="font-bold text-white">Note:</span> During this tour, you'll see
            placeholder data to demonstrate each feature. Once you connect your
            accounts, you'll see your real practice data.
          </p>
        </motion.div>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={onStart}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-alloro-orange hover:bg-white/90 transition-all shadow-xl shadow-black/10 text-lg font-black"
          >
            Start the Tour
            <ArrowRight size={20} />
          </button>
          <button
            onClick={onSkip}
            className="text-base font-semibold text-white/70 hover:text-white transition-colors py-2"
          >
            Skip for now
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
