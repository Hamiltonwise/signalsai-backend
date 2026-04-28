import React from "react";

interface SparklineProps {
  data: number[];
  color: string;
  /**
   * Unique gradient id. Caller must guarantee uniqueness across multiple
   * sparklines mounted on the same page (SVG gradient ids are global to the
   * document — collisions cause shared fill across instances).
   */
  fillId: string;
  height?: number;
  width?: number;
}

/**
 * Sparkline — minimal area + line + last-point-dot SVG.
 *
 * Port of ~/Desktop/another-design/project/parts.jsx:22-52. Uses
 * `preserveAspectRatio="none"` so the SVG stretches to its container width
 * via `w-full`; `viewBox` is fixed to `width × height` for path math.
 *
 * Edge case handling:
 * - data with all-equal values → `pad` falls back to 1 to avoid /0
 * - data length < 2 still renders, but the line collapses to a point
 */
const Sparkline: React.FC<SparklineProps> = ({
  data,
  color,
  fillId,
  height = 64,
  width = 240,
}) => {
  const safeData = data.length > 0 ? data : [0, 0];
  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const pad = (max - min) * 0.15 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const w = width;
  const h = height;
  const stepX = safeData.length > 1 ? w / (safeData.length - 1) : w;

  const points: Array<[number, number]> = safeData.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - lo) / (hi - lo)) * h;
    return [x, y];
  });

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      className="w-full h-16 block"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && (
        <>
          <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
          <circle
            cx={last[0]}
            cy={last[1]}
            r="6"
            fill={color}
            opacity="0.18"
          />
        </>
      )}
    </svg>
  );
};

export default Sparkline;
