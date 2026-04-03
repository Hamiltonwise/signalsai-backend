import { usePmStore } from "../../stores/pmStore";
import type { PmMyTask, PmMyTasksResponse } from "../../types/pm";
import { MeTaskCard } from "./MeTaskCard";

interface MeKanbanBoardProps {
  tasks: PmMyTasksResponse;
  onRefresh: () => void;
  highlightedTaskId?: string | null;
}

const COLUMNS: { key: keyof PmMyTasksResponse; label: string }[] = [
  { key: "todo", label: "TO DO" },
  { key: "in_progress", label: "IN PROGRESS" },
  { key: "done", label: "DONE" },
];

export function MeKanbanBoard({ tasks, onRefresh, highlightedTaskId }: MeKanbanBoardProps) {
  const moveTask = usePmStore((s) => s.moveTask);

  const handleMoveTask = async (task: PmMyTask, targetKey: keyof PmMyTasksResponse) => {
    const { todo_id, in_progress_id, done_id } = task.project_column_ids;
    const colMap: Record<keyof PmMyTasksResponse, string> = {
      todo: todo_id,
      in_progress: in_progress_id,
      done: done_id,
    };
    const targetColId = colMap[targetKey];
    if (!targetColId || task.column_id === targetColId) return;

    const targetTasks = tasks[targetKey];
    const position = targetTasks.length;

    await moveTask(task.id, targetColId, position);
    onRefresh();
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      {COLUMNS.map(({ key, label }) => (
        <div key={key}>
          {/* Column header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold tracking-wider" style={{ color: "var(--color-pm-text-muted)" }}>
              {label}
            </span>
            <span className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
              {tasks[key].length}
            </span>
          </div>

          {/* Column body */}
          <div
            className="min-h-[120px] rounded-xl p-2"
            style={{ backgroundColor: "var(--color-pm-bg-secondary)" }}
          >
            {tasks[key].length === 0 ? (
              <p className="text-center text-[11px] py-6" style={{ color: "var(--color-pm-text-muted)" }}>
                —
              </p>
            ) : (
              tasks[key].map((task) => (
                <div key={task.id} id={`me-task-${task.id}`} className="group/task relative">
                  <MeTaskCard task={task} isHighlighted={highlightedTaskId === task.id} />
                  {/* Move buttons — shown on hover */}
                  <div className="absolute top-2 right-2 hidden group-hover/task:flex gap-1">
                    {COLUMNS.filter((c) => c.key !== key).map(({ key: targetKey, label: targetLabel }) => (
                      <button
                        key={targetKey}
                        onClick={() => handleMoveTask(task, targetKey)}
                        className="rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors"
                        style={{
                          backgroundColor: "var(--color-pm-bg-hover)",
                          color: "var(--color-pm-text-muted)",
                          border: "1px solid var(--color-pm-border)",
                        }}
                        title={`Move to ${targetLabel}`}
                      >
                        → {targetLabel.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
