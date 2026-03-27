import { useState } from "react";
import { motion } from "framer-motion";
import type { PmColumn } from "../../types/pm";
import { RichTextPreview } from "./RichTextEditor";
import { PriorityTriangle } from "./PriorityTriangle";

interface ProposedTask {
  title: string;
  description: string | null;
  priority: "P1" | "P2" | "P3";
  deadline_hint: string | null;
  included: boolean;
}

const PRIORITY_CYCLE: ("P1" | "P2" | "P3")[] = ["P1", "P2", "P3"];
const PRIORITY_LABEL_COLORS: Record<string, string> = {
  P1: "#C43333",
  P2: "#D4920A",
  P3: "#3D8B40",
};

interface ProposedTaskListProps {
  tasks: Array<{
    title: string;
    description: string | null;
    priority: "P1" | "P2" | "P3";
    deadline_hint: string | null;
  }>;
  columns: PmColumn[];
  onConfirm: (
    tasks: Array<{
      title: string;
      description: string | null;
      priority: string;
      deadline: string | null;
    }>,
    columnId: string
  ) => void;
  isCreating: boolean;
}

export function ProposedTaskList({
  tasks: initialTasks,
  columns,
  onConfirm,
  isCreating,
}: ProposedTaskListProps) {
  const [tasks, setTasks] = useState<ProposedTask[]>(
    initialTasks.map((t) => ({ ...t, included: true }))
  );
  const [selectedColumnId, setSelectedColumnId] = useState(
    columns.find((c) => c.name === "To Do")?.id || columns[0]?.id || ""
  );

  const includedCount = tasks.filter((t) => t.included).length;

  const updateTask = (index: number, updates: Partial<ProposedTask>) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...updates } : t))
    );
  };

  const cyclePriority = (index: number) => {
    const current = tasks[index].priority;
    const next = PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(current) + 1) % 3];
    updateTask(index, { priority: next });
  };

  const handleConfirm = () => {
    const included = tasks
      .filter((t) => t.included)
      .map((t) => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        deadline: t.deadline_hint || null,
      }));
    onConfirm(included, selectedColumnId);
  };

  return (
    <div className="space-y-4">
      {/* Column selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
          Add to column
        </label>
        <select
          value={selectedColumnId}
          onChange={(e) => setSelectedColumnId(e.target.value)}
          className="w-full rounded-lg border border-pm-border bg-pm-bg-primary px-3 py-2 text-sm text-pm-text-primary focus:border-pm-accent focus:outline-none"
        >
          {columns.map((col) => (
            <option key={col.id} value={col.id}>
              {col.name}
            </option>
          ))}
        </select>
      </div>

      {/* Task cards */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {tasks.map((task, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`rounded-lg border p-3 transition-all ${
              task.included
                ? "border-pm-border bg-pm-bg-secondary"
                : "border-pm-border/50 bg-pm-bg-primary opacity-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={task.included}
                onChange={(e) => updateTask(i, { included: e.target.checked })}
                className="mt-1 h-4 w-4 rounded accent-pm-accent"
              />
              <div className="flex-1 min-w-0">
                <input
                  value={task.title}
                  onChange={(e) => updateTask(i, { title: e.target.value })}
                  className="w-full bg-transparent text-sm font-semibold text-pm-text-primary focus:outline-none"
                />
                {task.description && (
                  <div className="mt-0.5 line-clamp-2 overflow-hidden">
                    <RichTextPreview html={task.description} />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => cyclePriority(i)}
                    className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: `${PRIORITY_LABEL_COLORS[task.priority]}20`, color: PRIORITY_LABEL_COLORS[task.priority] }}
                  >
                    <PriorityTriangle priority={task.priority} size={10} />
                    {task.priority}
                  </button>
                  {task.deadline_hint && (
                    <span className="text-xs text-pm-text-muted">
                      {task.deadline_hint}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        disabled={includedCount === 0 || isCreating}
        className="w-full rounded-lg bg-pm-accent px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-pm-accent-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pm-accent/20"
      >
        {isCreating
          ? "Creating..."
          : `Create ${includedCount} Task${includedCount !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
