/**
 * Growth Chart -- Practice ranking position over time.
 *
 * Pure SVG line chart. No dependencies (recharts not in project).
 * Y axis inverted (position 1 at top). Responsive: 8 weeks mobile, 16 desktop.
 *
 * Usage:
 *   <GrowthChart
 *     data={[{ week_start: "2026-03-03", position: 5 }, ...]}
 *     practice_name="Mountain View Endodontics"
 *     competitor_data={[{ week_start: "2026-03-03", position: 2 }]}
 *     competitor_name="Valley Endodontics SLC"
 *   />
 */

import { useState, useMemo } from "react";

// ─── Types ──────────────────────────────────────────────────────────

interface DataPoint {
  week_start: string;
  position: number;
}

interface GrowthChartProps {
  data: DataPoint[];
  competitor_data?: DataPoint[];
  practice_name: string;
  competitor_name?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );

  if (typeof window !== "undefined") {
    // One-time check is sufficient for chart render
    const mql = window.matchMedia("(max-width: 639px)");
    if (mql.matches !== isMobile) setIsMobile(mql.matches);
  }

  return isMobile;
}

// ─── Chart Constants ────────────────────────────────────────────────

const CHART_HEIGHT = 200;
const CHART_PADDING_TOP = 20;
const CHART_PADDING_BOTTOM = 30;
const CHART_PADDING_LEFT = 48;
const CHART_PADDING_RIGHT = 16;

// ─── Component ──────────────────────────────────────────────────────

export default function GrowthChart({
  data,
  competitor_data,
  practice_name,
  competitor_name,
}: GrowthChartProps) {
  const isMobile = useIsMobile();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Slice data for viewport
  const maxWeeks = isMobile ? 8 : 16;
  const slicedData = useMemo(
    () => data.slice(-maxWeeks),
    [data, maxWeeks]
  );
  const slicedCompetitor = useMemo(
    () => competitor_data?.slice(-maxWeeks) ?? [],
    [competitor_data, maxWeeks]
  );

  // Empty state
  if (slicedData.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200/60 bg-stone-50/80 p-6 text-center">
        <p className="text-sm text-slate-400">
          Position tracking starts after your first full week.
        </p>
      </div>
    );
  }

  // Compute Y bounds (inverted: 1 is top)
  const allPositions = [
    ...slicedData.map((d) => d.position),
    ...slicedCompetitor.map((d) => d.position),
  ];
  const minPos = Math.max(1, Math.min(...allPositions) - 1);
  const maxPos = Math.max(...allPositions) + 1;

  const chartWidth = 600;
  const plotWidth = chartWidth - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  // Map data to SVG coordinates
  const toX = (i: number) =>
    CHART_PADDING_LEFT +
    (slicedData.length === 1
      ? plotWidth / 2
      : (i / (slicedData.length - 1)) * plotWidth);

  const toY = (position: number) =>
    CHART_PADDING_TOP +
    ((position - minPos) / (maxPos - minPos)) * plotHeight;

  // Build path strings
  const practicePath = slicedData
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.position)}`)
    .join(" ");

  const competitorPath =
    slicedCompetitor.length > 0
      ? slicedCompetitor
          .map(
            (d, i) =>
              `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.position)}`
          )
          .join(" ")
      : null;

  // Y axis ticks
  const yTicks: number[] = [];
  for (let p = minPos; p <= maxPos; p++) {
    yTicks.push(p);
  }

  return (
    <div className="rounded-2xl border border-stone-200/60 bg-stone-50/80 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#D56753]">
          Market Position
        </p>
        {/* Legend */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#D56753] rounded-full" />
            <span className="text-xs text-slate-400 truncate max-w-[120px]">
              {practice_name}
            </span>
          </div>
          {competitor_name && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#212D40] rounded-full opacity-50" style={{ borderTop: "1px dashed #212D40" }} />
              <span className="text-xs text-slate-400 truncate max-w-[120px]">
                {competitor_name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
          className="w-full"
          style={{ maxHeight: `${CHART_HEIGHT}px` }}
        >
          {/* Grid lines */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={CHART_PADDING_LEFT}
                y1={toY(tick)}
                x2={chartWidth - CHART_PADDING_RIGHT}
                y2={toY(tick)}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
              <text
                x={CHART_PADDING_LEFT - 8}
                y={toY(tick) + 3}
                textAnchor="end"
                className="fill-slate-400"
                style={{ fontSize: "10px" }}
              >
                #{tick}
              </text>
            </g>
          ))}

          {/* X axis labels */}
          {slicedData.map((d, i) => {
            // Show every other label on mobile to avoid overlap
            if (isMobile && i % 2 !== 0 && i !== slicedData.length - 1)
              return null;
            return (
              <text
                key={d.week_start}
                x={toX(i)}
                y={CHART_HEIGHT - 4}
                textAnchor="middle"
                className="fill-slate-400"
                style={{ fontSize: "10px" }}
              >
                {formatDate(d.week_start)}
              </text>
            );
          })}

          {/* Competitor line (dashed, behind) */}
          {competitorPath && (
            <path
              d={competitorPath}
              fill="none"
              stroke="#212D40"
              strokeWidth="1"
              strokeDasharray="4 3"
              opacity="0.4"
            />
          )}

          {/* Practice line */}
          <path
            d={practicePath}
            fill="none"
            stroke="#D56753"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Practice dots */}
          {slicedData.map((d, i) => (
            <circle
              key={d.week_start}
              cx={toX(i)}
              cy={toY(d.position)}
              r={hoveredIndex === i ? 5 : 3.5}
              fill="#D56753"
              stroke="white"
              strokeWidth="2"
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}

          {/* Tooltip */}
          {hoveredIndex !== null && slicedData[hoveredIndex] && (
            <g>
              <rect
                x={Math.min(
                  toX(hoveredIndex) - 70,
                  chartWidth - CHART_PADDING_RIGHT - 140
                )}
                y={toY(slicedData[hoveredIndex].position) - 36}
                width="140"
                height={slicedCompetitor[hoveredIndex] ? 32 : 22}
                rx="6"
                fill="#212D40"
                opacity="0.95"
              />
              <text
                x={Math.min(
                  toX(hoveredIndex),
                  chartWidth - CHART_PADDING_RIGHT - 70
                )}
                y={toY(slicedData[hoveredIndex].position) - 22}
                textAnchor="middle"
                fill="white"
                style={{ fontSize: "9px" }}
              >
                Week of {formatDate(slicedData[hoveredIndex].week_start)}:
                You ranked #{slicedData[hoveredIndex].position}
              </text>
              {slicedCompetitor[hoveredIndex] && (
                <text
                  x={Math.min(
                    toX(hoveredIndex),
                    chartWidth - CHART_PADDING_RIGHT - 70
                  )}
                  y={toY(slicedData[hoveredIndex].position) - 10}
                  textAnchor="middle"
                  fill="white"
                  opacity="0.7"
                  style={{ fontSize: "9px" }}
                >
                  {competitor_name} ranked #
                  {slicedCompetitor[hoveredIndex].position}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

// Wire into /dashboard/rankings above the weekly bullets section
// Reads from weekly_ranking_snapshots via existing rankings endpoint
