import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, Sparkles, Calendar, Loader2 } from "lucide-react";
import type { PmTask } from "../../types/pm";
import { formatDeadline } from "../../utils/pmDateFormat";
import { PriorityTriangle } from "./PriorityTriangle";

interface TaskCardProps {
  task: PmTask;
  onClick: () => void;
  onDelete?: (taskId: string) => void;
  isBacklog?: boolean;
}

export function TaskCard({ task, onClick, onDelete, isBacklog = false }: TaskCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const deadline = formatDeadline(task.deadline);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleting(true);
    try {
      await onDelete?.(task.id);
    } catch {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: "var(--color-pm-bg-tertiary)",
        border: "1px solid var(--color-pm-border)",
        boxShadow: isDragging ? "var(--pm-shadow-elevated)" : "var(--pm-shadow-card)",
        opacity: isDragging ? 0.9 : 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      initial={false}
      exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0 }}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className="group relative rounded-lg p-3 transition-all duration-150 hover:translate-y-[-1px] hover:shadow-[var(--pm-shadow-card-hover)] hover:border-[var(--color-pm-border-hover)]"
      onMouseLeave={() => setShowDeleteConfirm(false)}
    >
      {/* Row 1: Priority + Title + Delete */}
      <div className="flex items-start gap-2 mb-2">
        {!isBacklog && <PriorityTriangle priority={task.priority} size={12} />}

        <p
          className="flex-1 text-[13px] font-semibold leading-snug truncate"
          style={{ color: "var(--color-pm-text-primary)" }}
        >
          {task.title}
        </p>

        {task.source === "ai_synth" && (
          <Sparkles className="h-3 w-3 flex-shrink-0 mt-0.5" strokeWidth={1.5} style={{ color: "#D66853", opacity: 0.6 }} />
        )}

        <div className="relative flex-shrink-0">
          <button
            onClick={handleDeleteClick}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded p-0.5"
            style={{ color: "var(--color-pm-text-muted)" }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <AnimatePresence>
            {showDeleteConfirm && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.9 }}
                transition={{ duration: 0.12 }}
                className="absolute top-full right-0 mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 z-50 whitespace-nowrap"
                style={{
                  backgroundColor: "var(--color-pm-bg-tertiary)",
                  border: "1px solid var(--color-pm-border)",
                  boxShadow: "var(--pm-shadow-elevated)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[11px]" style={{ color: "var(--color-pm-text-secondary)" }}>Delete?</span>
                <button onClick={handleConfirmDelete} disabled={isDeleting} className="text-[11px] font-semibold text-[#C43333]">
                  {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }} className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
                  No
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Row 2: Deadline + Created by */}
      <div className="flex items-center justify-between">
        {deadline ? (
          <div className="flex items-center gap-1" title={deadline.tooltip}>
            <Calendar className="h-3 w-3" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
            <span className={`text-[11px] font-medium ${deadline.colorClass}`}>{deadline.text}</span>
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>—</span>
        )}
        {((task as any).creator_name || task.created_by) && (
          <span className="text-[10px]" style={{ color: "var(--color-pm-text-muted)" }}>
            by {(task as any).creator_name || task.created_by}
          </span>
        )}
      </div>
    </motion.div>
  );
}
