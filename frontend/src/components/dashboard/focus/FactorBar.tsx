import React from "react";

interface FactorBarProps {
  label: string;
  /** 0..1 — clamped before rendering. */
  score: number;
}

/**
 * FactorBar — labeled horizontal progress bar with a numeric score.
 *
 * Port of ~/Desktop/another-design/project/parts.jsx:54-66 with CSS contract
 * from Focus Dashboard.html lines 619-668.
 *
 * Layout: 3-column grid (label | bar | score).
 * Color tier (matches the design's --green/--orange/--red tokens):
 *   score >= 0.7  → green  (#4F8A5B)
 *   0.5 <= s <0.7 → orange (#D66853, brand)
 *   score <  0.5  → red    (#B3503E)
 *
 * Inline styles are used for the color values that come from the score tier
 * and for the design-specific 28% label column / 6px bar height — these are
 * load-bearing pixel values from the visual reference, not arbitrary tweaks.
 */

const TIER_GREEN = "#4F8A5B";
const TIER_ORANGE = "#D66853";
const TIER_RED = "#B3503E";
const BAR_BG = "#F0ECE5";

function colorForScore(score: number): string {
  if (score >= 0.7) return TIER_GREEN;
  if (score >= 0.5) return TIER_ORANGE;
  return TIER_RED;
}

const FactorBar: React.FC<FactorBarProps> = ({ label, score }) => {
  const clamped = Math.max(0, Math.min(1, score));
  const pct = clamped * 100;
  const fillColor = colorForScore(clamped);

  return (
    <div
      className="grid items-center gap-2.5 py-[5px]"
      style={{ gridTemplateColumns: "28% 1fr 32px" }}
    >
      <div
        className="font-medium text-neutral-700"
        style={{ fontSize: "11.5px" }}
      >
        {label}
      </div>
      <div
        className="relative overflow-hidden rounded-full"
        style={{ height: 6, background: BAR_BG }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: fillColor }}
        />
      </div>
      <div
        className="text-right font-medium text-neutral-400"
        style={{
          fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
          fontSize: 11,
        }}
      >
        {clamped.toFixed(2)}
      </div>
    </div>
  );
};

export default FactorBar;
