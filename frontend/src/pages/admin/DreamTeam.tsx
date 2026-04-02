/**
 * Dream Team, Org Chart + Resume Drawer (WO16)
 *
 * Visual tree of every role in Alloro (human + AI).
 * Each node has a health dot. Click opens a resume drawer.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  X,
  ChevronRight,
  ChevronDown,
  Plus,
  Pause,
  Play,
} from "lucide-react";
import {
  fetchDreamTeam,
  fetchDreamTeamNode,
  fetchDreamTeamTasks,
  createDreamTeamTask,
  updateDreamTeamTask,
  updateDreamTeamNode,
  addResumeNote,
  type DreamTeamNode,
  type ResumeEntry,
  type RecentOutput,
} from "@/api/dream-team";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ListTodo,
  Filter,
  Loader2 as Loader2Icon,
} from "lucide-react";

// ─── Health Dot ─────────────────────────────────────────────────────

const HEALTH_COLORS: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  gray: "bg-gray-300",
};

const HEALTH_LABELS: Record<string, string> = {
  green: "Running smoothly",
  yellow: "One issue flagged",
  red: "Not operational",
  gray: "Not yet configured",
};

function HealthDot({ status, size = "h-3 w-3" }: { status: string; size?: string }) {
  return (
    <span
      className={`inline-block rounded-full ${size} ${HEALTH_COLORS[status] || HEALTH_COLORS.gray}`}
      title={HEALTH_LABELS[status] || "Unknown"}
    />
  );
}

// ─── Tree Node Card ─────────────────────────────────────────────────

function NodeCard({
  node,
  isSelected,
  onClick,
}: {
  node: DreamTeamNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
        isSelected
          ? "border-[#D56753] bg-[#D56753]/5 shadow-md"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <HealthDot status={node.health_status} />
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#212D40] truncate" title={node.role_title}>
          {node.role_title}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {node.display_name || (node.node_type === "human" ? "Human" : "AI Agent")}
          {node.department && ` · ${node.department}`}
        </p>
      </div>
      {!node.is_active && (
        <span className="shrink-0 text-xs font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">
          PAUSED
        </span>
      )}
    </button>
  );
}

// ─── Department Branch ──────────────────────────────────────────────

function DepartmentBranch({
  department,
  nodes,
  allNodes,
  selectedId,
  onSelect,
}: {
  department: string;
  nodes: DreamTeamNode[];
  allNodes: DreamTeamNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Director = node whose parent is a human (Dave)
  const director = nodes.find((n) => {
    const parent = allNodes.find((p) => p.id === n.parent_id);
    return parent?.node_type === "human";
  });
  const reports = nodes.filter((n) => n.id !== director?.id);

  return (
    <div className="space-y-1">
      {/* Department header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors px-1 py-1"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {department}
      </button>

      {/* Director always visible */}
      {director && (
        <div className="ml-3 border-l-2 border-gray-200 pl-3">
          <NodeCard
            node={director}
            isSelected={selectedId === director.id}
            onClick={() => onSelect(director.id)}
          />
        </div>
      )}

      {/* Reports, collapsible */}
      {!collapsed && reports.length > 0 && (
        <div className="ml-8 border-l-2 border-gray-100 pl-3 space-y-1">
          {reports.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              isSelected={selectedId === node.id}
              onClick={() => onSelect(node.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Resume Drawer ──────────────────────────────────────────────────

function ResumeDrawer({
  nodeId,
  onClose,
}: {
  nodeId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dream-team-node", nodeId],
    queryFn: () => fetchDreamTeamNode(nodeId),
    enabled: !!nodeId,
  });

  const toggleActive = useMutation({
    mutationFn: (is_active: boolean) => updateDreamTeamNode(nodeId, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dream-team-node", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["dream-team"] });
    },
  });

  const addNote = useMutation({
    mutationFn: (summary: string) => addResumeNote(nodeId, summary),
    onSuccess: () => {
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["dream-team-node", nodeId] });
    },
  });

  const node = data?.node;
  const resumeEntries = data?.resumeEntries || [];
  const recentOutputs = data?.recentOutputs || [];
  const kpis = data?.kpis || [];

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl bg-white border-l border-gray-200 shadow-2xl overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {node && <HealthDot status={node.health_status} size="h-4 w-4" />}
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#212D40] truncate">
              {node?.role_title || "Loading..."}
            </h2>
            {node && (
              <p className="text-xs text-gray-400">
                {node.display_name || "AI Agent"}
                {node.department && ` · ${node.department}`}
                {" · "}
                {HEALTH_LABELS[node.health_status]}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="p-6 space-y-8">
          {/* Section 2: KPIs */}
          <div>
            <h3 className="text-sm font-bold text-[#212D40] mb-3">KPIs</h3>
            {kpis.length === 0 ? (
              <p className="text-sm text-gray-400">No KPI targets configured yet.</p>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-2.5">KPI</th>
                      <th className="px-4 py-2.5">Target</th>
                      <th className="px-4 py-2.5">Current</th>
                      <th className="px-4 py-2.5 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {kpis.map((kpi, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 text-[#212D40] font-medium">{kpi.name}</td>
                        <td className="px-4 py-3 text-gray-500">{kpi.target ?? "--"}</td>
                        <td className="px-4 py-3 text-gray-500">{kpi.current ?? "--"}</td>
                        <td className="px-4 py-3">
                          <HealthDot status={kpi.status} size="h-2.5 w-2.5" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 3: Resume */}
          <div>
            <h3 className="text-sm font-bold text-[#212D40] mb-3">Resume</h3>
            {resumeEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No history yet.</p>
            ) : (
              <div className="space-y-2">
                {resumeEntries.map((entry: ResumeEntry) => (
                  <div
                    key={entry.id}
                    className="flex gap-3 text-sm border-l-2 border-gray-200 pl-3 py-1"
                  >
                    <span className="text-xs text-gray-400 shrink-0 w-20">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-gray-600">{entry.summary}</span>
                    {entry.created_by && (
                      <span className="text-xs text-gray-300 shrink-0">
                       , {entry.created_by}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Recent Outputs */}
          {node?.node_type === "agent" && (
            <div>
              <h3 className="text-sm font-bold text-[#212D40] mb-3">Recent Outputs</h3>
              {recentOutputs.length === 0 ? (
                <p className="text-sm text-gray-400">No outputs yet. First results appear after next run.</p>
              ) : (
                <div className="space-y-2">
                  {recentOutputs.map((output: RecentOutput) => (
                    <div
                      key={output.id}
                      className="flex items-start gap-3 rounded-lg border border-gray-200 p-3"
                    >
                      <HealthDot
                        status={output.status === "success" ? "green" : output.status === "error" ? "red" : "yellow"}
                        size="h-2.5 w-2.5 mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-600 truncate">{output.summary}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(output.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 4b: Tasks */}
          <NodeTaskList nodeId={nodeId} nodeName={node?.display_name || node?.role_title || ""} />

          {/* Section 5: Edit Controls */}
          <div className="border-t border-gray-200 pt-6 space-y-4">
            <h3 className="text-sm font-bold text-[#212D40]">Actions</h3>

            {/* Add note */}
            <div className="flex gap-2">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note to the resume..."
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-1 focus:ring-[#D56753]/20"
              />
              <button
                onClick={() => noteText.trim() && addNote.mutate(noteText.trim())}
                disabled={!noteText.trim() || addNote.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-[#212D40] text-white px-3 py-2 text-sm font-medium hover:bg-[#212D40]/90 disabled:opacity-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>

            {/* Pause/Resume agent */}
            {node?.node_type === "agent" && (
              <button
                onClick={() => toggleActive.mutate(!node.is_active)}
                disabled={toggleActive.isPending}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  node.is_active
                    ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                    : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                {node.is_active ? (
                  <>
                    <Pause className="h-4 w-4" /> Pause Agent
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Resume Agent
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

// ─── Node Task List (in drawer) ─────────────────────────────────────

const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <Circle className="h-3.5 w-3.5 text-gray-400" />,
  in_progress: <Clock className="h-3.5 w-3.5 text-blue-500" />,
  done: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
};

const PRIORITY_BADGES: Record<string, string> = {
  urgent: "bg-red-50 text-red-600",
  high: "bg-amber-50 text-amber-600",
  normal: "bg-gray-50 text-gray-500",
  low: "bg-gray-50 text-gray-400",
};

function NodeTaskList({ nodeId, nodeName: _nodeName }: { nodeId: string; nodeName: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newOwner, setNewOwner] = useState("Corey");
  const [newDue, setNewDue] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dream-team-tasks", nodeId],
    queryFn: () => fetchDreamTeamTasks({ node_id: nodeId }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createDreamTeamTask({
        node_id: nodeId,
        title: newTitle.trim(),
        owner_name: newOwner,
        due_date: newDue || undefined,
      }),
    onSuccess: () => {
      setNewTitle("");
      setNewDue("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["dream-team-tasks"] });
    },
    onError: () => {
      toast.error("Couldn't save. Try again.");
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      const next = status === "done" ? "open" : status === "open" ? "in_progress" : "done";
      return updateDreamTeamTask(id, { status: next as any });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dream-team-tasks"] }),
    onError: () => {
      toast.error("Couldn't save. Try again.");
    },
  });

  const tasks = data?.tasks || [];
  const openTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#212D40]">
          Tasks {openTasks.length > 0 && <span className="text-[#D56753]">({openTasks.length})</span>}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-xs font-medium text-[#D56753] hover:text-[#D56753]/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Add task
        </button>
      </div>

      {/* Add task form */}
      {showForm && (
        <div className="mb-4 rounded-lg border border-[#D56753]/20 bg-[#D56753]/[0.02] p-3 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D56753]"
            autoFocus
          />
          <div className="flex gap-2">
            <select
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            >
              <option value="Corey">Corey</option>
              <option value="Jo">Jo</option>
              <option value="Dave">Dave</option>
              <option value="System">System</option>
            </select>
            <input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
            <button
              onClick={() => newTitle.trim() && createMut.mutate()}
              disabled={!newTitle.trim() || createMut.isPending}
              className="ml-auto rounded-lg bg-[#D56753] text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      {isLoading ? (
        <div className="text-xs text-gray-400">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-gray-400">No tasks assigned to this node.</p>
      ) : (
        <div className="space-y-1.5">
          {[...openTasks, ...doneTasks].map((task) => {
            const isOverdue =
              task.status !== "done" &&
              task.due_date &&
              task.due_date < new Date().toISOString().slice(0, 10);

            return (
              <div
                key={task.id}
                className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                  task.status === "done" ? "opacity-50" : ""
                } ${isOverdue ? "bg-red-50/50" : "hover:bg-gray-50"}`}
              >
                <button
                  onClick={() => toggleMut.mutate({ id: task.id, status: task.status })}
                  className="mt-0.5 shrink-0"
                  title={`Status: ${task.status}`}
                >
                  {TASK_STATUS_ICONS[task.status] || TASK_STATUS_ICONS.open}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-[#212D40] ${task.status === "done" ? "line-through" : ""}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-medium text-gray-400">
                      {task.owner_name}
                    </span>
                    {task.due_date && (
                      <span className={`text-xs font-medium ${isOverdue ? "text-red-500" : "text-gray-400"}`}>
                        {isOverdue ? "overdue" : task.due_date}
                      </span>
                    )}
                    {task.priority !== "normal" && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[task.priority] || ""}`}>
                        {task.priority}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Jo's Task Health Tab ───────────────────────────────────────────

function TaskHealthTab() {
  const queryClient = useQueryClient();
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["dream-team-tasks", "all", ownerFilter, statusFilter],
    queryFn: () =>
      fetchDreamTeamTasks({
        owner: ownerFilter || undefined,
        status: statusFilter || undefined,
      }),
    refetchInterval: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      const next = status === "done" ? "open" : status === "open" ? "in_progress" : "done";
      return updateDreamTeamTask(id, { status: next as any });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dream-team-tasks"] }),
    onError: () => {
      toast.error("Couldn't save. Try again.");
    },
  });

  const tasks = data?.tasks || [];
  const stats = data?.stats || { open: 0, in_progress: 0, done: 0, overdue: 0, total: 0 };

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Open", value: stats.open, color: "text-gray-700" },
          { label: "In Progress", value: stats.in_progress, color: "text-blue-600" },
          { label: "Done", value: stats.done, color: "text-emerald-600" },
          { label: "Overdue", value: stats.overdue, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        >
          <option value="">All owners</option>
          <option value="Corey">Corey</option>
          <option value="Jo">Jo</option>
          <option value="Dave">Dave</option>
          <option value="System">System</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2Icon className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-400">
          {statusFilter || ownerFilter
            ? "No tasks match these filters."
            : "No tasks yet. Tasks appear from Fireflies meetings or manual creation."}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 font-medium text-gray-500">Task</th>
                <th className="px-4 py-3 font-medium text-gray-500">Owner</th>
                <th className="px-4 py-3 font-medium text-gray-500">Priority</th>
                <th className="px-4 py-3 font-medium text-gray-500">Due</th>
                <th className="px-4 py-3 font-medium text-gray-500">Source</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const isOverdue =
                  task.status !== "done" &&
                  task.due_date &&
                  task.due_date < new Date().toISOString().slice(0, 10);

                return (
                  <tr
                    key={task.id}
                    className={`border-t border-gray-100 ${isOverdue ? "bg-red-50/30" : ""} ${task.status === "done" ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <button onClick={() => toggleMut.mutate({ id: task.id, status: task.status })}>
                        {TASK_STATUS_ICONS[task.status] || TASK_STATUS_ICONS.open}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`font-medium text-[#212D40] ${task.status === "done" ? "line-through" : ""}`}>
                        {task.title}
                      </p>
                      {task.source_meeting_title && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[300px]">
                          From: {task.source_meeting_title}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-[#212D40] bg-gray-100 px-2 py-1 rounded">
                        {task.owner_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {task.priority !== "normal" && (
                        <span className={`text-xs font-bold px-2 py-1 rounded ${PRIORITY_BADGES[task.priority] || ""}`}>
                          {task.priority}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {task.due_date ? (
                        <span className={`text-xs ${isOverdue ? "font-bold text-red-600" : "text-gray-500"}`}>
                          {isOverdue && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                          {task.due_date}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400">{task.source_type}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function DreamTeam() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chart" | "tasks">("chart");

  const { data, isLoading } = useQuery({
    queryKey: ["dream-team"],
    queryFn: fetchDreamTeam,
    retry: 1,
  });

  const nodes = data?.nodes || [];

  // Build tree: top-level humans, then departments under Dave
  const humans = nodes.filter((n: DreamTeamNode) => n.node_type === "human" && !n.parent_id);

  // Group agents by department
  const departments = new Map<string, DreamTeamNode[]>();
  nodes
    .filter((n: DreamTeamNode) => n.node_type === "agent" && n.department)
    .forEach((n: DreamTeamNode) => {
      const dept = n.department!;
      if (!departments.has(dept)) departments.set(dept, []);
      departments.get(dept)!.push(n);
    });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header + Tab Toggle */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#212D40] flex items-center gap-3">
            <Users className="h-6 w-6 text-[#D56753]" />
            The Team
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeTab === "chart"
              ? "Every role in Alloro. Green means autonomous. Red means attention needed."
              : "All tasks across the org. Filter by owner or status."}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 shrink-0">
          <button
            onClick={() => setActiveTab("chart")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "chart"
                ? "bg-white text-[#212D40] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Org Chart
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "tasks"
                ? "bg-[#D56753] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <ListTodo className="h-3.5 w-3.5" />
            Task Health
          </button>
        </div>
      </div>

      {/* Task Health Tab */}
      {activeTab === "tasks" && <TaskHealthTab />}

      {/* Org Chart Tab */}
      {activeTab === "chart" && (<>


      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && nodes.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-16 text-center text-gray-400">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">No team members yet.</p>
          <p className="text-sm mt-1">Run the Dream Team migration to seed the org chart.</p>
        </div>
      )}

      {/* Tree */}
      {!isLoading && nodes.length > 0 && (
        <div className="space-y-6">
          {/* Leadership row */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 px-1">
              Leadership
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {humans.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isSelected={selectedId === node.id}
                  onClick={() => setSelectedId(node.id)}
                />
              ))}
            </div>
          </div>

          {/* Department branches */}
          {Array.from(departments.entries()).map(([dept, deptNodes]) => (
            <DepartmentBranch
              key={dept}
              department={dept}
              nodes={deptNodes}
              allNodes={nodes}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      )}

      {/* Resume Drawer */}
      <AnimatePresence>
        {selectedId && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="fixed inset-0 z-40 bg-black/20"
            />
            <ResumeDrawer
              nodeId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          </>
        )}
      </AnimatePresence>
      </>)}
    </div>
  );
}
