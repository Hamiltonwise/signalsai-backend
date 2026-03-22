import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BootMessagesProps {
  onComplete: () => void;
  isLoadingComplete?: boolean;
}

const bootMessages = [
  "Welcome to Alloro",
  "Your Practice, Simplified",
  "We're setting things up for you",
  "Hang on a bit while we do the lifting",
];

const transitionMessage = "Thanks for waiting. Loading the good stuff.";

export const BootMessages: React.FC<BootMessagesProps> = ({
  onComplete,
  isLoadingComplete = false,
}) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [dots, setDots] = useState("");
  const [showTransition, setShowTransition] = useState(false);

  // Cycle through boot messages
  useEffect(() => {
    // If we're on the last boot message and loading is complete, show transition
    if (currentMessageIndex === bootMessages.length - 1 && isLoadingComplete) {
      const timer = setTimeout(() => {
        setShowTransition(true);
      }, 1000); // Show last message for 1 second
      return () => clearTimeout(timer);
    }

    // Otherwise keep cycling through messages every 2.5 seconds
    if (currentMessageIndex < bootMessages.length - 1) {
      const timer = setTimeout(() => {
        setCurrentMessageIndex((prev) => prev + 1);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [currentMessageIndex, isLoadingComplete]);

  // Show transition message, then complete
  useEffect(() => {
    if (showTransition) {
      const timer = setTimeout(() => {
        onComplete();
      }, 3000); // Show transition message for 3 seconds
      return () => clearTimeout(timer);
    }
  }, [showTransition, onComplete]);

  // Animate dots on last boot message (while waiting for loading to complete)
  useEffect(() => {
    if (currentMessageIndex === bootMessages.length - 1 && !showTransition) {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [currentMessageIndex, showTransition]);

  return (
    <div className="min-h-[100%] flex items-center justify-center bg-gradient-to-br from-[#86b4ef] via-[#a8c9f1] to-[#c0d5f4]">
      <div className="text-center space-y-8 px-4">
        {/* Alloro Mascot - Running or Thumbs Up */}
        <div className="w-32 h-32 mx-auto mb-8">
          <AnimatePresence mode="wait">
            {showTransition ? (
              <motion.img
                key="thumbs-up"
                src="/alloro-thumbs-up.png"
                alt="Alloro Thumbs Up"
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.5 }}
                className="w-full h-full object-contain drop-shadow-2xl"
              />
            ) : (
              <motion.img
                key="running"
                src="/alloro-running.png"
                alt="Alloro Running"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: [-10, 10, -10],
                }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{
                  opacity: { duration: 0.5 },
                  scale: { duration: 0.5 },
                  x: {
                    duration: 0.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }}
                className="w-full h-full object-contain drop-shadow-2xl"
              />
            )}
          </AnimatePresence>
        </div>

        {/* Message Display */}
        <AnimatePresence mode="wait">
          <motion.div
            key={showTransition ? "transition" : currentMessageIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="space-y-4"
          >
            <h1 className="text-2xl md:text-5xl font-thin text-gray-800">
              {showTransition ? (
                transitionMessage
              ) : (
                <>
                  {bootMessages[currentMessageIndex]}
                  {currentMessageIndex === bootMessages.length - 1 &&
                    !showTransition && (
                      <span className="inline-block w-12 text-left">
                        {dots}
                      </span>
                    )}
                </>
              )}
            </h1>
          </motion.div>
        </AnimatePresence>

        {/* Progress Bar */}
        <div className="max-w-md mx-auto">
          <div className="h-1 bg-white/30 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#6fa3eb] to-[#86b4ef]"
              initial={{ width: "0%" }}
              animate={{
                width: showTransition
                  ? "100%"
                  : `${
                      ((currentMessageIndex + 1) / bootMessages.length) * 100
                    }%`,
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
