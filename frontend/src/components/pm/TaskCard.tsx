import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, Sparkles, Calendar, Loader2, Check } from "lucide-react";
import type { PmTask, PmColumn } from "../../types/pm";
import { formatDeadline } from "../../utils/pmDateFormat";
import { PriorityTriangle } from "./PriorityTriangle";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../ui/context-menu";

export type TaskContextAction =
  | { type: "open" }
  | { type: "delete" }
  | { type: "moveToProject" }
  | { type: "moveToColumn"; columnId: string }
  | { type: "setPriority"; priority: "P1" | "P2" | "P3" | "P4" | "P5" | null }
  | { type: "assign" };

interface TaskCardProps {
  task: PmTask;
  onClick: () => void;
  onDelete?: (taskId: string) => void;
  isBacklog?: boolean;
  // Multi-select props (optional; card renders without them on read-only views)
  isSelected?: boolean;
  selectionActive?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onContextAction?: (action: TaskContextAction, taskId: string) => void;
  siblingColumns?: PmColumn[];
}

export function TaskCard({
  task,
  onClick,
  onDelete,
  isBacklog = false,
  isSelected = false,
  selectionActive = false,
  onToggleSelect,
  onContextAction,
  siblingColumns = [],
}: TaskCardProps) {
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

  const deadline = task.completed_at ? null : formatDeadline(task.deadline);

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

  const handleCheckboxClick = (e: React.MouseEvent) => {
    // Never let the checkbox start a drag or open the detail panel.
    e.stopPropagation();
    onToggleSelect?.(task.id);
  };

  const handleCheckboxPointerDown = (e: React.PointerEvent) => {
    // Block pointer events from reaching the dnd-kit sensor.
    e.stopPropagation();
  };

  const priorityOptions: Array<"P1" | "P2" | "P3" | "P4" | "P5"> = [
    "P1",
    "P2",
    "P3",
    "P4",
    "P5",
  ];

  const cardBody = (
    <motion.div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: "var(--color-pm-bg-tertiary)",
        border: "1px solid var(--color-pm-border)",
        boxShadow: isSelected
          ? "0 0 0 2px #D66853, var(--pm-shadow-card)"
          : isDragging
          ? "var(--pm-shadow-elevated)"
          : "var(--pm-shadow-card)",
        opacity: isDragging ? 0.9 : 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      initial={false}
      exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0 }}
      onClick={onClick}
      {...attributes}
      {...listeners}
      data-task-id={task.id}
      className="group relative rounded-lg p-3 transition-all duration-150 hover:translate-y-[-1px] hover:shadow-[var(--pm-shadow-card-hover)] hover:border-[var(--color-pm-border-hover)]"
      onMouseLeave={() => setShowDeleteConfirm(false)}
    >
      {/* Selection checkbox — shown on hover or when selection is active */}
      {onToggleSelect && (
        <button
          type="button"
          onClick={handleCheckboxClick}
          onPointerDown={handleCheckboxPointerDown}
          className={`absolute top-2 left-2 z-10 flex h-4 w-4 items-center justify-center rounded border transition-opacity duration-150 ${
            isSelected || selectionActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{
            borderColor: isSelected ? "#D66853" : "var(--color-pm-border)",
            backgroundColor: isSelected ? "#D66853" : "var(--color-pm-bg-primary)",
          }}
          aria-label={isSelected ? "Deselect task" : "Select task"}
          aria-pressed={isSelected}
        >
          {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={2.5} />}
        </button>
      )}
      {/* Row 1: Priority + Title + Delete */}
      <div className="flex items-start gap-2 mb-2">
        {!isBacklog && <PriorityTriangle priority={task.priority} size={12} />}

        <p
          className="flex-1 text-[13px] font-semibold leading-snug truncate"
          style={{ color: "var(--color-pm-text-primary)" }}
          title={task.title}
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
        <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--color-pm-text-muted)" }}>
          {(task.creator_name || task.created_by) && (
            <span>by {task.creator_name || task.created_by}</span>
          )}
          {task.assignee_name && (
            <span>→ {task.assignee_name}</span>
          )}
        </span>
      </div>
    </motion.div>
  );

  // Without a context action handler, render the bare card (drag still works).
  if (!onContextAction) return cardBody;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardBody}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onContextAction({ type: "open" }, task.id)}>
          Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onContextAction({ type: "assign" }, task.id)}>
          Assign…
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Set priority</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {priorityOptions.map((p) => (
              <ContextMenuItem
                key={p}
                onSelect={() =>
                  onContextAction({ type: "setPriority", priority: p }, task.id)
                }
              >
                {p}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() =>
                onContextAction({ type: "setPriority", priority: null }, task.id)
              }
            >
              Clear priority
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {siblingColumns.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Move to column</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {siblingColumns
                .filter((c) => c.id !== task.column_id)
                .map((c) => (
                  <ContextMenuItem
                    key={c.id}
                    onSelect={() =>
                      onContextAction({ type: "moveToColumn", columnId: c.id }, task.id)
                    }
                  >
                    {c.name}
                  </ContextMenuItem>
                ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!isBacklog}
          onSelect={() => onContextAction({ type: "moveToProject" }, task.id)}
        >
          {isBacklog ? "Move to project…" : "Move to project (backlog only)"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          destructive
          onSelect={() => onContextAction({ type: "delete" }, task.id)}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
