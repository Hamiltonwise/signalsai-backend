/**
 * Pitch Rep Tracker -- /admin/pitch-reps
 *
 * Corey needs 20 pitch reps before AAE April 15.
 * localStorage only. No backend. Founder tool.
 */

import { useState, useCallback } from "react";
import { Plus, RotateCcw, Mic } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface PitchRep {
  id: string;
  timestamp: string;
}

const STORAGE_KEY = "alloro_pitch_reps";
const TARGET = 20;

// ─── Persistence ────────────────────────────────────────────────────

function loadReps(): PitchRep[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReps(reps: PitchRep[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reps));
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Component ──────────────────────────────────────────────────────

export default function PitchRepTracker() {
  const [reps, setReps] = useState<PitchRep[]>(loadReps);

  const logRep = useCallback(() => {
    const newRep: PitchRep = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    const updated = [newRep, ...reps];
    setReps(updated);
    saveReps(updated);
  }, [reps]);

  const resetReps = useCallback(() => {
    setReps([]);
    saveReps([]);
  }, []);

  const count = reps.length;
  const done = count >= TARGET;
  const progressPct = Math.min((count / TARGET) * 100, 100);
  const lastFive = reps.slice(0, 5);

  return (
    <div className="max-w-md mx-auto px-5 py-12 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#D56753]/10 mb-4">
          <Mic className="w-6 h-6 text-[#D56753]" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-2">
          Pitch Prep
        </p>
        <h1 className="text-lg font-bold text-[#212D40]">
          AAE is April 15. Get your reps in.
        </h1>
      </div>

      {/* Counter */}
      <div className="text-center">
        {done ? (
          <p className="text-4xl sm:text-5xl font-black text-[#212D40]">
            Ready for AAE.
          </p>
        ) : (
          <p className="text-5xl sm:text-6xl font-black text-[#212D40]">
            {count}{" "}
            <span className="text-2xl font-bold text-slate-300">
              / {TARGET}
            </span>
          </p>
        )}
        {!done && (
          <p className="text-sm text-slate-400 mt-2">reps complete</p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#D56753] transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Log Button */}
      {!done && (
        <button
          onClick={logRep}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-base font-semibold py-4 shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
        >
          <Plus className="w-5 h-5" />
          Log a rep
        </button>
      )}

      {/* Recent Reps */}
      {lastFive.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Recent
          </p>
          {lastFive.map((rep, i) => (
            <div
              key={rep.id}
              className="flex items-center justify-between rounded-xl bg-white border border-gray-200 px-4 py-3"
            >
              <p className="text-sm font-medium text-[#212D40]">
                Pitch rep #{count - i}
              </p>
              <p className="text-xs text-slate-400">
                {formatDate(rep.timestamp)} at {formatTime(rep.timestamp)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Reset */}
      {count > 0 && (
        <div className="flex justify-end">
          <button
            onClick={resetReps}
            className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-slate-500 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

// T1 adds /admin/pitch-reps route to App.tsx
