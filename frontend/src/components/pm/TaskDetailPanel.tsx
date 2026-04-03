import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Trash2, Calendar } from "lucide-react";
import type { PmTask } from "../../types/pm";
import { usePmStore } from "../../stores/pmStore";
import { fetchPmUsers } from "../../api/pm";
import { formatDeadline, endOfDayPST } from "../../utils/pmDateFormat";
import { PriorityTriangle } from "./PriorityTriangle";
import { RichTextEditor } from "./RichTextEditor";

const PRIORITIES = [
  { value: "P1", label: "Top of the hour" },
  { value: "P2", label: "Today" },
  { value: "P3", label: "3 days" },
  { value: "P4", label: "This week" },
  { value: "P5", label: "Next week" },
] as const;

interface TaskDetailPanelProps {
  task: PmTask | null;
  onClose: () => void;
  isBacklog?: boolean;
}

export function TaskDetailPanel({ task, onClose, isBacklog }: TaskDetailPanelProps) {
  const updateTask = usePmStore((s) => s.updateTask);
  const assignTask = usePmStore((s) => s.assignTask);
  const deleteTask = usePmStore((s) => s.deleteTask);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("P3");
  const [deadline, setDeadline] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [users, setUsers] = useState<Array<{ id: number; display_name: string; email: string }>>([]);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setPriority(task.priority ?? "P3");
      setDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
      setShowDeleteConfirm(false);
    }
  }, [task]);

  useEffect(() => {
    fetchPmUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  if (!task) return null;

  const handleTitleBlur = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) {
      updateTask(task.id, { title: trimmed });
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== (task.description || "")) {
      updateTask(task.id, { description: description || null } as any);
    }
  };

  const handlePriorityChange = (p: string) => {
    setPriority(p);
    // Auto-set deadline to today for P1/P2 if no deadline
    if (["P1", "P2"].includes(p) && !deadline) {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      setDeadline(today);
      updateTask(task.id, { priority: p, deadline: endOfDayPST(today) } as any);
    } else {
      updateTask(task.id, { priority: p } as any);
    }
  };

  const handleDeadlineChange = (value: string) => {
    setDeadline(value);
    updateTask(task.id, {
      deadline: value ? endOfDayPST(value) : null,
    } as any);
  };

  const handleDelete = async () => {
    await deleteTask(task.id);
    onClose();
  };

  const deadlineDisplay = task.completed_at ? null : formatDeadline(task.deadline);

  const isCompletedLate = !!task.completed_at && !!task.deadline && (
    new Date(task.completed_at).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) > task.deadline.slice(0, 10)
  );

  return (
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 z-50 h-full w-[50vw] max-w-[720px] min-w-[400px] overflow-y-auto border-l shadow-xl"
            style={{ borderColor: "var(--color-pm-border)", backgroundColor: "var(--color-pm-bg-secondary)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-pm-border px-6 py-4">
              <div className="flex items-center gap-2">
                {task.source === "ai_synth" && (
                  <span className="flex items-center gap-1 rounded-full bg-pm-accent/10 px-2.5 py-1 text-xs font-medium text-pm-accent">
                    <Sparkles className="h-3 w-3" />
                    AI Synth
                  </span>
                )}
                {deadlineDisplay && (
                  <span className={`text-xs font-medium ${deadlineDisplay.colorClass}`}>
                    {deadlineDisplay.text}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              {/* Title */}
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => e.key === "Enter" && titleRef.current?.blur()}
                className="w-full bg-transparent text-lg font-bold text-pm-text-primary placeholder:text-pm-text-muted focus:outline-none"
                placeholder="Task title"
              />

              {/* Description (Rich Text) */}
              <div onBlur={handleDescriptionBlur}>
                <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                  Description
                </label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  minHeight={140}
                  placeholder="Add a description..."
                />
              </div>

              {/* Assigned To */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                  Assigned To
                </label>
                <select
                  value={task.assigned_to ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    assignTask(task.id, val ? parseInt(val, 10) : null);
                  }}
                  className="w-full rounded-lg border border-pm-border bg-pm-bg-primary py-2 px-3 text-sm text-pm-text-primary focus:border-pm-accent focus:outline-none focus:ring-1 focus:ring-pm-accent"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              {isBacklog ? (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                    Priority
                  </label>
                  <p className="text-xs text-pm-text-muted">
                    Move out of Backlog to set priority
                  </p>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                    Priority
                  </label>
                  <div className="flex gap-2">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => handlePriorityChange(p.value)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                          priority === p.value
                            ? "bg-pm-bg-hover text-pm-text-primary ring-1 ring-pm-border-hover"
                            : "text-pm-text-muted hover:bg-pm-bg-hover"
                        }`}
                      >
                        <PriorityTriangle priority={p.value as any} size={12} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Deadline */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                  Deadline
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pm-text-muted" />
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => handleDeadlineChange(e.target.value)}
                    className="w-full rounded-lg border border-pm-border bg-pm-bg-primary py-2 pl-10 pr-3 text-sm text-pm-text-primary focus:border-pm-accent focus:outline-none focus:ring-1 focus:ring-pm-accent"
                  />
                </div>
              </div>

              {/* Completed At (read-only, shown when task is done) */}
              {task.completed_at && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
                    Completed
                  </label>
                  <div
                    className="flex items-center gap-2 rounded-lg py-2 px-3 text-sm"
                    style={{
                      backgroundColor: "var(--color-pm-bg-primary)",
                      border: "1px solid var(--color-pm-border)",
                      color: "#3D8B40",
                    }}
                  >
                    <span>
                      {new Date(task.completed_at).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "America/Los_Angeles",
                      })}
                    </span>
                    {isCompletedLate && (
                      <span className="text-[11px] font-semibold text-[#C43333] ml-auto">
                        completed late
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Delete */}
              <div className="border-t border-pm-border pt-6">
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-pm-danger hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete task
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-pm-text-secondary">
                      Are you sure?
                    </span>
                    <button
                      onClick={handleDelete}
                      className="rounded-lg bg-pm-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-pm-text-muted hover:text-pm-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
