import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, ArrowRight, Loader2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { usePmStore } from "../../stores/pmStore";

interface MoveToProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskCount: number;
  currentProjectId: string | null;
  onConfirm: (targetProjectId: string) => Promise<void>;
}

export function MoveToProjectModal({
  isOpen,
  onClose,
  taskCount,
  currentProjectId,
  onConfirm,
}: MoveToProjectModalProps) {
  const projects = usePmStore((s) => s.projects);
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects
      .filter((p) => p.id !== currentProjectId && p.status === "active")
      .filter((p) =>
        term ? p.name.toLowerCase().includes(term) : true
      );
  }, [projects, currentProjectId, search]);

  const handleConfirm = async () => {
    if (!selectedProjectId || isMoving) return;
    setIsMoving(true);
    setError(null);
    try {
      await onConfirm(selectedProjectId);
      setSelectedProjectId(null);
      setSearch("");
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { error?: string })?.error;
      setError(message || "Move failed. Try again.");
    } finally {
      setIsMoving(false);
    }
  };

  const handleClose = () => {
    if (isMoving) return;
    setSelectedProjectId(null);
    setSearch("");
    setError(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: "var(--color-pm-bg-secondary)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
              border: "1px solid var(--color-pm-border)",
              maxHeight: "70vh",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--color-pm-border-subtle)" }}
            >
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-[#D66853]" strokeWidth={1.5} />
                <h2
                  className="text-[15px] font-semibold"
                  style={{ color: "var(--color-pm-text-primary)" }}
                >
                  Move {taskCount} task{taskCount !== 1 ? "s" : ""} to project
                </h2>
              </div>
              <button
                onClick={handleClose}
                className="rounded-lg p-1.5"
                style={{ color: "var(--color-pm-text-muted)" }}
                disabled={isMoving}
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 pt-4 flex-shrink-0">
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{
                  backgroundColor: "var(--color-pm-bg-primary)",
                  border: "1px solid var(--color-pm-border)",
                }}
              >
                <Search
                  className="h-3.5 w-3.5"
                  strokeWidth={1.5}
                  style={{ color: "var(--color-pm-text-muted)" }}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  autoFocus
                  className="flex-1 bg-transparent text-[13px] outline-none"
                  style={{ color: "var(--color-pm-text-primary)" }}
                />
              </div>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {filteredProjects.length === 0 ? (
                <p
                  className="py-8 text-center text-[13px]"
                  style={{ color: "var(--color-pm-text-muted)" }}
                >
                  No projects match.
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredProjects.map((p) => {
                    const isSelected = selectedProjectId === p.id;
                    const iconName = p.icon.charAt(0).toUpperCase() + p.icon.slice(1);
                    const IconComponent =
                      (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>>)[
                        iconName
                      ] || LucideIcons.FolderKanban;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProjectId(p.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors"
                        style={{
                          backgroundColor: isSelected
                            ? "var(--color-pm-bg-hover)"
                            : "transparent",
                          border: isSelected
                            ? "1px solid #D66853"
                            : "1px solid transparent",
                        }}
                      >
                        <IconComponent
                          className="h-4 w-4 flex-shrink-0"
                          strokeWidth={1.5}
                          style={{ color: p.color }}
                        />
                        <span
                          className="flex-1 truncate text-[13px] font-medium"
                          style={{ color: "var(--color-pm-text-primary)" }}
                        >
                          {p.name}
                        </span>
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--color-pm-text-muted)" }}
                        >
                          {p.tasks_by_status?.backlog ?? 0} backlog
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <div
                className="mx-5 mb-2 rounded-lg px-3 py-2 text-[12px]"
                style={{
                  backgroundColor: "rgba(196,51,51,0.1)",
                  color: "#C43333",
                  border: "1px solid rgba(196,51,51,0.2)",
                }}
              >
                {error}
              </div>
            )}

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-2 px-5 py-3 flex-shrink-0"
              style={{ borderTop: "1px solid var(--color-pm-border-subtle)" }}
            >
              <button
                onClick={handleClose}
                disabled={isMoving}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
                style={{ color: "var(--color-pm-text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedProjectId || isMoving}
                className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#D66853" }}
              >
                {isMoving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Move {taskCount} task{taskCount !== 1 ? "s" : ""}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
