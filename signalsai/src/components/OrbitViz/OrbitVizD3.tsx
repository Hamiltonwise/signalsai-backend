import React, { useEffect, useMemo, useRef, useState } from "react";
import { Globe, ClipboardList } from "lucide-react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
} from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

type CenterData = {
  totalProduction: number;
  totalPatients: number;
};

type MetricNode = {
  id: string;
  label: string;
  value: string | number;
};

export interface OrbitVizD3Props {
  className?: string;
  center?: CenterData;
  gbp?: MetricNode[];
  clarity?: MetricNode[];
  tasksOpen?: number;
  onNavigate?: (
    tab: "Dashboard" | "Patient Journey Insights" | "PMS Statistics" | "Tasks"
  ) => void;
}

type NodeType = "center" | "hub" | "metric" | "tasks";

interface SimNode extends SimulationNodeDatum {
  id: string;
  type: NodeType;
  r: number;
  label?: string;
  value?: string | number;
  // Ensure positional and fixed coordinates are recognized by TS
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export const OrbitVizD3: React.FC<OrbitVizD3Props> = ({
  className = "",
  center,
  gbp,
  clarity,
  tasksOpen,
  onNavigate,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [hovered, setHovered] = useState<{
    id: string;
    title: string;
    value?: string | number;
    r: number;
    desc?: string;
  } | null>(null);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: Math.max(560, height) });
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    return {
      center: center ?? { totalProduction: 128_400, totalPatients: 842 },
      gbp: gbp ?? [{ id: "gbp_calls", label: "Calls", value: 232 }],
      clarity: clarity ?? [
        { id: "clar_sessions", label: "Sessions", value: "6.9k" },
        { id: "clar_bounce", label: "Bounce", value: "38%" },
      ],
      website: [
          { id: "web_forms", label: "Form Submissions", value: 57 },
          { id: "web_visitors", label: "Visitors", value: "8.3k" },
          { id: "web_perf", label: "Site Performance", value: 92 },
        ] as MetricNode[],
      tasks: tasksOpen ?? 12,
      tasksPending: 7,
      tasksCompleted: 18,
    };
  }, [center, gbp, clarity, tasksOpen]);

  // build layout numbers
  const cx = size.w / 2;
  const cy = size.h / 2;
  const outerPadding = 72; // ensure space for outer hubs/children and shadows
  const radiusMax = Math.max(180, Math.min(size.w, size.h) / 2 - outerPadding);
  const rings = [radiusMax * 0.5, radiusMax * 0.78, radiusMax * 0.97];
  const centerR = Math.max(100, Math.min(120, radiusMax * 0.34));

  const angles = {
    google: 25,
    website: 115,
    clarity: 205,
    tasks: 332,
  } as const;

  // Radius for the small AI intermediary orbs
  const AI_R = 22;
  // Responsive scale to better fit laptop screens; scales entire viz around center
  const targetW = 1100;
  const targetH = 760;
  const visScale = Math.min(
    1,
    Math.max(0.8, Math.min(size.w / targetW, size.h / targetH))
  );

  const toXY = (r: number, a: number) => {
    const rad = (a * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  useEffect(() => {
    // nodes
    const nodes: SimNode[] = [];
    const links: SimulationLinkDatum<SimNode>[] = [];

    // center
    const centerNode: SimNode = { id: "center", type: "center", r: centerR };
    centerNode.fx = cx;
    centerNode.fy = cy;
    nodes.push(centerNode);

    // hubs
    const googleHub: SimNode = {
      id: "hub_google",
      type: "hub",
      r: 46,
      label: "Google",
    };
    const clarityHub: SimNode = {
      id: "hub_clarity",
      type: "hub",
      r: 44,
      label: "Clarity",
    };
    const tasksHub: SimNode = {
      id: "hub_tasks",
      type: "tasks",
      r: 48,
      label: "Tasks",
      value: data.tasks,
    };
    const websiteHub: SimNode = {
      id: "hub_website",
      type: "hub",
      r: 44,
      label: "Website",
    };

    const googleAnchor = toXY(rings[1], angles.google);
    const websiteAnchor = toXY(rings[1], angles.website);
    const clarityAnchor = toXY(rings[1] * 0.85, angles.clarity);
    const tasksAnchor = toXY(rings[2], angles.tasks);

    googleHub.x = googleAnchor.x;
    googleHub.y = googleAnchor.y;
    googleHub.fx = googleAnchor.x;
    googleHub.fy = googleAnchor.y;
    websiteHub.x = websiteAnchor.x;
    websiteHub.y = websiteAnchor.y;
    websiteHub.fx = websiteAnchor.x;
    websiteHub.fy = websiteAnchor.y;
    clarityHub.x = clarityAnchor.x;
    clarityHub.y = clarityAnchor.y;
    clarityHub.fx = clarityAnchor.x;
    clarityHub.fy = clarityAnchor.y;
    tasksHub.x = tasksAnchor.x;
    tasksHub.y = tasksAnchor.y;
    tasksHub.fx = tasksAnchor.x;
    tasksHub.fy = tasksAnchor.y;

    nodes.push(googleHub, clarityHub, tasksHub, websiteHub);

    // AI intermediary orbs (one per hub), very close to center
    const AI_STICK_OVERLAP = 6; // pixels to overlap into the center orb
    const AI_DIST = centerR + AI_R - AI_STICK_OVERLAP; // slightly overlapping
    const aiGooglePos = toXY(AI_DIST, angles.google);
    const aiWebsitePos = toXY(AI_DIST, angles.website);
    const aiClarityPos = toXY(AI_DIST, angles.clarity);
    const aiTasksPos = toXY(AI_DIST, angles.tasks);

    const aiGoogle: SimNode = {
      id: "ai_google",
      type: "hub",
      r: AI_R,
      label: "AI",
    };
    aiGoogle.x = aiGooglePos.x;
    aiGoogle.y = aiGooglePos.y;
    aiGoogle.fx = aiGooglePos.x;
    aiGoogle.fy = aiGooglePos.y;

    const aiWebsite: SimNode = {
      id: "ai_website",
      type: "hub",
      r: AI_R,
      label: "AI",
    };
    aiWebsite.x = aiWebsitePos.x;
    aiWebsite.y = aiWebsitePos.y;
    aiWebsite.fx = aiWebsitePos.x;
    aiWebsite.fy = aiWebsitePos.y;

    const aiClarity: SimNode = {
      id: "ai_clarity",
      type: "hub",
      r: AI_R,
      label: "AI",
    };
    aiClarity.x = aiClarityPos.x;
    aiClarity.y = aiClarityPos.y;
    aiClarity.fx = aiClarityPos.x;
    aiClarity.fy = aiClarityPos.y;

    const aiTasks: SimNode = {
      id: "ai_tasks",
      type: "hub",
      r: AI_R,
      label: "AI",
    };
    aiTasks.x = aiTasksPos.x;
    aiTasks.y = aiTasksPos.y;
    aiTasks.fx = aiTasksPos.x;
    aiTasks.fy = aiTasksPos.y;

    nodes.push(aiGoogle, aiWebsite, aiClarity, aiTasks);

    // Route links via AI intermediary orbs
    links.push({ source: centerNode, target: aiGoogle, distance: AI_DIST });
    links.push({
      source: aiGoogle,
      target: googleHub,
      distance: rings[1] - AI_DIST,
    });
    links.push({ source: centerNode, target: aiWebsite, distance: AI_DIST });
    links.push({
      source: aiWebsite,
      target: websiteHub,
      distance: rings[1] - AI_DIST,
    });
    links.push({ source: centerNode, target: aiClarity, distance: AI_DIST });
    links.push({
      source: aiClarity,
      target: clarityHub,
      distance: rings[1] * 0.85 - AI_DIST,
    });
    links.push({ source: centerNode, target: aiTasks, distance: AI_DIST });
    links.push({
      source: aiTasks,
      target: tasksHub,
      distance: rings[2] - AI_DIST,
    });

    // Google metrics (children around hub)
    const gChildren = [data.gbp[0]].filter(Boolean);
    const gAngles = [0];
    const childDist = Math.min(130, radiusMax * 0.27);
    gChildren.forEach((m, i) => {
      const a = angles.google + gAngles[i]!;
      const pos = toXY(rings[1] + 0, a); // initial near the hub direction
      const node: SimNode = {
        id: m.id,
        type: "metric",
        r: 38,
        label: m.label,
        value: m.value,
      };
      // start near hub, links keep distance
      node.x = pos.x;
      node.y = pos.y;
      nodes.push(node);
      links.push({ source: googleHub, target: node, distance: childDist });
    });

    // Clarity metrics
    const cChildren = data.clarity.slice(0, 2);
    const cAngles = [-20, 18];
    cChildren.forEach((m, i) => {
      const a = angles.clarity + cAngles[i]!;
      const pos = toXY(rings[1] * 0.85, a);
      const node: SimNode = {
        id: m.id,
        type: "metric",
        r: 32,
        label: m.label,
        value: m.value,
      };
      node.x = pos.x;
      node.y = pos.y;
      nodes.push(node);
      links.push({
        source: clarityHub,
        target: node,
        distance: childDist * 0.9,
      });
    });

    // Monday cluster: pending / completed around tasksHub
    const mondayAngles = [-16, 18];
    const mondayDist = Math.min(120, radiusMax * 0.26);
    const mondayChildren: {
      id: string;
      label: string;
      value: string | number;
    }[] = [
      { id: "monday_pending", label: "Pending", value: data.tasksPending },
      {
        id: "monday_completed",
        label: "Completed",
        value: data.tasksCompleted,
      },
    ];
    mondayChildren.forEach((m, i) => {
      const a = angles.tasks + mondayAngles[i]!;
      const pos = toXY(rings[2], a);
      const node: SimNode = {
        id: m.id,
        type: "metric",
        r: 32,
        label: m.label,
        value: m.value,
      };
      node.x = pos.x;
      node.y = pos.y;
      nodes.push(node);
      links.push({ source: tasksHub, target: node, distance: mondayDist });
    });

    // Website metrics (3 children around website hub)
    const wChildren = data.website.slice(0, 3);
    const wAngles = [-24, 0, 24];
    wChildren.forEach((m, i) => {
      const a = angles.website + wAngles[i]!;
      const pos = toXY(rings[1], a);
      const node: SimNode = {
        id: m.id,
        type: "metric",
        r: 34,
        label: m.label,
        value: m.value,
      };
      node.x = pos.x;
      node.y = pos.y;
      nodes.push(node);
      links.push({ source: websiteHub, target: node, distance: childDist });
    });

    // simulation
    const sim = forceSimulation(nodes)
      .alpha(0.9)
      .alphaMin(0.02)
      .alphaDecay(0.04)
      .force(
        "link",
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
          .id((d: SimNode) => d.id)
          .distance((l: any) => l.distance ?? 80)
          .strength(0.12)
      )
      .force("charge", forceManyBody().strength(-120))
      .force(
        "collide",
        forceCollide<SimNode>()
          .radius((d: SimNode) => d.r + 8)
          .iterations(2)
      );

    // RAF-throttled position updates
    const posRef: Record<string, { x: number; y: number }> = {};
    let raf = 0;
    const flush = () => {
      setPositions({ ...posRef });
      raf = 0;
    };

    sim.on("tick", () => {
      nodes.forEach((n) => {
        posRef[n.id] = { x: n.x ?? cx, y: n.y ?? cy };
      });
      if (!raf) raf = requestAnimationFrame(flush);
    });

    return () => {
      sim.stop();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [cx, cy, rings.join("-"), radiusMax, data]);

  // helpers to read pos
  const P = (id: string) => positions[id] ?? { x: cx, y: cy };
  const toScreen = (p: { x: number; y: number }) => ({
    x: cx + visScale * (p.x - cx),
    y: cy + visScale * (p.y - cy),
  });
  const tooltip = useMemo(() => {
    if (!hovered) return null;
    const p = toScreen(P(hovered.id));
    const r = hovered.r * visScale;
    return {
      x: p.x + r + 12,
      y: p.y - r - 12,
    };
  }, [hovered, positions, visScale, cx, cy]);

  // Link highlight logic: determine if a link is on the hovered path
  const googleChildIds = useMemo(
    () =>
      [data.gbp[0]?.id].filter(
        Boolean
      ) as string[],
    [data]
  );
  const clarityChildIds = useMemo(
    () =>
      [data.clarity[0]?.id, data.clarity[1]?.id].filter(Boolean) as string[],
    [data]
  );
  const websiteChildIds = useMemo(
    () =>
      [data.website[0]?.id, data.website[1]?.id, data.website[2]?.id].filter(
        Boolean
      ) as string[],
    [data]
  );
  const mondayChildIds = ["monday_pending", "monday_completed"];

  const isActiveLink = (a: string, b: string) => {
    if (!hovered) return false;
    const id = hovered.id;
    const hubToAi: Record<string, string> = {
      hub_google: "ai_google",
      hub_clarity: "ai_clarity",
      hub_tasks: "ai_tasks",
      hub_website: "ai_website",
    };
    const aiToHub: Record<string, string> = {
      ai_google: "hub_google",
      ai_clarity: "hub_clarity",
      ai_tasks: "hub_tasks",
      ai_website: "hub_website",
    };

    if (id in hubToAi)
      return (
        (a === "center" && b === hubToAi[id]) || (a === hubToAi[id] && b === id)
      );
    if (id in aiToHub)
      return (a === "center" && b === id) || (a === id && b === aiToHub[id]);
    if (googleChildIds.includes(id))
      return (
        (a === "hub_google" && b === id) ||
        (a === "center" && b === "ai_google") ||
        (a === "ai_google" && b === "hub_google")
      );
    if (clarityChildIds.includes(id))
      return (
        (a === "hub_clarity" && b === id) ||
        (a === "center" && b === "ai_clarity") ||
        (a === "ai_clarity" && b === "hub_clarity")
      );
    if (mondayChildIds.includes(id))
      return (
        (a === "hub_tasks" && b === id) ||
        (a === "center" && b === "ai_tasks") ||
        (a === "ai_tasks" && b === "hub_tasks")
      );
    if (websiteChildIds.includes(id))
      return (
        (a === "hub_website" && b === id) ||
        (a === "center" && b === "ai_website") ||
        (a === "ai_website" && b === "hub_website")
      );
    return false;
  };
  const linkPairs = useMemo(() => {
    return [
      ["center", "ai_google"],
      ["ai_google", "hub_google"],
      ["center", "ai_clarity"],
      ["ai_clarity", "hub_clarity"],
      ["center", "ai_tasks"],
      ["ai_tasks", "hub_tasks"],
      ["center", "ai_website"],
      ["ai_website", "hub_website"],
      ["hub_google", data.gbp[0]?.id ?? "gbp_calls"],
      ["hub_clarity", data.clarity[0]?.id ?? "clar_sessions"],
      ["hub_clarity", data.clarity[1]?.id ?? "clar_bounce"],
      ["hub_tasks", "monday_pending"],
      ["hub_tasks", "monday_completed"],
      ["hub_website", data.website[0]?.id ?? "web_forms"],
      ["hub_website", data.website[1]?.id ?? "web_visitors"],
      ["hub_website", data.website[2]?.id ?? "web_perf"],
    ];
  }, [data]);

  return (
    <div
      ref={wrapperRef}
      className={
        "relative w-full min-h-[560px] md:min-h-[640px] lg:min-h-[720px] overflow-hidden rounded-3xl " +
        className
      }
    >
      <svg width={size.w} height={size.h} className="block">
        {/* backdrop */}
        <defs>
          <radialGradient id="orb-bg" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="white" stopOpacity={0.95} />
            <stop offset="70%" stopColor="white" stopOpacity={0.7} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </radialGradient>
          <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="10"
              floodOpacity="0.15"
            />
          </filter>
          <filter id="glareBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
        </defs>
        <radialGradient id="orb-radial-bg" cx="50%" cy="50%" r="50%">
          <stop offset="50%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <rect
          x={0}
          y={0}
          width={size.w}
          height={size.h}
          rx={24}
          fill="url(#orb-radial-bg)"
          stroke="rgba(255,255,255,0.6)"
        />

        {/* content scale wrapper */}
        <g
          transform={`translate(${cx}, ${cy}) scale(${visScale}) translate(${-cx}, ${-cy})`}
        >
          {/* rings */}
          {rings.map((r, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              className="orbit-ring"
              fill="none"
              stroke="rgba(148,163,184,0.45)"
              style={{ animationDelay: `${i * 0.8}s` }}
            />
          ))}

          {/* links */}
          {linkPairs.map(([a, b], i) => {
            const active = isActiveLink(a, b);
            return (
              <line
                key={i}
                x1={P(a).x}
                y1={P(a).y}
                x2={P(b).x}
                y2={P(b).y}
                className={`orbit-link${active ? " active" : ""}`}
              />
            );
          })}

          {/* nodes */}
          {/* center */}
          <g transform={`translate(${P("center").x}, ${P("center").y})`}>
            <g
              className="bubble orbit-float"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate?.("PMS Statistics")}
              onMouseEnter={() =>
                setHovered({
                  id: "center",
                  title: "Production",
                  value: `$${Intl.NumberFormat().format(
                    data.center.totalProduction
                  )} • ${Intl.NumberFormat().format(
                    data.center.totalPatients
                  )} patients`,
                  desc: "Practice production and patients summarized from PMS.",
                  r: centerR,
                })
              }
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                r={centerR}
                fill="rgba(255,255,255,0.72)"
                stroke="rgba(59,130,246,0)"
                filter="url(#softShadow)"
                data-core
              />
              <circle className="hover-outline" r={centerR} pathLength={100} />
              <circle
                r={centerR - 2}
                fill="none"
                stroke="rgba(203,213,225,0.7)"
              />
              <ellipse
                className="glare"
                rx={centerR * 0.6}
                ry={centerR * 0.36}
                cx={-centerR * 0.28}
                cy={-centerR * 0.52}
                fill="white"
                opacity={0.22}
                filter="url(#glareBlur)"
              />
              <text
                textAnchor="middle"
                y={-centerR * 0.28}
                fontSize={10}
                letterSpacing={1.2}
                fill="#64748b"
              >
                PRODUCTION
              </text>
              <text
                textAnchor="middle"
                y={0}
                fontSize={30}
                fontWeight={800}
                fill="#0f172a"
              >
                ${Intl.NumberFormat().format(data.center.totalProduction)}
              </text>
              <text
                textAnchor="middle"
                y={centerR * 0.34}
                fontSize={12}
                fill="#475569"
              >
                Patients{" "}
                <tspan fontWeight={700}>
                  {Intl.NumberFormat().format(data.center.totalPatients)}
                </tspan>
              </text>
            </g>
          </g>

          {/* AI intermediary orbs */}
          {(["ai_google", "ai_clarity", "ai_tasks", "ai_website"] as const).map(
            (id, idx) => (
              <g key={id} transform={`translate(${P(id).x}, ${P(id).y})`}>
                <g
                  className="bubble orbit-float"
                  style={{
                    animationDelay: `${0.25 + idx * 0.05}s`,
                    cursor: "default",
                  }}
                  onMouseEnter={() =>
                    setHovered({
                      id,
                      title: "AI Integration",
                      desc: "Powering integrations with Alloro AI",
                      r: AI_R,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                >
                  <circle
                    r={AI_R}
                    fill="rgba(255,255,255,0.7)"
                    stroke="rgba(59,130,246,0)"
                    filter="url(#softShadow)"
                    data-core
                  />
                  <circle className="hover-outline" r={AI_R} pathLength={100} />
                  <g transform={`translate(${-AI_R + 3}, ${-AI_R + 3})`}>
                    <image
                      href="/logo.png"
                      width={AI_R * 2 - 6}
                      height={AI_R * 2 - 6}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  </g>
                  <ellipse
                    className="glare"
                    rx={AI_R * 0.6}
                    ry={AI_R * 0.36}
                    cx={-AI_R * 0.28}
                    cy={-AI_R * 0.52}
                    fill="white"
                    opacity={0.22}
                    filter="url(#glareBlur)"
                  />
                </g>
              </g>
            )
          )}

          {/* hubs and metrics */}
          {/* Google hub (logo) */}
          <g
            transform={`translate(${P("hub_google").x}, ${P("hub_google").y})`}
            aria-label="Google metrics"
          >
            <g
              className="bubble orbit-float"
              style={{ animationDelay: "0.2s", cursor: "pointer" }}
              onClick={() => onNavigate?.("Patient Journey Insights")}
              onMouseEnter={() =>
                setHovered({
                  id: "hub_google",
                  title: "Google",
                  desc: "Your Google integrations powered by Alloro AI.",
                  r: 46,
                })
              }
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                r={46}
                fill="rgba(255,255,255,0.68)"
                stroke="rgba(59,130,246,0)"
                filter="url(#softShadow)"
                data-core
              />
              <circle className="hover-outline" r={46} pathLength={100} />
              <image
                href="/google-logo.webp"
                width={70}
                height={70}
                x={-35}
                y={-35}
                preserveAspectRatio="xMidYMid meet"
              />
              <ellipse
                className="glare"
                rx={46 * 0.6}
                ry={46 * 0.36}
                cx={-46 * 0.28}
                cy={-46 * 0.52}
                fill="white"
                opacity={0.22}
                filter="url(#glareBlur)"
              />
            </g>
          </g>

          {/* Google children */}
          {[data.gbp[0]].map((n) =>
            n ? (
              <g key={n.id} transform={`translate(${P(n.id).x}, ${P(n.id).y})`}>
                <g
                  className="bubble orbit-float"
                  style={{
                    animationDelay: `${0.3}s`,
                    cursor: "pointer",
                  }}
                  onClick={() => onNavigate?.("Patient Journey Insights")}
                  onMouseEnter={() =>
                    setHovered({
                      id: n.id,
                      title: n.label,
                      // Keep value inside the orb, omit in tooltip per request
                      value: undefined,
                      desc:
                        n.id === "gbp_calls"
                          ? "Calls to your practice from your Google Business Profile."
                          : "Google metric.",
                      r: 36,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                >
                  <circle
                    r={36}
                    fill="rgba(255,255,255,0.7)"
                    stroke="rgba(59,130,246,0)"
                    filter="url(#softShadow)"
                    data-core
                  />
                  <circle className="hover-outline" r={36} pathLength={100} />
                  <ellipse
                    className="glare"
                    rx={36 * 0.6}
                    ry={36 * 0.36}
                    cx={-36 * 0.28}
                    cy={-36 * 0.52}
                    fill="white"
                    opacity={0.22}
                    filter="url(#glareBlur)"
                  />
                  <text textAnchor="middle" y={-4} fontSize={10} fill="#64748b">
                    {n.label}
                  </text>
                  <text
                    textAnchor="middle"
                    y={14}
                    fontSize={16}
                    fontWeight={800}
                    fill="#0f172a"
                  >
                    {n.value as any}
                  </text>
                </g>
              </g>
            ) : null
          )}

          {/* Website hub (icon) */}
          <g
            transform={`translate(${P("hub_website").x}, ${
              P("hub_website").y
            })`}
            aria-label="Website metrics"
          >
            <g
              className="bubble orbit-float"
              style={{ animationDelay: "0.32s", cursor: "pointer" }}
              onClick={() => onNavigate?.("Patient Journey Insights")}
              onMouseEnter={() =>
                setHovered({
                  id: "hub_website",
                  title: "Website",
                  desc: "Your website performance powered by Alloro AI.",
                  r: 44,
                })
              }
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                r={44}
                fill="rgba(255,255,255,0.68)"
                stroke="rgba(59,130,246,0)"
                filter="url(#softShadow)"
                data-core
              />
              <circle className="hover-outline" r={44} pathLength={100} />
              <g transform="translate(-17,-17)">
                <Globe width={34} height={34} className="text-slate-700" />
              </g>
              <ellipse
                className="glare"
                rx={44 * 0.6}
                ry={44 * 0.36}
                cx={-44 * 0.28}
                cy={-44 * 0.52}
                fill="white"
                opacity={0.22}
                filter="url(#glareBlur)"
              />
            </g>
          </g>

          {/* Website children */}
          {[data.website[0], data.website[1], data.website[2]].map((n, idx) =>
            n ? (
              <g key={n.id} transform={`translate(${P(n.id).x}, ${P(n.id).y})`}>
                <g
                  className="bubble orbit-float"
                  style={{
                    animationDelay: `${0.4 + idx * 0.05}s`,
                    cursor: "pointer",
                  }}
                  onClick={() => onNavigate?.("Patient Journey Insights")}
                  onMouseEnter={() =>
                    setHovered({
                      id: n.id,
                      title: n.label,
                      value: undefined,
                      desc:
                        n.id === "web_forms"
                          ? "Leads captured via website forms."
                          : n.id === "web_visitors"
                          ? "Unique visitors to your website."
                          : "Composite site performance score.",
                      r: 32,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                >
                  <circle
                    r={32}
                    fill="rgba(255,255,255,0.7)"
                    stroke="rgba(59,130,246,0)"
                    filter="url(#softShadow)"
                    data-core
                  />
                  <circle className="hover-outline" r={32} pathLength={100} />
                  <ellipse
                    className="glare"
                    rx={32 * 0.6}
                    ry={32 * 0.36}
                    cx={-32 * 0.28}
                    cy={-32 * 0.52}
                    fill="white"
                    opacity={0.22}
                    filter="url(#glareBlur)"
                  />
                  <text textAnchor="middle" y={-3} fontSize={10} fill="#64748b">
                    {n.label}
                  </text>
                  <text
                    textAnchor="middle"
                    y={14}
                    fontSize={15}
                    fontWeight={800}
                    fill="#0f172a"
                  >
                    {n.value as any}
                  </text>
                </g>
              </g>
            ) : null
          )}

          {/* Clarity hub (logo) */}
          <g
            transform={`translate(${P("hub_clarity").x}, ${
              P("hub_clarity").y
            })`}
            aria-label="Clarity metrics"
          >
            <g
              className="bubble orbit-float"
              style={{ animationDelay: "0.35s", cursor: "pointer" }}
              onClick={() => onNavigate?.("Patient Journey Insights")}
              onMouseEnter={() =>
                setHovered({
                  id: "hub_clarity",
                  title: "Clarity",
                  desc: "Your Microsoft Clarity integration powered by Alloro AI.",
                  r: 44,
                })
              }
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                r={44}
                fill="rgba(255,255,255,0.68)"
                stroke="rgba(59,130,246,0)"
                filter="url(#softShadow)"
                data-core
              />
              <circle className="hover-outline" r={44} pathLength={100} />
              <image
                href="/clarity-logo.png"
                width={70}
                height={70}
                x={-35}
                y={-35}
                preserveAspectRatio="xMidYMid meet"
              />
              <ellipse
                className="glare"
                rx={44 * 0.6}
                ry={44 * 0.36}
                cx={-44 * 0.28}
                cy={-44 * 0.52}
                fill="white"
                opacity={0.22}
                filter="url(#glareBlur)"
              />
            </g>
          </g>

          {[data.clarity[0], data.clarity[1]].map((n) =>
            n ? (
              <g key={n.id} transform={`translate(${P(n.id).x}, ${P(n.id).y})`}>
                <g
                  className="bubble orbit-float"
                  style={{
                    animationDelay: `${
                      0.45 + (n.id.includes("bounce") ? 0.1 : 0)
                    }s`,
                    cursor: "pointer",
                  }}
                  onClick={() => onNavigate?.("Patient Journey Insights")}
                  onMouseEnter={() =>
                    setHovered({
                      id: n.id,
                      title: n.label,
                      value: undefined,
                      desc:
                        n.id === "clar_sessions"
                          ? "Total sessions recorded by Microsoft Clarity."
                          : n.id === "clar_bounce"
                          ? "Percentage of sessions with no further interaction."
                          : "Microsoft Clarity metric.",
                      r: 30,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                >
                  <circle
                    r={30}
                    fill="rgba(255,255,255,0.7)"
                    stroke="rgba(59,130,246,0)"
                    filter="url(#softShadow)"
                    data-core
                  />
                  <circle className="hover-outline" r={30} pathLength={100} />
                  <ellipse
                    className="glare"
                    rx={30 * 0.6}
                    ry={30 * 0.36}
                    cx={-30 * 0.28}
                    cy={-30 * 0.52}
                    fill="white"
                    opacity={0.22}
                    filter="url(#glareBlur)"
                  />
                  <text textAnchor="middle" y={-2} fontSize={10} fill="#64748b">
                    {n.label}
                  </text>
                  <text
                    textAnchor="middle"
                    y={14}
                    fontSize={15}
                    fontWeight={800}
                    fill="#0f172a"
                  >
                    {n.value as any}
                  </text>
                </g>
              </g>
            ) : null
          )}

          {/* Monday (Tasks) hub with logo */}
          <g
            transform={`translate(${P("hub_tasks").x}, ${P("hub_tasks").y})`}
            aria-label="Monday tasks"
          >
            <g
              className="bubble orbit-float"
              style={{ animationDelay: "0.5s", cursor: "pointer" }}
              onClick={() => onNavigate?.("Tasks")}
              onMouseEnter={() =>
                setHovered({
                  id: "hub_tasks",
                  title: "Tasks",
                  value: data.tasks,
                  desc: "Your tasks powered by Alloro AI.",
                  r: 50,
                })
              }
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                r={50}
                fill="rgba(255,255,255,0.66)"
                stroke="rgba(59,130,246,0)"
                filter="url(#softShadow)"
                data-core
              />
              <circle className="hover-outline" r={50} pathLength={100} />
              <g transform="translate(-17,-17)">
                <ClipboardList
                  width={34}
                  height={34}
                  className="text-slate-700"
                />
              </g>
              <ellipse
                className="glare"
                rx={50 * 0.6}
                ry={50 * 0.36}
                cx={-50 * 0.28}
                cy={-50 * 0.52}
                fill="white"
                opacity={0.22}
                filter="url(#glareBlur)"
              />
            </g>
          </g>

          {/* Monday cluster children */}
          {[
            {
              id: "monday_pending",
              label: "Pending",
              value: data.tasksPending,
            },
            {
              id: "monday_completed",
              label: "Completed",
              value: data.tasksCompleted,
            },
          ].map((n, idx) => (
            <g key={n.id} transform={`translate(${P(n.id).x}, ${P(n.id).y})`}>
              <g
                className="bubble orbit-float"
                style={{
                  animationDelay: `${0.55 + idx * 0.1}s`,
                  cursor: "pointer",
                }}
                onClick={() => onNavigate?.("Tasks")}
                onMouseEnter={() =>
                  setHovered({
                    id: n.id,
                    title: n.label,
                    value: undefined,
                    desc:
                      n.id === "monday_pending"
                        ? "Open tasks awaiting action."
                        : "Tasks completed.",
                    r: 32,
                  })
                }
                onMouseLeave={() => setHovered(null)}
              >
                <circle
                  r={32}
                  fill="rgba(255,255,255,0.7)"
                  stroke="rgba(59,130,246,0)"
                  filter="url(#softShadow)"
                  data-core
                />
                <circle className="hover-outline" r={32} pathLength={100} />
                <ellipse
                  className="glare"
                  rx={32 * 0.6}
                  ry={32 * 0.36}
                  cx={-32 * 0.28}
                  cy={-32 * 0.52}
                  fill="white"
                  opacity={0.22}
                  filter="url(#glareBlur)"
                />
                <text textAnchor="middle" y={-2} fontSize={10} fill="#64748b">
                  {n.label}
                </text>
                <text
                  textAnchor="middle"
                  y={14}
                  fontSize={16}
                  fontWeight={800}
                  fill="#0f172a"
                >
                  {n.value as any}
                </text>
              </g>
            </g>
          ))}
        </g>
      </svg>
      {tooltip && hovered && (
        <div
          className="absolute z-20 pointer-events-none px-3 py-2 rounded-xl shadow-lg glass text-xs text-slate-800 border border-white/60 orbit-tooltip"
          style={{
            left: Math.max(8, Math.min(size.w - 220, tooltip.x)),
            top: Math.max(8, tooltip.y),
          }}
        >
          <div className="font-semibold text-slate-900">{hovered.title}</div>
          {hovered.desc && (
            <div className="text-slate-600 mt-0.5">{hovered.desc}</div>
          )}
          {/* Value omitted in tooltip by request */}
          <div className="text-[10px] text-slate-500 mt-1">
            Click to see more
          </div>
        </div>
      )}
    </div>
  );
};

export default OrbitVizD3;
