import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useLocationContext } from "../contexts/locationContext";

/**
 * Full-screen radial splash overlay for location switching.
 * Covers everything (including sidebar) at z-[90].
 * The LocationSwitcher floats above at z-[95] during the transition
 * so the splash visually emanates from and returns to the switcher.
 */
export function LocationTransitionOverlay() {
  const { isTransitioning, transitionOrigin, transitionLocationName } =
    useLocationContext();

  return (
    <AnimatePresence>
      {isTransitioning && transitionOrigin && (
        <motion.div
          key="location-transition"
          className="fixed inset-0 z-[90] pointer-events-none"
          initial={{
            clipPath: `circle(0px at ${transitionOrigin.x}px ${transitionOrigin.y}px)`,
          }}
          animate={{
            clipPath: `circle(200vmax at ${transitionOrigin.x}px ${transitionOrigin.y}px)`,
          }}
          exit={{
            clipPath: `circle(0px at ${transitionOrigin.x}px ${transitionOrigin.y}px)`,
            opacity: 0,
          }}
          transition={{
            duration: 0.4,
            ease: "easeInOut",
          }}
        >
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background:
                "radial-gradient(ellipse at center, #d66853 0%, #c45a47 100%)",
            }}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="text-center space-y-6"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <Loader2 className="w-14 h-14 text-white/90 mx-auto" />
              </motion.div>
              <p className="text-lg font-semibold text-white/90 tracking-wide">
                Switching to {transitionLocationName || "location"}...
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
