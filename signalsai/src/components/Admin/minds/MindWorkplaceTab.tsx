import { useState, useEffect } from "react";
import {
  Plus,
  Loader2,
  Briefcase,
  Zap,
  Copy,
  Check,
  Trash2,
  X,
  Wand2,
  RotateCcw,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "../../ui/ConfirmModal";
import { ActionButton, EmptyState, StatusPill } from "../../ui/DesignSystem";
import { SkillDetailPanel } from "./SkillDetailPanel";
import { SkillBuilderChat } from "./SkillBuilderChat";
import {
  listSkills,
  createSkill,
  deleteSkill,
  getSkillAnalytics,
  listPublishChannels,
  regenerateStaleNeurons,
  type MindSkill,
  type SkillAnalytics,
} from "../../../api/minds";

interface MindWorkplaceTabProps {
  mindId: string;
  mindName: string;
  mindSlug: string;
  hasPublishedVersion: boolean;
  rejectionCategories?: string[];
}

const API_BASE =
  import.meta.env.VITE_API_URL || window.location.origin;

function SkillCard({
  skill,
  mindSlug,
  analytics,
  channelName,
  onSelect,
  onDelete,
}: {
  skill: MindSkill;
  mindSlug: string;
  analytics: SkillAnalytics | null;
  channelName: string | null;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);
  const endpoint = `${API_BASE}/api/minds/${mindSlug}/${skill.slug}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({ title: `Delete skill "${skill.name}"?`, confirmLabel: "Delete", variant: "danger" });
    if (ok) {
      onDelete();
    }
  };

  const statusColor = (s: string): "orange" | "green" | "gray" | "red" => {
    switch (s) {
      case "ready":
      case "active":
        return "green";
      case "generating":
        return "orange";
      case "paused":
        return "gray";
      case "failed":
        return "red";
      default:
        return "gray";
    }
  };

  return (
    <div
      onClick={onSelect}
      className="group cursor-pointer rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-alloro-orange/30 hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-alloro-navy text-white">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              {skill.name}
            </h4>
            <p className="text-[11px] text-gray-400 font-mono">{skill.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill label={skill.status} color={statusColor(skill.status)} />
          {skill.is_neuron_stale && (
            <span
              className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0"
              title="Neuron is stale — brain was updated"
            />
          )}
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-300 hover:text-red-400 transition-all"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Definition preview */}
      <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">
        {skill.definition || "No definition set"}
      </p>

      {/* Trigger / Pipeline info */}
      {skill.work_creation_type && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
            {skill.work_creation_type}
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {skill.trigger_type}
          </span>
          <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600">
            {skill.pipeline_mode.replace(/_/g, " ")}
          </span>
          {channelName && (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">
              → {channelName}
            </span>
          )}
        </div>
      )}

      {/* API endpoint */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 mb-3">
        <code className="text-[10px] text-gray-500 truncate flex-1 font-mono">
          POST {endpoint}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 text-gray-400 hover:text-alloro-orange transition-colors"
          title="Copy endpoint"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Analytics */}
      {analytics && (
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>
            <span className="font-semibold text-gray-600">
              {analytics.totalCalls}
            </span>{" "}
            total work pts
          </span>
          <span>
            <span className="font-semibold text-gray-600">
              {analytics.callsToday}
            </span>{" "}
            today
          </span>
        </div>
      )}
    </div>
  );
}

const DEFAULT_REJECTION_CATEGORIES = [
  "too_similar",
  "wrong_tone",
  "off_brand",
  "factually_incorrect",
  "wrong_format",
  "topic_not_relevant",
  "too_generic",
];

export function MindWorkplaceTab({
  mindId,
  mindName,
  mindSlug,
  hasPublishedVersion,
  rejectionCategories = DEFAULT_REJECTION_CATEGORIES,
}: MindWorkplaceTabProps) {
  const [skills, setSkills] = useState<MindSkill[]>([]);
  const [analyticsMap, setAnalyticsMap] = useState<
    Record<string, SkillAnalytics>
  >({});
  const [channelMap, setChannelMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [refreshingStale, setRefreshingStale] = useState(false);

  const staleCount = skills.filter((s) => s.is_neuron_stale).length;

  const handleRefreshStale = async () => {
    setRefreshingStale(true);
    try {
      const result = await regenerateStaleNeurons(mindId);
      if (result.regeneratedCount > 0) {
        toast.success(`Refreshed ${result.regeneratedCount} neuron${result.regeneratedCount === 1 ? "" : "s"}`);
      }
      if (result.failedCount > 0) {
        toast.error(`${result.failedCount} failed to refresh`);
      }
      fetchSkills();
    } catch {
      toast.error("Failed to refresh stale neurons");
    } finally {
      setRefreshingStale(false);
    }
  };

  const fetchSkills = async () => {
    setLoading(true);
    const data = await listSkills(mindId);
    setSkills(data);
    setLoading(false);

    // Fetch analytics for each skill in parallel
    const entries = await Promise.all(
      data.map(async (s) => {
        const a = await getSkillAnalytics(mindId, s.id);
        return [s.id, a] as const;
      }),
    );
    setAnalyticsMap(Object.fromEntries(entries));

    // Fetch channels for name resolution
    const chs = await listPublishChannels();
    setChannelMap(Object.fromEntries(chs.map((c) => [c.id, c.name])));
  };

  useEffect(() => {
    fetchSkills();
  }, [mindId]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    const skill = await createSkill(mindId, createName.trim(), "", null);
    if (skill) {
      toast.success(`Skill "${skill.name}" created`);
      setShowCreate(false);
      setCreateName("");
      setSelectedSkillId(skill.id);
      fetchSkills();
    } else {
      toast.error("Failed to create skill");
    }
    setCreating(false);
  };

  const handleDelete = async (skillId: string) => {
    const ok = await deleteSkill(mindId, skillId);
    if (ok) {
      toast.success("Skill deleted");
      if (selectedSkillId === skillId) setSelectedSkillId(null);
      fetchSkills();
    } else {
      toast.error("Failed to delete skill");
    }
  };

  const selectedSkill = skills.find((s) => s.id === selectedSkillId) || null;

  // If skill builder is open, show it
  if (showBuilder) {
    return (
      <SkillBuilderChat
        mindId={mindId}
        mindName={mindName}
        onClose={() => setShowBuilder(false)}
        onSkillCreated={(skillId) => {
          setShowBuilder(false);
          setSelectedSkillId(skillId);
          fetchSkills();
        }}
      />
    );
  }

  // If a skill is selected, show detail panel
  if (selectedSkill) {
    return (
      <SkillDetailPanel
        mindId={mindId}
        mindName={mindName}
        mindSlug={mindSlug}
        skill={selectedSkill}
        analytics={analyticsMap[selectedSkill.id] || null}
        hasPublishedVersion={hasPublishedVersion}
        rejectionCategories={rejectionCategories}
        onBack={() => {
          setSelectedSkillId(null);
          fetchSkills();
        }}
      />
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-gray-900">Workplace</h3>
          <p className="text-sm text-gray-500 mt-1">
            {mindName}'s skills on deck. Each skill is a focused variant of the
            brain, purpose-built for a task.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton
            label="Skill Builder"
            icon={<Wand2 className="h-4 w-4" />}
            onClick={() => setShowBuilder(true)}
            variant="secondary"
          />
          <ActionButton
            label="Create Skill"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreate(true)}
            variant="primary"
          />
        </div>
      </div>

      {!hasPublishedVersion && (
        <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          <strong>Heads up:</strong> {mindName} needs a published brain before
          skills can generate neurons. Go to Agent University to publish a
          version first.
        </div>
      )}

      {staleCount > 0 && (
        <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center justify-between">
          <p className="text-sm text-amber-800">
            <strong>{staleCount} skill{staleCount === 1 ? "" : "s"}</strong> {staleCount === 1 ? "has a" : "have"} stale neuron{staleCount === 1 ? "" : "s"} — brain has been updated since last generation.
          </p>
          <ActionButton
            label="Refresh All"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={handleRefreshStale}
            variant="primary"
            size="sm"
            loading={refreshingStale}
          />
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900">New Skill</h4>
            <button
              onClick={() => setShowCreate(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="e.g. Page Template Validator"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange mb-3"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <div className="flex justify-end gap-2">
            <ActionButton
              label="Cancel"
              onClick={() => setShowCreate(false)}
              variant="ghost"
              size="sm"
            />
            <ActionButton
              label="Create"
              onClick={handleCreate}
              variant="primary"
              size="sm"
              disabled={!createName.trim()}
              loading={creating}
            />
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty */}
      {!loading && skills.length === 0 && (
        <EmptyState
          icon={<Briefcase className="h-8 w-8" />}
          title="No skills yet"
          description={`Create ${mindName}'s first skill to unlock focused, task-specific endpoints.`}
        />
      )}

      {/* Skills grid */}
      {!loading && skills.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              mindSlug={mindSlug}
              analytics={analyticsMap[skill.id] || null}
              channelName={skill.publish_channel_id ? channelMap[skill.publish_channel_id] || null : null}
              onSelect={() => setSelectedSkillId(skill.id)}
              onDelete={() => handleDelete(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
