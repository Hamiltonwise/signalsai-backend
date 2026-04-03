import { Calendar } from "lucide-react";
import type { PmMyTask } from "../../types/pm";
import { formatDeadline } from "../../utils/pmDateFormat";
import { PriorityTriangle } from "./PriorityTriangle";

interface MeTaskCardProps {
  task: PmMyTask;
}

export function MeTaskCard({ task }: MeTaskCardProps) {
  const deadline = task.completed_at ? null : formatDeadline(task.deadline);

  return (
    <div
      className="rounded-lg p-3 mb-2 transition-all duration-150 hover:translate-y-[-1px]"
      style={{
        backgroundColor: "var(--color-pm-bg-tertiary)",
        border: "1px solid var(--color-pm-border)",
        boxShadow: "var(--pm-shadow-card)",
      }}
    >
      {/* Row 1: Priority + Title */}
      <div className="flex items-start gap-2 mb-2">
        <PriorityTriangle priority={task.priority} size={12} />
        <p
          className="flex-1 text-[13px] font-semibold leading-snug"
          style={{ color: "var(--color-pm-text-primary)" }}
        >
          {task.title}
        </p>
      </div>

      {/* Row 2: Project name */}
      <p className="text-[11px] mb-1.5" style={{ color: "var(--color-pm-text-muted)" }}>
        {task.project_name}
      </p>

      {/* Row 3: Deadline */}
      {deadline && (
        <div className="flex items-center gap-1" title={deadline.tooltip}>
          <Calendar className="h-3 w-3" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
          <span className={`text-[11px] font-medium ${deadline.colorClass}`}>{deadline.text}</span>
        </div>
      )}
    </div>
  );
}
