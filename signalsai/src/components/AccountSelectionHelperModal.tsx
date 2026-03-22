import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, Target, Lightbulb, HelpCircle } from "lucide-react";

interface AccountSelectionHelperModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountSelectionHelperModal: React.FC<
  AccountSelectionHelperModalProps
> = ({ isOpen, onClose }) => {
  const services = [
    {
      name: "Google Business Profile",
      description: "Business listing & reviews",
      logo: "/google-business-profile.png",
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* Modal - Clean minimal design */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
          >
            <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full overflow-hidden border border-slate-100 max-h-[90vh] overflow-y-auto">
              {/* Clean Header */}
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 relative">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-alloro-orange/10 flex items-center justify-center">
                    <Target className="w-5 h-5 text-alloro-orange" />
                  </div>
                  <div className="pr-6">
                    <h2 className="text-base sm:text-lg font-semibold text-alloro-navy">
                      Which Google Account Should You Use?
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500">
                      Choose the account connected to your business tools
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 sm:p-6">
                {/* Service Cards - Responsive Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-5">
                  {services.map((service, index) => (
                    <motion.div
                      key={service.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 + 0.1 }}
                      className="flex flex-row sm:flex-col items-center sm:text-center p-3 sm:p-5 rounded-xl bg-slate-50/50 border border-slate-100 hover:border-alloro-orange/30 hover:bg-alloro-orange/5 transition-all group gap-3 sm:gap-0"
                    >
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-xl flex items-center justify-center shadow-sm sm:mb-3 group-hover:shadow-md transition-shadow flex-shrink-0">
                        <img
                          src={service.logo}
                          alt={service.name}
                          className="w-7 h-7 sm:w-9 sm:h-9 object-contain"
                        />
                      </div>
                      <div className="sm:text-center">
                        <h3 className="font-medium text-alloro-navy text-sm mb-0.5">
                          {service.name}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {service.description}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Tips - Responsive layout with subtle styling */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-5">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-alloro-orange/5 border border-alloro-orange/10 rounded-xl p-3 sm:p-4"
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-alloro-orange/10 flex items-center justify-center flex-shrink-0">
                        <Lightbulb className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-alloro-orange" />
                      </div>
                      <div>
                        <h4 className="font-medium text-alloro-navy text-xs sm:text-sm mb-0.5 sm:mb-1">
                          Quick Tip
                        </h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Use your{" "}
                          <span className="text-alloro-orange font-medium">
                            business/work email
                          </span>{" "}
                          — the one receiving Google property notifications.
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-slate-50/80 border border-slate-100 rounded-xl p-3 sm:p-4"
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
                      </div>
                      <div>
                        <h4 className="font-medium text-alloro-navy text-xs sm:text-sm mb-0.5 sm:mb-1">
                          Not Sure?
                        </h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Try your main business account. Alloro will help you
                          connect properties after sign in.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Action Button */}
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={onClose}
                  className="w-full py-3 px-4 bg-alloro-orange hover:bg-alloro-orange/90 text-white font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                >
                  <span>Got it! Let me sign in</span>
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
