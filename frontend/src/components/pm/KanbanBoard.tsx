import { useState, useRef, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { PmProjectDetail, PmTask } from "../../types/pm";
import { usePmStore } from "../../stores/pmStore";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import type { TaskContextAction } from "./TaskCard";
import { showWarningToast } from "../../lib/toast";

interface KanbanBoardProps {
  project: PmProjectDetail;
  onTaskClick: (task: PmTask) => void;
  onDeleteTask?: (taskId: string) => void;
  showBacklog?: boolean;
  // Multi-select pass-through
  selectedTaskIds?: Set<string>;
  selectionActive?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onContextAction?: (action: TaskContextAction, taskId: string) => void;
}

export function KanbanBoard({
  project,
  onTaskClick,
  onDeleteTask,
  showBacklog = true,
  selectedTaskIds,
  selectionActive = false,
  onToggleSelect,
  onContextAction,
}: KanbanBoardProps) {
  const moveTask = usePmStore((s) => s.moveTask);
  const moveTaskOptimistic = usePmStore((s) => s.optimisticMoveTask);
  const [activeTask, setActiveTask] = useState<PmTask | null>(null);
  const preDragSnapshot = useRef<PmProjectDetail | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const columns = showBacklog
    ? project.columns
    : project.columns.filter((c) => !c.is_backlog);

  const columnIds = new Set(columns.map((c) => c.id));

  // Custom collision detection: prioritize column containers over individual cards.
  // First check which column the pointer is within, then find the closest card inside it.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // Check pointer-within for column droppables only
      const columnEntries = args.droppableContainers.filter((c) =>
        columnIds.has(c.id as string)
      );
      const pointerHits = pointerWithin({
        ...args,
        droppableContainers: columnEntries,
      });
      if (pointerHits.length > 0) {
        const targetColId = pointerHits[0].id;
        // Now find the closest card within that column, or the column itself
        const cardsInCol = args.droppableContainers.filter(
          (c) => !columnIds.has(c.id as string)
        );
        const currentProject = usePmStore.getState().activeProject;
        const col = currentProject?.columns.find((c) => c.id === targetColId);
        const cardIdsInCol = new Set(col?.tasks.map((t) => t.id) ?? []);
        const colCards = cardsInCol.filter((c) => cardIdsInCol.has(c.id as string));

        if (colCards.length > 0) {
          const cardHits = rectIntersection({ ...args, droppableContainers: colCards });
          if (cardHits.length > 0) return cardHits;
        }
        return pointerHits;
      }
      // Fallback to rect intersection across everything
      return rectIntersection(args);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnIds.size, showBacklog]
  );

  const handleDragStart = (event: DragStartEvent) => {
    // Save pre-drag state for rollback
    preDragSnapshot.current = usePmStore.getState().activeProject;
    const task = project.columns
      .flatMap((c) => c.tasks)
      .find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const currentProject = usePmStore.getState().activeProject;
    if (!currentProject) return;

    const visibleCols = showBacklog
      ? currentProject.columns
      : currentProject.columns.filter((c) => !c.is_backlog);

    // Find which column the dragged task currently lives in
    const sourceCol = visibleCols.find((c) =>
      c.tasks.some((t) => t.id === taskId)
    );
    if (!sourceCol) return;

    // Determine the target column
    let targetCol = visibleCols.find((c) => c.id === over.id);
    if (!targetCol) {
      const overTask = visibleCols
        .flatMap((c) => c.tasks)
        .find((t) => t.id === over.id);
      if (!overTask) return;
      targetCol = visibleCols.find((c) => c.id === overTask.column_id);
    }
    if (!targetCol || targetCol.id === sourceCol.id) return;

    // Optimistically move the task into the target column during drag
    const overTask = targetCol.tasks.find((t) => t.id === over.id);
    const targetPosition = overTask ? overTask.position : targetCol.tasks.length;

    moveTaskOptimistic(taskId, sourceCol.id, targetCol.id, targetPosition);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) {
      // Drag cancelled — rollback optimistic changes
      if (preDragSnapshot.current) {
        usePmStore.setState({ activeProject: preDragSnapshot.current });
      }
      preDragSnapshot.current = null;
      return;
    }

    const taskId = active.id as string;

    // Read the task's current state (may have been updated by handleDragOver for cross-column)
    const currentProject = usePmStore.getState().activeProject;
    if (!currentProject) return;

    const currentCol = currentProject.columns.find((c) =>
      c.tasks.some((t) => t.id === taskId)
    );
    if (!currentCol) return;

    const task = currentCol.tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Determine the original column from the pre-drag snapshot
    const originalCol = preDragSnapshot.current?.columns.find((c) =>
      c.tasks.some((t) => t.id === taskId)
    );
    const wasCrossColumn = originalCol && originalCol.id !== currentCol.id;

    let targetColumnId = currentCol.id;
    let targetPosition = task.position;

    const overColumn = currentProject.columns.find((c) => c.id === over.id);
    if (overColumn) {
      targetColumnId = overColumn.id;
      targetPosition = overColumn.tasks.length;
    } else {
      const overTask = currentProject.columns
        .flatMap((c) => c.tasks)
        .find((t) => t.id === over.id);
      if (overTask && overTask.id !== taskId) {
        targetColumnId = overTask.column_id;
        targetPosition = overTask.position;
      }
    }

    // Skip if nothing changed
    if (targetColumnId === originalCol?.id && targetPosition === (originalCol?.tasks.find((t) => t.id === taskId)?.position ?? -1)) {
      preDragSnapshot.current = null;
      return;
    }

    // Assignment catch: block Backlog → non-Backlog if no assignee
    if (originalCol?.is_backlog) {
      const targetColObj = currentProject.columns.find((c) => c.id === targetColumnId);
      const originalTask = preDragSnapshot.current?.columns
        .flatMap((c) => c.tasks)
        .find((t) => t.id === taskId);
      if (!targetColObj?.is_backlog && !originalTask?.assigned_to) {
        usePmStore.setState({ activeProject: preDragSnapshot.current });
        preDragSnapshot.current = null;
        showWarningToast("Assign someone first", "Assign someone to this task before moving it out of Backlog");
        return;
      }
    }

    // Cross-column: handleDragOver already did the optimistic update, pass snapshot for rollback.
    // Same-column: let the store do its own optimistic update (no snapshot).
    if (wasCrossColumn) {
      moveTask(taskId, targetColumnId, targetPosition, preDragSnapshot.current);
    } else {
      moveTask(taskId, targetColumnId, targetPosition);
    }
    preDragSnapshot.current = null;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
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
            selectedTaskIds={selectedTaskIds}
            selectionActive={selectionActive}
            onToggleSelect={onToggleSelect}
            onContextAction={onContextAction}
            siblingColumns={columns}
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
