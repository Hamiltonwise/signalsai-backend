import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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

// ── Droppable column ──────────────────────────────────────────────────────────
function DroppableColumn({
  columnKey,
  label,
  tasks,
  highlightedTaskId,
  isDraggingOver,
}: {
  columnKey: keyof PmMyTasksResponse;
  label: string;
  tasks: PmMyTask[];
  highlightedTaskId?: string | null;
  isDraggingOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: columnKey });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-wider" style={{ color: "var(--color-pm-text-muted)" }}>
          {label}
        </span>
        <span className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className="min-h-[120px] rounded-xl p-2 transition-colors duration-150"
        style={{
          backgroundColor: isDraggingOver
            ? "var(--color-pm-bg-hover)"
            : "var(--color-pm-bg-secondary)",
        }}
      >
        {tasks.length === 0 ? (
          <p className="text-center text-[11px] py-6" style={{ color: "var(--color-pm-text-muted)" }}>
            —
          </p>
        ) : (
          tasks.map((task) => (
            <DraggableCard
              key={task.id}
              task={task}
              isHighlighted={highlightedTaskId === task.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Draggable card ────────────────────────────────────────────────────────────
function DraggableCard({
  task,
  isHighlighted,
}: {
  task: PmMyTask;
  isHighlighted: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      id={`me-task-${task.id}`}
      style={style}
      {...listeners}
      {...attributes}
    >
      <MeTaskCard task={task} isHighlighted={isHighlighted} />
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────
export function MeKanbanBoard({ tasks, onRefresh, highlightedTaskId }: MeKanbanBoardProps) {
  const moveTask = usePmStore((s) => s.moveTask);
  const [activeTask, setActiveTask] = useState<PmMyTask | null>(null);
  const [overColumn, setOverColumn] = useState<keyof PmMyTasksResponse | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(event.active.data.current?.task as PmMyTask);
  };

  const handleDragOver = (event: { over: { id: unknown } | null }) => {
    const overId = event.over?.id as keyof PmMyTasksResponse | null;
    setOverColumn(overId && COLUMNS.some((c) => c.key === overId) ? overId : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const task = event.active.data.current?.task as PmMyTask | undefined;
    const targetKey = event.over?.id as keyof PmMyTasksResponse | undefined;

    setActiveTask(null);
    setOverColumn(null);

    if (!task || !targetKey) return;
    if (!COLUMNS.some((c) => c.key === targetKey)) return;

    const { todo_id, in_progress_id, done_id } = task.project_column_ids;
    const colMap: Record<keyof PmMyTasksResponse, string> = {
      todo: todo_id,
      in_progress: in_progress_id,
      done: done_id,
    };
    const targetColId = colMap[targetKey];
    if (!targetColId || task.column_id === targetColId) return;

    const position = tasks[targetKey].length;
    await moveTask(task.id, targetColId, position);
    onRefresh();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map(({ key, label }) => (
          <DroppableColumn
            key={key}
            columnKey={key}
            label={label}
            tasks={tasks[key]}
            highlightedTaskId={highlightedTaskId}
            isDraggingOver={overColumn === key}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <div style={{ opacity: 0.9, cursor: "grabbing" }}>
            <MeTaskCard task={activeTask} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
