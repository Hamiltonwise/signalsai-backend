/**
 * Dream Team — Org Chart + Resume Drawer (WO16)
 *
 * Visual tree of every role in Alloro (human + AI).
 * Each node has a health dot. Click opens a resume drawer.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  X,
  ChevronRight,
  ChevronDown,
  Plus,
  Pause,
  Play,
  ExternalLink,
} from "lucide-react";
import {
  fetchDreamTeam,
  fetchDreamTeamNode,
  updateDreamTeamNode,
  addResumeNote,
  type DreamTeamNode,
  type ResumeEntry,
  type RecentOutput,
  type KpiRow,
} from "@/api/dream-team";

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
        <span className="shrink-0 text-[10px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">
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
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors px-1 py-1"
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

      {/* Reports — collapsible */}
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
                        <td className="px-4 py-3 text-gray-500">{kpi.target}</td>
                        <td className="px-4 py-3 text-gray-500">{kpi.current}</td>
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
                        — {entry.created_by}
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

export default function DreamTeam() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dream-team"],
    queryFn: fetchDreamTeam,
    retry: 1,
  });

  const nodes = data?.nodes || [];

  // Build tree: top-level humans, then departments under Dave
  const humans = nodes.filter((n: DreamTeamNode) => n.node_type === "human" && !n.parent_id);
  const dave = nodes.find((n: DreamTeamNode) => n.display_name === "Dave");

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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#212D40] flex items-center gap-3">
          <Users className="h-6 w-6 text-[#D56753]" />
          The Team
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Every role in Alloro. Green means autonomous. Red means attention needed.
        </p>
      </div>

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
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-1">
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
    </div>
  );
}
