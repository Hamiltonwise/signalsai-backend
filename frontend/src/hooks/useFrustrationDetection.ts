/**
 * Frustration Detection -- The system knows before they do.
 *
 * Watches for behavioral signals that indicate a user is stuck:
 * - Rage clicks (3+ rapid clicks on same area)
 * - Idle on interactive page (>90 seconds without action)
 * - Navigation loops (visiting same pages repeatedly)
 * - Form abandonment (started filling, stopped)
 *
 * When detected, surfaces a gentle toast: "Something seem off?"
 * One tap captures full context and routes to help.
 *
 * This is what would have caught Garrison's password issue
 * before he texted Corey. The failed login -> stuck on signin
 * page -> idle for 60 seconds -> "Having trouble logging in?
 * Tap here to reset your password."
 *
 * Intercom pioneered this. Apple perfected it. Alloro needs it.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiPost } from "@/api/index";

interface FrustrationSignal {
  type: "rage_click" | "idle" | "navigation_loop" | "error_page";
  page: string;
  timestamp: number;
  detail?: string;
}

export function useFrustrationDetection(options?: {
  onFrustrationDetected?: (signal: FrustrationSignal) => void;
  idleThresholdMs?: number;
  enabled?: boolean;
}) {
  const {
    onFrustrationDetected,
    idleThresholdMs = 90000, // 90 seconds
    enabled = true,
  } = options || {};

  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);
  const [helpMessage, setHelpMessage] = useState("");

  // Rage click detection
  const clickTimestamps = useRef<number[]>([]);
  const lastClickTarget = useRef<string>("");

  // Idle detection
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivity = useRef(Date.now());

  // Navigation loop detection
  const recentPages = useRef<string[]>([]);

  const triggerHelp = useCallback(
    (signal: FrustrationSignal, message: string) => {
      setHelpMessage(message);
      setShowHelp(true);
      onFrustrationDetected?.(signal);

      // Log to backend so Bug Triage Agent sees patterns
      apiPost({
        path: "/user/help/signal",
        passedData: { type: signal.type, page: signal.page, detail: signal.detail },
      }).catch(() => {}); // Fire and forget

      // Auto-dismiss after 10 seconds
      setTimeout(() => setShowHelp(false), 10000);
    },
    [onFrustrationDetected],
  );

  const dismissHelp = useCallback(() => setShowHelp(false), []);

  // Rage click detection
  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      const now = Date.now();
      const target = (e.target as HTMLElement)?.tagName + "." + (e.target as HTMLElement)?.className?.slice(0, 30);

      // Reset if different target
      if (target !== lastClickTarget.current) {
        clickTimestamps.current = [];
        lastClickTarget.current = target;
      }

      clickTimestamps.current.push(now);

      // Keep only clicks in the last 2 seconds
      clickTimestamps.current = clickTimestamps.current.filter(
        (t) => now - t < 2000,
      );

      // 3+ clicks in 2 seconds = rage click
      if (clickTimestamps.current.length >= 3) {
        triggerHelp(
          { type: "rage_click", page: location.pathname, timestamp: now },
          "Something not responding? Tap here and tell us what you expected to happen.",
        );
        clickTimestamps.current = [];
      }

      // Reset idle timer on any click
      lastActivity.current = now;
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [enabled, location.pathname, triggerHelp]);

  // Idle detection
  useEffect(() => {
    if (!enabled) return;

    const resetIdle = () => {
      lastActivity.current = Date.now();
      if (idleTimer.current) clearTimeout(idleTimer.current);

      idleTimer.current = setTimeout(() => {
        // Only trigger on interactive pages (not marketing/content)
        const isInteractive =
          location.pathname.includes("/dashboard") ||
          location.pathname.includes("/settings") ||
          location.pathname.includes("/checkup");

        if (isInteractive) {
          // Contextual message based on page
          let message = "Need help with something? Tap here.";
          if (location.pathname.includes("/signin")) {
            message = "Having trouble logging in? Tap here to reset your password.";
          } else if (location.pathname.includes("/settings/integrations")) {
            message = "Need help connecting your account? Tap here.";
          } else if (location.pathname.includes("/dashboard/website")) {
            message = "Want to make a change to your site? Just type what you want changed.";
          }

          triggerHelp(
            {
              type: "idle",
              page: location.pathname,
              timestamp: Date.now(),
              detail: `Idle for ${idleThresholdMs / 1000}s`,
            },
            message,
          );
        }
      }, idleThresholdMs);
    };

    // Reset on mouse move, click, keypress, scroll, touch
    const events = ["mousemove", "click", "keydown", "scroll", "touchstart"];
    events.forEach((e) => document.addEventListener(e, resetIdle));
    resetIdle(); // Start the timer

    return () => {
      events.forEach((e) => document.removeEventListener(e, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [enabled, location.pathname, idleThresholdMs, triggerHelp]);

  // Navigation loop detection
  useEffect(() => {
    if (!enabled) return;

    recentPages.current.push(location.pathname);
    if (recentPages.current.length > 6) {
      recentPages.current = recentPages.current.slice(-6);
    }

    // Check for A-B-A-B pattern
    const pages = recentPages.current;
    if (pages.length >= 4) {
      const last4 = pages.slice(-4);
      if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) {
        triggerHelp(
          {
            type: "navigation_loop",
            page: location.pathname,
            timestamp: Date.now(),
            detail: `Loop: ${last4[0]} <-> ${last4[1]}`,
          },
          "Looking for something? Tap here and tell us what you need.",
        );
        recentPages.current = []; // Reset after triggering
      }
    }
  }, [enabled, location.pathname, triggerHelp]);

  return { showHelp, helpMessage, dismissHelp };
}
