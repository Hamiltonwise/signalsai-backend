import { create } from "zustand";
import type {
  PmProject,
  PmProjectDetail,
  PmTask,

  CreateProjectInput,
  CreateTaskInput,
} from "../types/pm";
import * as pmApi from "../api/pm";

interface PmState {
  projects: PmProject[];
  activeProject: PmProjectDetail | null;
  isLoading: boolean;

  // Project actions
  fetchProjects: (status?: string) => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (data: CreateProjectInput) => Promise<PmProject>;
  updateProject: (id: string, data: Partial<PmProject>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;

  // Task actions
  createTask: (projectId: string, data: CreateTaskInput) => Promise<void>;
  updateTask: (taskId: string, data: Partial<PmTask>) => Promise<void>;
  moveTask: (taskId: string, columnId: string, position: number) => Promise<void>;
  assignTask: (taskId: string, userId: number | null) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  // Optimistic helpers
  optimisticMoveTask: (
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
    position: number
  ) => PmProjectDetail | null;
}

export const usePmStore = create<PmState>((set, get) => ({
  projects: [],
  activeProject: null,
  isLoading: false,

  fetchProjects: async (status = "active") => {
    set({ isLoading: true });
    try {
      const projects = await pmApi.fetchProjects(status);
      set({ projects, isLoading: false });
    } catch (err) {
      console.error("[PM] fetchProjects failed:", err);
      set({ projects: [], isLoading: false });
    }
  },

  fetchProject: async (id: string) => {
    set({ isLoading: true });
    try {
      const project = await pmApi.fetchProject(id);
      set({ activeProject: project, isLoading: false });
    } catch (err) {
      console.error("[PM] fetchProject failed:", err);
      set({ isLoading: false });
    }
  },

  createProject: async (data: CreateProjectInput) => {
    const project = await pmApi.createProject(data);
    // Re-fetch to get computed fields (total_tasks, effective_deadline, etc.)
    get().fetchProjects();
    return project;
  },

  updateProject: async (id: string, data: Partial<PmProject>) => {
    const updated = await pmApi.updateProject(id, data);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updated } : p)),
      activeProject:
        state.activeProject?.id === id
          ? { ...state.activeProject, ...updated }
          : state.activeProject,
    }));
  },

  deleteProject: async (id: string) => {
    await pmApi.deleteProject(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProject: state.activeProject?.id === id ? null : state.activeProject,
    }));
  },

  archiveProject: async (id: string) => {
    const updated = await pmApi.archiveProject(id);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updated } : p)),
    }));
  },

  createTask: async (projectId: string, data: CreateTaskInput) => {
    const task = await pmApi.createTask(projectId, data);
    set((state) => {
      if (!state.activeProject || state.activeProject.id !== projectId) return state;
      const columns = state.activeProject.columns.map((col) => {
        if (col.id !== data.column_id) return col;
        // Insert at position 0, shift others
        const shifted = col.tasks.map((t) => ({ ...t, position: t.position + 1 }));
        return { ...col, tasks: [task, ...shifted] };
      });
      return { activeProject: { ...state.activeProject, columns } };
    });
  },

  updateTask: async (taskId: string, data: Partial<PmTask>) => {
    const updated = await pmApi.updateTask(taskId, data);
    set((state) => {
      if (!state.activeProject) return state;
      const columns = state.activeProject.columns.map((col) => ({
        ...col,
        tasks: col.tasks.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
      }));
      return { activeProject: { ...state.activeProject, columns } };
    });
  },

  moveTask: async (taskId: string, columnId: string, position: number) => {
    // Save snapshot for rollback
    const snapshot = get().activeProject;

    // Optimistic update
    const task = snapshot?.columns
      .flatMap((c) => c.tasks)
      .find((t) => t.id === taskId);
    if (task) {
      get().optimisticMoveTask(taskId, task.column_id, columnId, position);
    }

    try {
      await pmApi.moveTask(taskId, columnId, position);
      // Re-fetch only if moving to/from Backlog (priority changes server-side)
      const fromBacklog = snapshot?.columns.find((c) =>
        c.tasks.some((t) => t.id === taskId)
      )?.name === "Backlog";
      const toBacklog = snapshot?.columns.find((c) => c.id === columnId)?.name === "Backlog";
      if ((fromBacklog || toBacklog) && snapshot?.id) {
        const fresh = await pmApi.fetchProject(snapshot.id);
        set({ activeProject: fresh });
      }
    } catch {
      set({ activeProject: snapshot });
    }
  },

  assignTask: async (taskId: string, userId: number | null) => {
    const updated = await pmApi.assignTask(taskId, userId);
    set((state) => {
      if (!state.activeProject) return state;
      const columns = state.activeProject.columns.map((col) => ({
        ...col,
        tasks: col.tasks.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
      }));
      return { activeProject: { ...state.activeProject, columns } };
    });
  },

  deleteTask: async (taskId: string) => {
    await pmApi.deleteTask(taskId);
    set((state) => {
      if (!state.activeProject) return state;
      const columns = state.activeProject.columns.map((col) => ({
        ...col,
        tasks: col.tasks
          .filter((t) => t.id !== taskId)
          .map((t, i) => ({ ...t, position: i })),
      }));
      return { activeProject: { ...state.activeProject, columns } };
    });
  },

  optimisticMoveTask: (
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
    targetPosition: number
  ) => {
    const state = get();
    if (!state.activeProject) return null;

    const columns = state.activeProject.columns.map((col) => {
      if (col.id === fromColumnId && fromColumnId === toColumnId) {
        // Same column reorder
        const task = col.tasks.find((t) => t.id === taskId);
        if (!task) return col;
        const filtered = col.tasks.filter((t) => t.id !== taskId);
        filtered.splice(targetPosition, 0, {
          ...task,
          position: targetPosition,
          column_id: toColumnId,
        });
        return {
          ...col,
          tasks: filtered.map((t, i) => ({ ...t, position: i })),
        };
      }

      if (col.id === fromColumnId) {
        // Remove from source
        return {
          ...col,
          tasks: col.tasks
            .filter((t) => t.id !== taskId)
            .map((t, i) => ({ ...t, position: i })),
        };
      }

      if (col.id === toColumnId) {
        // Add to target
        const task = state.activeProject!.columns
          .flatMap((c) => c.tasks)
          .find((t) => t.id === taskId);
        if (!task) return col;

        const tasks = [...col.tasks];
        tasks.splice(targetPosition, 0, {
          ...task,
          column_id: toColumnId,
          position: targetPosition,
          completed_at: col.name === "Done" ? new Date().toISOString() : null,
        });
        return {
          ...col,
          tasks: tasks.map((t, i) => ({ ...t, position: i })),
        };
      }

      return col;
    });

    const updated = { ...state.activeProject, columns };
    set({ activeProject: updated });
    return updated;
  },
}));
