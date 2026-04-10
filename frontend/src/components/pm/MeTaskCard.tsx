import { motion } from "framer-motion";
import { Calendar, Check } from "lucide-react";
import type { PmMyTask } from "../../types/pm";
import { formatDeadline } from "../../utils/pmDateFormat";
import { PriorityTriangle } from "./PriorityTriangle";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import type { TaskContextAction } from "./TaskCard";

interface MeTaskCardProps {
  task: PmMyTask;
  isHighlighted?: boolean;
  onClick?: () => void;
  // Multi-select (optional)
  isSelected?: boolean;
  selectionActive?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onContextAction?: (action: TaskContextAction, taskId: string) => void;
}

export function MeTaskCard({
  task,
  isHighlighted,
  onClick,
  isSelected = false,
  selectionActive = false,
  onToggleSelect,
  onContextAction,
}: MeTaskCardProps) {
  const deadline = task.completed_at ? null : formatDeadline(task.deadline);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(task.id);
  };
  const handleCheckboxPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const cardBody = (
    <motion.div
      className="group relative rounded-lg p-3 mb-2 transition-colors duration-150 hover:translate-y-[-1px]"
      onClick={onClick}
      style={{
        backgroundColor: "var(--color-pm-bg-tertiary)",
        border: isSelected
          ? "1px solid #D66853"
          : isHighlighted
          ? "1px solid #D66853"
          : "1px solid var(--color-pm-border)",
        boxShadow: isSelected
          ? "0 0 0 2px #D66853, var(--pm-shadow-card)"
          : isHighlighted
          ? "0 0 0 3px rgba(214,104,83,0.2)"
          : "var(--pm-shadow-card)",
        userSelect: "none",
        cursor: "pointer",
      }}
      animate={
        isHighlighted && !isSelected
          ? { boxShadow: ["0 0 0 3px rgba(214,104,83,0.3)", "0 0 0 6px rgba(214,104,83,0.1)", "0 0 0 3px rgba(214,104,83,0.3)"] }
          : {}
      }
      transition={isHighlighted && !isSelected ? { duration: 0.6, repeat: 2, ease: "easeInOut" } : {}}
    >
      {/* Selection checkbox */}
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

      {/* Row 1: Priority + Title */}
      <div className="flex items-start gap-2 mb-2">
        <PriorityTriangle priority={task.priority} size={12} />
        <p
          className="flex-1 text-[13px] font-semibold leading-snug truncate"
          style={{ color: "var(--color-pm-text-primary)" }}
          title={task.title}
        >
          {task.title}
        </p>
      </div>

      {/* Row 2: Project name + assignee */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <p className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
          {task.project_name}
        </p>
        {task.assignee_name && (
          <span className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
            · → {task.assignee_name}
          </span>
        )}
      </div>

      {/* Row 3: Deadline */}
      {deadline && (
        <div className="flex items-center gap-1" title={deadline.tooltip}>
          <Calendar className="h-3 w-3" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
          <span className={`text-[11px] font-medium ${deadline.colorClass}`}>{deadline.text}</span>
        </div>
      )}
    </motion.div>
  );

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
