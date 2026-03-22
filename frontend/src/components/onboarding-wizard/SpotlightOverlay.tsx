import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SpotlightOverlayProps {
  /** CSS selector for the target element to highlight */
  targetSelector: string | null;
  /** Whether the overlay is visible */
  isVisible: boolean;
  /** Whether this is a page overview (no specific element highlighted) */
  isPageOverview?: boolean;
  /** Whether to block interaction with the highlighted element (educational only) */
  blockInteraction?: boolean;
}

/**
 * SpotlightOverlay - Highlights elements by dimming everything else
 * Uses opacity-based approach: all [data-wizard-target] elements get dimmed to 0.3
 * except the one being highlighted which stays at full opacity with a pulsing border
 */
export function SpotlightOverlay({
  targetSelector,
  isVisible,
  isPageOverview = false,
  blockInteraction = false,
}: SpotlightOverlayProps) {
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 20; // Max retries (20 * 200ms = 4 seconds max wait)

  const applyHighlight = useCallback(() => {
    // Get all wizard target elements
    const allTargets = document.querySelectorAll("[data-wizard-target]");

    if (isPageOverview || !targetSelector) {
      // For page overview, show all elements at full opacity
      allTargets.forEach((el) => {
        (el as HTMLElement).style.opacity = "1";
        (el as HTMLElement).style.transition = "opacity 0.3s ease";
        el.classList.remove("wizard-highlight");
      });
      return true;
    }

    // Get the highlighted element
    const highlightedElement = document.querySelector(targetSelector);

    if (!highlightedElement) {
      // Element not found yet, retry
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        retryTimeoutRef.current = setTimeout(applyHighlight, 200);
      }
      return false;
    }

    // Reset retry counter on success
    retryCountRef.current = 0;

    // Dim all other wizard targets, highlight the selected one
    allTargets.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (el === highlightedElement) {
        htmlEl.style.opacity = "1";
        htmlEl.style.transition = "opacity 0.3s ease";
        el.classList.add("wizard-highlight");
      } else {
        htmlEl.style.opacity = "0.3";
        htmlEl.style.transition = "opacity 0.3s ease";
        el.classList.remove("wizard-highlight");
      }
    });

    // Scroll the highlighted element into view
    // Clear any pending scroll timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Small delay to let animations settle
    scrollTimeoutRef.current = setTimeout(() => {
      const rect = highlightedElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Check if element is not fully visible
      if (rect.top < 100 || rect.bottom > viewportHeight - 250) {
        highlightedElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 150);

    return true;
  }, [targetSelector, isPageOverview]);

  useEffect(() => {
    if (!isVisible) {
      // Remove all wizard styling when not visible
      document.querySelectorAll("[data-wizard-target]").forEach((el) => {
        (el as HTMLElement).style.opacity = "";
        (el as HTMLElement).style.transition = "";
        el.classList.remove("wizard-highlight");
      });
      return;
    }

    // Reset retry counter when target changes
    retryCountRef.current = 0;

    // Apply highlight (will retry if element not found)
    applyHighlight();

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [targetSelector, isVisible, isPageOverview, applyHighlight]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.querySelectorAll("[data-wizard-target]").forEach((el) => {
        (el as HTMLElement).style.opacity = "";
        (el as HTMLElement).style.transition = "";
        el.classList.remove("wizard-highlight");
      });
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Semi-transparent overlay to indicate wizard mode */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[80] pointer-events-none bg-black/10"
          />

          {/* Blocking overlay for educational-only steps (final 2 steps) */}
          {blockInteraction && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[90] cursor-not-allowed"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          )}

          {/* Inject styles for the pulsing border highlight */}
          <style>{`
            .wizard-highlight {
              position: relative;
              z-index: 85;
              border-radius: 28px;
              outline: 4px solid rgba(255, 138, 61, 0.9);
              outline-offset: 12px;
              box-shadow:
                0 0 0 16px rgba(255, 138, 61, 0.1),
                0 0 30px rgba(255, 138, 61, 0.25),
                0 0 60px rgba(255, 138, 61, 0.1);
              animation: wizard-pulse 2s ease-in-out infinite;
            }

            @keyframes wizard-pulse {
              0%, 100% {
                outline: 4px solid rgba(255, 138, 61, 0.9);
                outline-offset: 12px;
                box-shadow:
                  0 0 0 16px rgba(255, 138, 61, 0.1),
                  0 0 30px rgba(255, 138, 61, 0.25),
                  0 0 60px rgba(255, 138, 61, 0.1);
              }
              50% {
                outline: 5px solid rgba(255, 138, 61, 1);
                outline-offset: 14px;
                box-shadow:
                  0 0 0 18px rgba(255, 138, 61, 0.15),
                  0 0 40px rgba(255, 138, 61, 0.35),
                  0 0 80px rgba(255, 138, 61, 0.15);
              }
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
}
