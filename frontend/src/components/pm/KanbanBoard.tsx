import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { PmProjectDetail, PmTask } from "../../types/pm";
import { usePmStore } from "../../stores/pmStore";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

interface KanbanBoardProps {
  project: PmProjectDetail;
  onTaskClick: (task: PmTask) => void;
  onDeleteTask?: (taskId: string) => void;
  showBacklog?: boolean;
}

export function KanbanBoard({
  project,
  onTaskClick,
  onDeleteTask,
  showBacklog = true,
}: KanbanBoardProps) {
  const moveTask = usePmStore((s) => s.moveTask);
  const [activeTask, setActiveTask] = useState<PmTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const columns = showBacklog
    ? project.columns
    : project.columns.filter((c) => c.name !== "Backlog");

  const handleDragStart = (event: DragStartEvent) => {
    const task = project.columns
      .flatMap((c) => c.tasks)
      .find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = (_event: DragOverEvent) => {};

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;

    let targetColumnId: string;
    let targetPosition: number;

    const overColumn = columns.find((c) => c.id === over.id);
    if (overColumn) {
      targetColumnId = overColumn.id;
      targetPosition = overColumn.tasks.length;
    } else {
      const overTask = columns.flatMap((c) => c.tasks).find((t) => t.id === over.id);
      if (!overTask) return;
      targetColumnId = overTask.column_id;
      targetPosition = overTask.position;
    }

    const sourceTask = columns.flatMap((c) => c.tasks).find((t) => t.id === taskId);
    if (
      sourceTask &&
      sourceTask.column_id === targetColumnId &&
      sourceTask.position === targetPosition
    ) {
      return;
    }

    moveTask(taskId, targetColumnId, targetPosition);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 h-full overflow-x-auto pb-4 px-1">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            projectId={project.id}
            onTaskClick={onTaskClick}
            onDeleteTask={onDeleteTask}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-[2deg]">
            <TaskCard task={activeTask} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
