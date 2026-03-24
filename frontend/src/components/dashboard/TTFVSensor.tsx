/**
 * TTFV Sensor — Time-to-First-Value prompt.
 *
 * Bottom bar (NOT modal) that appears 60s after first dashboard load.
 * "Did this tell you something you didn't know?"
 * [Yes, this is useful] [Not quite yet]
 *
 * Fires once per account. Disappears after 30s if no response.
 */

import { useState, useEffect, useRef } from "react";
import { apiPost, apiGet } from "../../api/index";

interface TTFVSensorProps {
  orgId: number | null;
}

export default function TTFVSensor({ orgId }: TTFVSensorProps) {
  const [visible, setVisible] = useState(false);
  const [responded, setResponded] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check TTFV state on mount
  useEffect(() => {
    if (!orgId) return;

    let cancelled = false;

    async function check() {
      try {
        // Mark first login
        await apiPost({ path: `/api/org/${orgId}/first-login`, passedData: {} });

        // Check TTFV state
        const state = await apiGet({ path: `/api/org/${orgId}/ttfv` });
        if (cancelled) return;

        if (state?.showTtfvPrompt) {
          setShouldShow(true);
        }
      } catch {
        // Silently fail — TTFV is non-critical
      }
    }

    check();
    return () => { cancelled = true; };
  }, [orgId]);

  // Start 60s timer when shouldShow is true
  useEffect(() => {
    if (!shouldShow) return;

    timerRef.current = setTimeout(() => {
      setVisible(true);

      // Auto-hide after 30s if no response
      fadeRef.current = setTimeout(() => {
        setVisible(false);
      }, 30_000);
    }, 60_000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    };
  }, [shouldShow]);

  const handleResponse = async (response: "yes" | "not_yet") => {
    setResponded(true);
    if (fadeRef.current) clearTimeout(fadeRef.current);

    try {
      await apiPost({
        path: `/api/org/${orgId}/ttfv`,
        passedData: { response },
      });
    } catch {
      // Silently fail
    }

    // Fade out after brief confirmation
    setTimeout(() => setVisible(false), 2000);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 animate-in slide-in-from-bottom duration-300">
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          {responded ? (
            <p className="text-sm text-center text-gray-500">
              Thank you. We'll keep improving.
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <p className="text-sm font-medium text-[#212D40] flex-1 text-center sm:text-left">
                Did this tell you something you didn't know?
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleResponse("yes")}
                  className="rounded-lg bg-[#D56753] px-4 py-2 text-xs font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all"
                >
                  Yes, this is useful
                </button>
                <button
                  onClick={() => handleResponse("not_yet")}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-500 hover:border-gray-300 transition-colors"
                >
                  Not quite yet
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
