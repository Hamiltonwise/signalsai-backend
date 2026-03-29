/**
 * TTFV Sensor — Time-to-First-Value prompt.
 *
 * Bottom bar (NOT modal). Appears 90 seconds after first dashboard load.
 * "Did this tell you something you didn't know about your practice?"
 * [Yes, it did] [Not yet]
 *
 * Fires once per account. Disappears after 30s if no response.
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface TTFVSensorProps {
  orgId: number | null;
  onYes?: () => void;
}

export default function TTFVSensor({ orgId, onYes }: TTFVSensorProps) {
  const [visible, setVisible] = useState(false);
  const [responded, setResponded] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check TTFV state + mark first login
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function check() {
      try {
        const token = localStorage.getItem("auth_token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        // Mark first login
        await fetch("/api/checkup/first-login", { method: "PATCH", headers });

        // Check TTFV state
        const res = await fetch("/api/checkup/ttfv-status", { headers });
        if (!res.ok || cancelled) return;
        const data = await res.json();

        if (data.showTtfv) setShouldShow(true);
      } catch { /* non-critical */ }
    }

    check();
    return () => { cancelled = true; };
  }, [orgId]);

  // Start 90s timer
  useEffect(() => {
    if (!shouldShow) return;

    timerRef.current = setTimeout(() => {
      setVisible(true);
      fadeRef.current = setTimeout(() => setVisible(false), 30_000);
    }, 90_000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    };
  }, [shouldShow]);

  const handleResponse = useCallback(async (response: "yes" | "not_yet") => {
    setResponded(true);
    if (fadeRef.current) clearTimeout(fadeRef.current);

    try {
      const token = localStorage.getItem("auth_token");
      await fetch("/api/checkup/ttfv", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ response }),
      });
    } catch { /* non-critical */ }

    if (response === "yes" && onYes) {
      setTimeout(onYes, 3000);
    }

    setTimeout(() => setVisible(false), 2000);
  }, [onYes]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 animate-in slide-in-from-bottom duration-300">
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          {responded ? (
            <p className="text-sm text-center text-gray-500">Thank you.</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <p className="text-sm font-medium text-[#212D40] flex-1 text-center sm:text-left">
                Did this tell you something you didn't know about your business?
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleResponse("yes")}
                  className="rounded-lg bg-[#D56753] px-4 py-2 text-xs font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all"
                >
                  Yes, it did
                </button>
                <button
                  onClick={() => handleResponse("not_yet")}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-500 hover:border-gray-300 transition-colors"
                >
                  Not yet
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
