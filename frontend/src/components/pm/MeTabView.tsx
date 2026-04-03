import { useEffect, useState, useCallback } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Target, CalendarRange, TrendingUp } from "lucide-react";
import {
  LineChart, Line, XAxis, Tooltip, ResponsiveContainer, Area,
} from "recharts";
import type { PmMyStats, PmMyTask, PmMyTasksResponse, PmVelocityData } from "../../types/pm";
import { fetchMyStats, fetchMyVelocity, fetchMyTasks } from "../../api/pm";
import { MeKanbanBoard } from "./MeKanbanBoard";
import { NotificationCard } from "./NotificationCard";
import { TaskDetailPanel } from "./TaskDetailPanel";

const RANGES = ["7d", "4w", "3m"] as const;
type Range = typeof RANGES[number];

function AnimatedNum({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 50, damping: 15 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [current, setCurrent] = useState(0);
  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => display.on("change", setCurrent), [display]);
  return <span>{current}</span>;
}

const SEVERITY_COLORS: Record<string, string> = {
  green: "#3D8B40",
  amber: "#D4920A",
  red: "#C43333",
};

function VelocityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const completed = payload.find((p: any) => p.dataKey === "completed")?.value ?? 0;
  const overdue = payload.find((p: any) => p.dataKey === "overdue")?.value ?? 0;
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "var(--color-pm-bg-tertiary)", border: "1px solid var(--color-pm-border)", boxShadow: "var(--pm-shadow-elevated)" }}>
      <p className="text-[12px] font-semibold mb-1" style={{ color: "var(--color-pm-text-primary)" }}>{label}</p>
      <p className="text-[11px]" style={{ color: "#3D8B40" }}>✓ {completed} completed</p>
      {overdue > 0 && <p className="text-[11px]" style={{ color: "#C43333" }}>⚠ {overdue} overdue</p>}
    </div>
  );
}

export function MeTabView() {
  const [stats, setStats] = useState<PmMyStats | null>(null);
  const [velocity, setVelocity] = useState<PmVelocityData | null>(null);
  const [tasks, setTasks] = useState<PmMyTasksResponse | null>(null);
  const [velocityRange, setVelocityRange] = useState<Range>("7d");
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<PmMyTask | null>(null);

  const handleTaskClick = useCallback((taskId: string) => {
    setHighlightedTaskId(taskId);
    setTimeout(() => setHighlightedTaskId(null), 2000);
    document.getElementById(`me-task-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const loadData = useCallback(async () => {
    const [s, v, t] = await Promise.allSettled([
      fetchMyStats(),
      fetchMyVelocity(velocityRange),
      fetchMyTasks(),
    ]);
    if (s.status === "fulfilled") setStats(s.value);
    if (v.status === "fulfilled") setVelocity(v.value);
    if (t.status === "fulfilled") setTasks(t.value);
  }, [velocityRange]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const focusCount = stats?.focus_today.count ?? 0;
  const weekCount = stats?.this_week.count ?? 0;
  const focusSeverity = stats?.focus_today.severity ?? "green";

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Top row: stat cards + notification */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Focus Today card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-[14px] p-5"
          style={{
            backgroundColor: "var(--color-pm-bg-secondary)",
            boxShadow: "var(--pm-shadow-card)",
            border: "1px solid var(--color-pm-border)",
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: "rgba(214,104,83,0.08)" }}>
              <Target className="h-5 w-5" style={{ color: "#D66853" }} strokeWidth={1.5} />
            </div>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--color-pm-bg-hover)", color: "var(--color-pm-text-muted)" }}>
              Mine
            </span>
          </div>
          <div className="mt-4">
            <div className="text-[28px] font-bold leading-none" style={{ color: SEVERITY_COLORS[focusSeverity] }}>
              <AnimatedNum value={focusCount} />
            </div>
            <p className="mt-1 text-[13px] font-medium" style={{ color: "var(--color-pm-text-primary)" }}>
              Focus Today
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--color-pm-text-secondary)" }}>
              {stats?.focus_today.subtitle ?? "—"}
            </p>
          </div>
        </motion.div>

        {/* This Week card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.06 }}
          className="rounded-[14px] p-5"
          style={{
            backgroundColor: "var(--color-pm-bg-secondary)",
            boxShadow: "var(--pm-shadow-card)",
            border: "1px solid var(--color-pm-border)",
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: "rgba(91,155,213,0.08)" }}>
              <CalendarRange className="h-5 w-5" style={{ color: "#5B9BD5" }} strokeWidth={1.5} />
            </div>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--color-pm-bg-hover)", color: "var(--color-pm-text-muted)" }}>
              Mine
            </span>
          </div>
          <div className="mt-4">
            <div className="text-[28px] font-bold leading-none" style={{ color: "var(--color-pm-text-primary)" }}>
              <AnimatedNum value={weekCount} />
            </div>
            <p className="mt-1 text-[13px] font-medium" style={{ color: "var(--color-pm-text-primary)" }}>
              This Week
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--color-pm-text-secondary)" }}>
              {stats?.this_week.subtitle ?? "—"}
            </p>
          </div>
        </motion.div>

        {/* Notification Card */}
        <NotificationCard onTaskClick={handleTaskClick} />
      </div>

      {/* Velocity chart */}
      <div
        className="rounded-[14px] p-5"
        style={{
          backgroundColor: "var(--color-pm-bg-secondary)",
          boxShadow: "var(--pm-shadow-card)",
          border: "1px solid var(--color-pm-border)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" strokeWidth={1.5} style={{ color: "#D66853" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>
              My Velocity
            </span>
            {velocity && (
              <span className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
                {velocity.completed_total} completed · {velocity.overdue_total} overdue
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setVelocityRange(r)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors duration-150"
                style={{
                  backgroundColor: velocityRange === r ? "var(--color-pm-bg-hover)" : "transparent",
                  color: velocityRange === r ? "var(--color-pm-text-primary)" : "var(--color-pm-text-muted)",
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={velocity?.data ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <defs>
              <linearGradient id="meVelocityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#D66853" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#D66853" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-pm-text-muted)" }} axisLine={false} tickLine={false} />
            <Tooltip content={<VelocityTooltip />} />
            <Area type="monotone" dataKey="completed" stroke="none" fill="url(#meVelocityGrad)" />
            <Line type="monotone" dataKey="completed" stroke="#D66853" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="overdue" stroke="#C43333" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Kanban */}
      {tasks && (
        <MeKanbanBoard
          tasks={tasks}
          onRefresh={loadData}
          highlightedTaskId={highlightedTaskId}
          onCardClick={(task) => setSelectedTask(task)}
        />
      )}

      {/* Task detail panel */}
      <TaskDetailPanel task={selectedTask} onClose={() => { setSelectedTask(null); loadData(); }} />
    </div>
  );
}
