/**
 * Canon Tab -- Agent governance view for the Dream Team board
 *
 * Grid of agent cards grouped by agent_group.
 * Each card: name, verdict badge, expiry countdown, gold question progress.
 * Click to expand: spec editor, gold questions, verdict controls.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  Save,
  AlertTriangle,
  Plus,
  Trash2,
} from "lucide-react";
import {
  fetchCanonAgents,
  updateCanonSpec,
  setGoldQuestions,
  recordQuestionResult,
  setVerdict,
  type CanonAgent,
  type GoldQuestion,
  type CanonSpec,
} from "@/api/agent-canon";

// ── Verdict Badge ──────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: string }) {
  if (verdict === "PASS") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <ShieldCheck className="h-3 w-3" />
        PASS
      </span>
    );
  }
  if (verdict === "FAIL") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
        <ShieldAlert className="h-3 w-3" />
        FAIL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
      <ShieldQuestion className="h-3 w-3" />
      PENDING
    </span>
  );
}

// ── Expiry Countdown ───────────────────────────────────────────────

function ExpiryCountdown({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;

  const now = new Date();
  const expires = new Date(expiresAt);
  const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return <span className="text-xs text-red-500 font-medium">Expired</span>;
  }
  if (daysLeft <= 14) {
    return <span className="text-xs text-amber-500 font-medium">{daysLeft}d left</span>;
  }
  return <span className="text-xs text-gray-400">{daysLeft}d left</span>;
}

// ── Gold Question Progress ─────────────────────────────────────────

function QuestionProgress({ questions }: { questions: GoldQuestion[] }) {
  if (questions.length === 0) {
    return <span className="text-xs text-gray-400">No questions</span>;
  }

  const passed = questions.filter((q) => q.passed === true).length;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {questions.map((q, i) => (
          <div
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${
              q.passed === true
                ? "bg-emerald-500"
                : q.passed === false
                  ? "bg-red-500"
                  : "bg-gray-300"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-gray-500">
        {passed}/{questions.length}
      </span>
    </div>
  );
}

// ── Agent Card ─────────────────────────────────────────────────────

function AgentCard({
  agent,
  isExpanded,
  onToggle,
}: {
  agent: CanonAgent;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
        isExpanded
          ? "border-[#D56753] bg-[#D56753]/5 shadow-md"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <VerdictBadge verdict={agent.gate_verdict} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1A1D23] truncate">
              {agent.display_name}
            </p>
            <p className="text-xs text-gray-400 truncate">{agent.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <QuestionProgress questions={agent.gold_questions} />
          <ExpiryCountdown expiresAt={agent.gate_expires} />
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>
    </button>
  );
}

// ── Spec Editor ────────────────────────────────────────────────────

function SpecEditor({ agent }: { agent: CanonAgent }) {
  const queryClient = useQueryClient();
  const [spec, setSpec] = useState<CanonSpec>({
    purpose: agent.canon_spec?.purpose || "",
    expectedBehavior: agent.canon_spec?.expectedBehavior || "",
    constraints: agent.canon_spec?.constraints || [],
    owner: agent.canon_spec?.owner || "",
  });
  const [newConstraint, setNewConstraint] = useState("");

  const saveMut = useMutation({
    mutationFn: () => updateCanonSpec(agent.slug, spec),
    onSuccess: () => {
      toast.success("Spec saved. Gate reset to PENDING.");
      queryClient.invalidateQueries({ queryKey: ["canon-agents"] });
    },
    onError: () => toast.error("Failed to save spec"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold text-[#1A1D23]">Spec</h4>
        <div className="flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span className="text-xs text-amber-600">Saving resets gate to PENDING</span>
        </div>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Purpose</label>
          <textarea
            value={spec.purpose}
            onChange={(e) => setSpec({ ...spec, purpose: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1D23] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-1 focus:ring-[#D56753]/20"
            placeholder="What does this agent do?"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Expected Behavior</label>
          <textarea
            value={spec.expectedBehavior}
            onChange={(e) => setSpec({ ...spec, expectedBehavior: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1D23] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-1 focus:ring-[#D56753]/20"
            placeholder="What should it produce when working correctly?"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
          <input
            type="text"
            value={spec.owner}
            onChange={(e) => setSpec({ ...spec, owner: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1D23] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-1 focus:ring-[#D56753]/20"
            placeholder="Who owns this agent?"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Constraints</label>
          <div className="space-y-1.5">
            {spec.constraints.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-[#1A1D23] bg-gray-50 rounded-lg px-3 py-1.5">{c}</span>
                <button
                  onClick={() =>
                    setSpec({ ...spec, constraints: spec.constraints.filter((_, j) => j !== i) })
                  }
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                type="text"
                value={newConstraint}
                onChange={(e) => setNewConstraint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newConstraint.trim()) {
                    setSpec({ ...spec, constraints: [...spec.constraints, newConstraint.trim()] });
                    setNewConstraint("");
                  }
                }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#D56753]"
                placeholder="Add constraint..."
              />
              <button
                onClick={() => {
                  if (newConstraint.trim()) {
                    setSpec({ ...spec, constraints: [...spec.constraints, newConstraint.trim()] });
                    setNewConstraint("");
                  }
                }}
                className="p-1.5 text-[#D56753] hover:bg-[#D56753]/10 rounded-lg"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => saveMut.mutate()}
        disabled={saveMut.isPending}
        className="flex items-center gap-1.5 rounded-lg bg-[#1A1D23] text-white px-4 py-2 text-sm font-medium hover:bg-[#1A1D23]/90 disabled:opacity-50 transition-colors"
      >
        <Save className="h-3.5 w-3.5" />
        {saveMut.isPending ? "Saving..." : "Save Spec"}
      </button>
    </div>
  );
}

// ── Gold Questions Editor ──────────────────────────────────────────

function GoldQuestionsEditor({ agent }: { agent: CanonAgent }) {
  const queryClient = useQueryClient();
  const [questions, setQuestions] = useState<GoldQuestion[]>(agent.gold_questions || []);
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");

  const saveMut = useMutation({
    mutationFn: () => setGoldQuestions(agent.slug, questions),
    onSuccess: () => {
      toast.success("Questions saved. Gate reset to PENDING.");
      queryClient.invalidateQueries({ queryKey: ["canon-agents"] });
    },
    onError: () => toast.error("Failed to save questions"),
  });

  const resultMut = useMutation({
    mutationFn: ({ qid, actualAnswer, passed }: { qid: string; actualAnswer: string; passed: boolean }) =>
      recordQuestionResult(agent.slug, qid, actualAnswer, passed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canon-agents"] });
    },
    onError: () => toast.error("Failed to save result"),
  });

  const addQuestion = () => {
    if (!newQ.trim() || !newA.trim()) return;
    const q: GoldQuestion = {
      id: `gq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      question: newQ.trim(),
      expectedAnswer: newA.trim(),
      actualAnswer: null,
      passed: null,
      testedAt: null,
    };
    setQuestions([...questions, q]);
    setNewQ("");
    setNewA("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#1A1D23]">Gold Questions</h4>
        <span className="text-xs text-gray-400">{questions.length} question{questions.length !== 1 ? "s" : ""}</span>
      </div>

      {questions.length > 0 && (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1A1D23]">
                    {i + 1}. {q.question}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Expected: {q.expectedAnswer}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {q.passed === true && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  {q.passed === false && <XCircle className="h-4 w-4 text-red-500" />}
                  {q.passed === null && <Circle className="h-4 w-4 text-gray-300" />}
                </div>
              </div>

              {q.actualAnswer && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1">
                  Actual: {q.actualAnswer}
                </p>
              )}

              {q.testedAt && (
                <p className="text-xs text-gray-400">
                  <Clock className="inline h-3 w-3 mr-0.5" />
                  Tested {new Date(q.testedAt).toLocaleDateString()}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => resultMut.mutate({ qid: q.id, actualAnswer: q.expectedAnswer, passed: true })}
                  disabled={resultMut.isPending}
                  className="flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Pass
                </button>
                <button
                  onClick={() => resultMut.mutate({ qid: q.id, actualAnswer: "Did not meet expected answer", passed: false })}
                  disabled={resultMut.isPending}
                  className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <XCircle className="h-3 w-3" />
                  Fail
                </button>
                <button
                  onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                  className="ml-auto p-1 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new question */}
      <div className="rounded-xl border border-dashed border-gray-300 p-3 space-y-2">
        <input
          type="text"
          value={newQ}
          onChange={(e) => setNewQ(e.target.value)}
          placeholder="Question..."
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#D56753]"
        />
        <input
          type="text"
          value={newA}
          onChange={(e) => setNewA(e.target.value)}
          placeholder="Expected answer..."
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#D56753]"
        />
        <button
          onClick={addQuestion}
          disabled={!newQ.trim() || !newA.trim()}
          className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-[#1A1D23] hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Question
        </button>
      </div>

      <button
        onClick={() => saveMut.mutate()}
        disabled={saveMut.isPending}
        className="flex items-center gap-1.5 rounded-lg bg-[#1A1D23] text-white px-4 py-2 text-sm font-medium hover:bg-[#1A1D23]/90 disabled:opacity-50 transition-colors"
      >
        <Save className="h-3.5 w-3.5" />
        {saveMut.isPending ? "Saving..." : "Save Questions"}
      </button>
    </div>
  );
}

// ── Verdict Controls ───────────────────────────────────────────────

function VerdictControls({ agent }: { agent: CanonAgent }) {
  const queryClient = useQueryClient();

  const verdictMut = useMutation({
    mutationFn: (v: "PASS" | "FAIL") => setVerdict(agent.slug, v),
    onSuccess: (_data, v) => {
      toast.success(`Verdict set to ${v}`);
      queryClient.invalidateQueries({ queryKey: ["canon-agents"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || "Failed to set verdict"),
  });

  const allPassed = agent.gold_questions.length > 0 && agent.gold_questions.every((q) => q.passed === true);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-[#1A1D23]">Verdict</h4>
      <div className="flex items-center gap-3">
        <button
          onClick={() => verdictMut.mutate("PASS")}
          disabled={!allPassed || verdictMut.isPending}
          title={!allPassed ? "All gold questions must pass first" : "Mark as PASS"}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ShieldCheck className="h-4 w-4" />
          Mark as PASS
        </button>
        <button
          onClick={() => verdictMut.mutate("FAIL")}
          disabled={verdictMut.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          <ShieldAlert className="h-4 w-4" />
          Mark as FAIL
        </button>
      </div>
      {!allPassed && agent.gold_questions.length > 0 && (
        <p className="text-xs text-amber-600">
          {agent.gold_questions.filter((q) => q.passed !== true).length} question{agent.gold_questions.filter((q) => q.passed !== true).length !== 1 ? "s" : ""} still need to pass before PASS is allowed.
        </p>
      )}
      {agent.gold_questions.length === 0 && (
        <p className="text-xs text-amber-600">Add gold questions before setting a verdict.</p>
      )}
    </div>
  );
}

// ── Expanded Agent Detail ──────────────────────────────────────────

function AgentDetail({ agent }: { agent: CanonAgent }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-6 mt-2 mb-1">
      <div className="text-sm text-gray-500">{agent.description}</div>
      <SpecEditor agent={agent} />
      <div className="border-t border-gray-100" />
      <GoldQuestionsEditor agent={agent} />
      <div className="border-t border-gray-100" />
      <VerdictControls agent={agent} />
    </div>
  );
}

// ── Group Section ──────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  intelligence: "Intelligence",
  content: "Content",
  operations: "Operations",
  client: "Client",
  growth: "Growth",
  financial: "Financial",
  governance: "Governance",
  personal: "Personal",
};

function GroupSection({
  group,
  agents,
  expandedSlug,
  onToggle,
}: {
  group: string;
  agents: CanonAgent[];
  expandedSlug: string | null;
  onToggle: (slug: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const passCount = agents.filter((a) => a.gate_verdict === "PASS").length;
  const failCount = agents.filter((a) => a.gate_verdict === "FAIL").length;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors px-1 py-1"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {GROUP_LABELS[group] || group}
        <span className="normal-case tracking-normal font-normal text-gray-400">
          {passCount}/{agents.length} passed
          {failCount > 0 && <span className="text-red-500 ml-1">{failCount} failed</span>}
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-2 ml-3">
          {agents.map((agent) => (
            <div key={agent.slug}>
              <AgentCard
                agent={agent}
                isExpanded={expandedSlug === agent.slug}
                onToggle={() => onToggle(agent.slug)}
              />
              {expandedSlug === agent.slug && <AgentDetail agent={agent} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Canon Tab ─────────────────────────────────────────────────

export default function CanonTab() {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["canon-agents"],
    queryFn: fetchCanonAgents,
    retry: 1,
  });

  const agents = data?.agents || [];

  // Group by agent_group
  const groups = new Map<string, CanonAgent[]>();
  for (const agent of agents) {
    const g = agent.agent_group || "unknown";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(agent);
  }

  // Stats
  const passCount = agents.filter((a) => a.gate_verdict === "PASS").length;
  const failCount = agents.filter((a) => a.gate_verdict === "FAIL").length;
  const pendingCount = agents.filter((a) => a.gate_verdict === "PENDING").length;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Passed", value: passCount, color: "text-emerald-600", icon: ShieldCheck },
          { label: "Failed", value: failCount, color: "text-red-600", icon: ShieldAlert },
          { label: "Pending", value: pendingCount, color: "text-amber-600", icon: ShieldQuestion },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
            <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && agents.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
          <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">No agents found.</p>
          <p className="text-xs mt-1">Run the agent identity migration first.</p>
        </div>
      )}

      {/* Grouped agent list */}
      {!isLoading && agents.length > 0 && (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([group, groupAgents]) => (
            <GroupSection
              key={group}
              group={group}
              agents={groupAgents}
              expandedSlug={expandedSlug}
              onToggle={(slug) => setExpandedSlug(expandedSlug === slug ? null : slug)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
