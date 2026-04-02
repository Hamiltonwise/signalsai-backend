import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Save,
  Loader2,
  Zap,
  RotateCcw,
  Copy,
  Check,
  Eye,
  BarChart3,
  FileText,
  AlertCircle,
  Wand2,
  Briefcase,
  Settings,
  Send,
  GraduationCap,
} from "lucide-react";
import { toast } from "react-hot-toast";
import ReactMarkdown from "react-markdown";
import { ActionButton, StatusPill } from "../../ui/DesignSystem";
import { WorkRunsTab } from "./WorkRunsTab";
import { SkillUpgradeTab } from "./SkillUpgradeTab";
import {
  updateSkill,
  generateSkillNeuron,
  testSkillPortal,
  getSkill,
  getSkillNeuron,
  getSkillAnalytics,
  suggestSkillDefinition,
  listPublishChannels,
  type MindSkill,
  type MindSkillNeuron,
  type SkillAnalytics,
  type TriggerType,
  type PipelineMode,
  type WorkCreationType,
  type PublishChannel,
} from "../../../api/minds";

interface SkillDetailPanelProps {
  mindId: string;
  mindName: string;
  mindSlug: string;
  skill: MindSkill;
  analytics: SkillAnalytics | null;
  hasPublishedVersion: boolean;
  rejectionCategories: string[];
  onBack: () => void;
}

type DetailTab = "definition" | "schema" | "neuron" | "upgrade" | "config" | "work-runs" | "analytics";

const API_BASE =
  import.meta.env.VITE_API_URL || window.location.origin;

const POLL_INTERVAL = 3000;

function AnalyticsSection({
  mindId,
  skillId,
  initial,
}: {
  mindId: string;
  skillId: string;
  initial: SkillAnalytics | null;
}) {
  const [data, setData] = useState<SkillAnalytics | null>(initial);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (!initial) {
      (async () => {
        setLoading(true);
        const a = await getSkillAnalytics(mindId, skillId);
        setData(a);
        setLoading(false);
      })();
    }
  }, [mindId, skillId, initial]);

  if (loading || !data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Fill 7-day chart with zeros for missing days
  const chartData = (() => {
    const map = new Map(data.dailyCounts.map((d) => [d.date, d.count]));
    const days: { date: string; count: number; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
      days.push({ date: key, count: map.get(key) || 0, label: dayLabel });
    }
    return days;
  })();

  const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  return (
    <div>
      {/* Big numbers */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl bg-alloro-navy p-6 text-center">
          <p className="text-3xl font-bold text-white">{data.totalCalls}</p>
          <p className="text-xs text-gray-300 mt-1 font-medium uppercase tracking-wider">
            Total Work Points
          </p>
        </div>
        <div className="rounded-2xl bg-alloro-orange p-6 text-center">
          <p className="text-3xl font-bold text-white">{data.callsToday}</p>
          <p className="text-xs text-orange-100 mt-1 font-medium uppercase tracking-wider">
            Work Points Today
          </p>
        </div>
      </div>

      {/* 7-day chart */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-4">
          7-Day Trend
        </h4>
        <div className="flex items-end gap-2 h-32">
          {chartData.map((d) => (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-xs font-medium text-gray-500">
                {d.count > 0 ? d.count : ""}
              </span>
              <div
                className="w-full rounded-t-lg bg-alloro-orange/80 transition-all duration-300"
                style={{
                  height: `${Math.max((d.count / maxCount) * 100, 4)}%`,
                  minHeight: d.count > 0 ? "8px" : "4px",
                  opacity: d.count > 0 ? 1 : 0.2,
                }}
              />
              <span className="text-xs text-gray-400">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkillDetailPanel({
  mindId,
  mindName,
  mindSlug,
  skill,
  analytics,
  hasPublishedVersion,
  rejectionCategories,
  onBack,
}: SkillDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("definition");
  const [definition, setDefinition] = useState(skill.definition);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(
    skill.status === "generating",
  );
  const [neuron, setNeuron] = useState<MindSkillNeuron | null>(null);
  const [neuronLoading, setNeuronLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [skillStatus, setSkillStatus] = useState(skill.status);

  // Magic wand state
  const [hint, setHint] = useState("");
  const [suggesting, setSuggesting] = useState(false);

  // Config state
  const [cfgWorkType, setCfgWorkType] = useState<WorkCreationType | "">(skill.work_creation_type || "");
  const [cfgAttachmentType, setCfgAttachmentType] = useState<WorkCreationType | "">(skill.artifact_attachment_type || "");
  const [cfgOutputCount, setCfgOutputCount] = useState(skill.output_count || 1);
  const [cfgTriggerType, setCfgTriggerType] = useState<TriggerType>(skill.trigger_type || "manual");
  const [cfgTriggerDay, setCfgTriggerDay] = useState(skill.trigger_config?.day || "");
  const [cfgTriggerTime, setCfgTriggerTime] = useState(skill.trigger_config?.time || "09:00");
  const [cfgTriggerTimezone, setCfgTriggerTimezone] = useState(skill.trigger_config?.timezone || "America/New_York");
  const [cfgPipelineMode, setCfgPipelineMode] = useState<PipelineMode>(skill.pipeline_mode || "review_and_stop");
  const [cfgPublishChannelId, setCfgPublishChannelId] = useState<string>(skill.publish_channel_id || "");
  const [cfgStatus, setCfgStatus] = useState<"active" | "paused">(skill.status === "active" ? "active" : "paused");
  const [channels, setChannels] = useState<PublishChannel[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  // Test portal state
  const [testQuery, setTestQuery] = useState("");
  const [testingPortal, setTestingPortal] = useState(false);
  const [testPortalResponse, setTestPortalResponse] = useState<{
    response: string;
  } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const endpoint = `${API_BASE}/api/minds/${mindSlug}/${skill.slug}`;

  const definitionEmpty = !definition.trim();

  // --- Polling for generation status ---
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      if (document.hidden) return;
      const fresh = await getSkill(mindId, skill.id);
      if (!fresh) return;

      if (fresh.status === "ready") {
        stopPolling();
        setGenerating(false);
        setSkillStatus("ready");
        // Fetch the neuron automatically
        const n = await getSkillNeuron(mindId, skill.id);
        setNeuron(n);
        toast.success("Neuron generated");
      } else if (fresh.status === "failed") {
        stopPolling();
        setGenerating(false);
        setSkillStatus("failed");
        toast.error("Neuron generation failed");
      }
      // If still "generating", keep polling
    }, POLL_INTERVAL);
  }, [mindId, skill.id, stopPolling]);

  // On mount: if skill was already generating, resume polling
  useEffect(() => {
    if (skill.status === "generating") {
      setGenerating(true);
      setSkillStatus("generating");
      startPolling();
    }
    return () => stopPolling();
  }, [skill.id]);

  // Fetch publish channels for config tab
  useEffect(() => {
    listPublishChannels().then(setChannels);
  }, []);

  // Fetch neuron when switching to neuron tab
  useEffect(() => {
    if (activeTab === "neuron" && !neuron && !generating) {
      fetchNeuron();
    }
  }, [activeTab]);

  const fetchNeuron = async () => {
    setNeuronLoading(true);
    const n = await getSkillNeuron(mindId, skill.id);
    setNeuron(n);
    setNeuronLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const updated = await updateSkill(mindId, skill.id, {
      definition,
    });
    if (updated) {
      toast.success("Skill saved");
    } else {
      toast.error("Failed to save");
    }
    setSaving(false);
  };

  const handleGenerate = async () => {
    if (!hasPublishedVersion) {
      toast.error("Publish a brain version first");
      return;
    }
    if (definitionEmpty) {
      toast.error("Add a definition before generating a neuron");
      return;
    }

    // Save first so the backend has the latest definition
    await updateSkill(mindId, skill.id, {
      definition,
    });

    setGenerating(true);
    setSkillStatus("generating");

    // Fire and forget, we poll for completion
    generateSkillNeuron(mindId, skill.id).then((n) => {
      if (n) {
        // If response came back directly (fast enough), handle it
        stopPolling();
        setNeuron(n);
        setSkillStatus("ready");
        setGenerating(false);
        toast.success("Neuron generated");
      }
    }).catch(() => {
      // Polling will catch the failure status
    });

    // Start polling as backup in case it takes long or page refreshes
    startPolling();
  };

  const handleSuggest = async () => {
    if (!hint.trim()) {
      toast.error("Type a few words about what this skill should do");
      return;
    }
    setSuggesting(true);
    const result = await suggestSkillDefinition(mindId, hint.trim());
    if (result) {
      setDefinition(result.definition);
      setHint("");
      toast.success("Definition generated, review and save");
    } else {
      toast.error("Failed to generate suggestion");
    }
    setSuggesting(false);
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    const triggerConfig: { day?: string; time?: string; timezone?: string } = {};
    if (cfgTriggerType !== "manual") {
      triggerConfig.time = cfgTriggerTime;
      triggerConfig.timezone = cfgTriggerTimezone;
      if (cfgTriggerType === "weekly" || cfgTriggerType === "day_of_week") {
        triggerConfig.day = cfgTriggerDay;
      }
    }

    const updated = await updateSkill(mindId, skill.id, {
      work_creation_type: cfgWorkType || null,
      artifact_attachment_type: cfgAttachmentType || null,
      output_count: cfgOutputCount,
      trigger_type: cfgTriggerType,
      trigger_config: triggerConfig,
      pipeline_mode: cfgPipelineMode,
      publish_channel_id: cfgPublishChannelId || null,
      status: cfgStatus,
    });
    if (updated) {
      toast.success("Configuration saved");
    } else {
      toast.error("Failed to save configuration");
    }
    setSavingConfig(false);
  };

  const handleTestSkillPortal = async () => {
    if (!testQuery.trim()) return;
    setTestingPortal(true);
    setTestPortalResponse(null);
    const result = await testSkillPortal(mindId, skill.id, testQuery.trim());
    if (result) {
      setTestPortalResponse(result);
    } else {
      toast.error("Test portal query failed");
    }
    setTestingPortal(false);
  };


  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const tabs: Array<{ id: DetailTab; label: string; icon: React.ReactNode }> = [
    { id: "definition", label: "Definition", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "neuron", label: "Neuron", icon: <Eye className="h-3.5 w-3.5" /> },
    { id: "upgrade", label: "Upgrade", icon: <GraduationCap className="h-3.5 w-3.5" /> },
    { id: "config", label: "Configuration", icon: <Settings className="h-3.5 w-3.5" /> },
    { id: "work-runs", label: "Work Runs", icon: <Briefcase className="h-3.5 w-3.5" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  ];

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

  const canGenerate = hasPublishedVersion && !definitionEmpty && !generating;

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* Top bar */}
      <div className="border-b border-gray-100 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-alloro-navy text-white">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">
                  {skill.name}
                </h3>
                <StatusPill
                  label={skillStatus}
                  color={statusColor(skillStatus)}
                />
              </div>
              <p className="text-xs text-gray-400 font-mono">
                {skill.slug}
              </p>
            </div>
          </div>

        </div>

        {/* Endpoint */}
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          <code className="text-xs text-gray-500 truncate flex-1 font-mono">
            POST {endpoint}
          </code>
          <button
            onClick={handleCopyEndpoint}
            className="shrink-0 text-gray-400 hover:text-alloro-orange transition-colors"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100 px-5">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "text-alloro-orange border-alloro-orange"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Definition tab */}
        {activeTab === "definition" && (
          <div>
            {/* Magic wand AI suggestion */}
            <div className="mb-5 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Quick Start
              </label>
              <p className="text-xs text-gray-400 mb-3">
                Describe the skill in a few words and let AI draft the definition
                and output schema for you.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder={`e.g. "validate page templates" or "score lead quality"`}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSuggest();
                  }}
                  disabled={suggesting}
                />
                <ActionButton
                  label="Suggest"
                  icon={
                    suggesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )
                  }
                  onClick={handleSuggest}
                  variant="primary"
                  size="sm"
                  disabled={!hint.trim() || suggesting}
                  loading={suggesting}
                />
              </div>
            </div>

            <label className="block text-xs font-semibold text-gray-600 mb-2">
              Skill Definition
            </label>
            <p className="text-xs text-gray-400 mb-3 leading-relaxed">
              Describe how this skill should transform {mindName}'s brain for a
              specific task. Be detailed about what to focus on, what to remove,
              and what guardrails to add.
            </p>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              rows={12}
              placeholder={`e.g. You will be deployed as a quality checker for a website template page builder agent. You will receive pages in HTML and validate if they break, do not follow, or adhere to ${mindName}'s standards...`}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-mono leading-relaxed focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange resize-none"
            />
            {definitionEmpty && (
              <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                A definition is required before generating a neuron.
              </p>
            )}
            <div className="flex justify-end mt-4">
              <ActionButton
                label="Save Definition"
                icon={<Save className="h-4 w-4" />}
                onClick={handleSave}
                variant="primary"
                size="sm"
                loading={saving}
              />
            </div>
          </div>
        )}

        {/* Neuron tab */}
        {activeTab === "neuron" && (
          <div>
            {skill.is_neuron_stale && neuron && !generating && (
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800">
                  Neuron is out of date, brain was updated since generation.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  Skill Neuron Preview
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  The transmuted brain specialized for this skill. Read-only.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {neuron && !generating && (
                  <span className="text-xs text-gray-400">
                    Generated{" "}
                    {new Date(neuron.generated_at).toLocaleDateString()}
                  </span>
                )}
                {neuron && (
                  <ActionButton
                    label={skill.is_neuron_stale ? "Refresh Neuron" : (skillStatus === "ready" ? "Re-learn Skill" : "Generate Neuron")}
                    icon={
                      generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )
                    }
                    onClick={handleGenerate}
                    variant="secondary"
                    size="sm"
                    disabled={!canGenerate}
                    loading={generating}
                  />
                )}
              </div>
            </div>

            {/* Generating state, realtime monitor */}
            {generating ? (
              <div className="text-center py-12">
                <div className="relative inline-flex items-center justify-center mb-4">
                  <div className="absolute h-16 w-16 rounded-full border-2 border-alloro-orange/20 animate-ping" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-alloro-orange/10">
                    <Loader2 className="h-7 w-7 animate-spin text-alloro-orange" />
                  </div>
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  Transmuting knowledge...
                </p>
                <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                  {mindName} is distilling its brain into a focused variant for
                  this skill. This may take a minute.
                </p>
              </div>
            ) : neuronLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : !neuron ? (
              <div className="text-center py-12">
                <Zap className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-1">
                  No neuron generated yet
                </p>
                {definitionEmpty ? (
                  <p className="text-xs text-amber-600 mb-4">
                    Add a definition first, then generate.
                  </p>
                ) : !hasPublishedVersion ? (
                  <p className="text-xs text-amber-600 mb-4">
                    Publish a brain version first.
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mb-4">
                    Generate a neuron to create a focused variant of the brain.
                  </p>
                )}
                <ActionButton
                  label="Generate Neuron"
                  icon={<Zap className="h-4 w-4" />}
                  onClick={handleGenerate}
                  variant="primary"
                  size="sm"
                  disabled={!canGenerate}
                  loading={generating}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 max-h-[500px] overflow-y-auto">
                <div className="prose prose-sm prose-gray max-w-none">
                  <ReactMarkdown>{neuron.neuron_markdown}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upgrade tab */}
        {activeTab === "upgrade" && (
          <SkillUpgradeTab
            mindId={mindId}
            mindName={mindName}
            skillId={skill.id}
            skillName={skill.name}
          />
        )}

        {/* Configuration tab */}
        {activeTab === "config" && (
          <div className="space-y-6">
            {/* Status toggle */}
            <div className="rounded-xl border border-white/8 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-[#eaeaea]">Skill Status</h4>
                  <p className="text-xs text-[#6a6a75] mt-0.5">
                    Active skills run on their schedule. Paused skills are dormant.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCfgStatus("paused")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      cfgStatus === "paused"
                        ? "bg-white/10 text-[#eaeaea]"
                        : "text-[#6a6a75] hover:text-[#a0a0a8]"
                    }`}
                  >
                    Paused
                  </button>
                  <button
                    onClick={() => setCfgStatus("active")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      cfgStatus === "active"
                        ? "bg-green-500/20 text-green-400"
                        : "text-[#6a6a75] hover:text-[#a0a0a8]"
                    }`}
                  >
                    Active
                  </button>
                </div>
              </div>
            </div>

            {/* Work Creation Type + Output Count */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                  Work Creation Type
                </label>
                <select
                  value={cfgWorkType}
                  onChange={(e) => setCfgWorkType(e.target.value as WorkCreationType | "")}
                  className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                >
                  <option value="">Not set</option>
                  <option value="text">Text</option>
                  <option value="markdown">Markdown</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                  <option value="audio">Audio</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                  Output Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={cfgOutputCount}
                  onChange={(e) => setCfgOutputCount(parseInt(e.target.value) || 1)}
                  className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                />
                <p className="text-xs text-[#6a6a75] mt-1">How many work items per run</p>
              </div>
            </div>

            {/* Artifact Attachment */}
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                Artifact Attachment
              </label>
              <p className="text-xs text-[#6a6a75] mb-2">
                If this skill produces both content and a media attachment (e.g. text + image), set the attachment type.
              </p>
              <select
                value={cfgAttachmentType}
                onChange={(e) => setCfgAttachmentType(e.target.value as WorkCreationType | "")}
                className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50"
                style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
              >
                <option value="">None</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="pdf">PDF</option>
              </select>
            </div>

            {/* Trigger */}
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                Trigger Type
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {(["manual", "daily", "weekly", "day_of_week"] as TriggerType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setCfgTriggerType(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      cfgTriggerType === t
                        ? "bg-alloro-navy text-white border-alloro-navy"
                        : "border-white/10 text-[#a0a0a8] hover:border-white/20"
                    }`}
                  >
                    {t.replace(/_/g, " ")}
                  </button>
                ))}
              </div>

              {cfgTriggerType !== "manual" && (
                <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/8 bg-white/[0.04] p-4">
                  {(cfgTriggerType === "weekly" || cfgTriggerType === "day_of_week") && (
                    <div>
                      <label className="block text-xs font-medium text-[#a0a0a8] mb-1">Day</label>
                      <select
                        value={cfgTriggerDay}
                        onChange={(e) => setCfgTriggerDay(e.target.value)}
                        className="w-full rounded-lg border border-white/8 px-2 py-1.5 text-xs text-[#c2c0b6] focus:border-alloro-orange focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                      >
                        <option value="">Select</option>
                        <option value="monday">Monday</option>
                        <option value="tuesday">Tuesday</option>
                        <option value="wednesday">Wednesday</option>
                        <option value="thursday">Thursday</option>
                        <option value="friday">Friday</option>
                        <option value="saturday">Saturday</option>
                        <option value="sunday">Sunday</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-[#a0a0a8] mb-1">Time</label>
                    <input
                      type="time"
                      value={cfgTriggerTime}
                      onChange={(e) => setCfgTriggerTime(e.target.value)}
                      className="w-full rounded-lg border border-white/8 px-2 py-1.5 text-xs text-[#c2c0b6] focus:border-alloro-orange focus:outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#a0a0a8] mb-1">Timezone</label>
                    <select
                      value={cfgTriggerTimezone}
                      onChange={(e) => setCfgTriggerTimezone(e.target.value)}
                      className="w-full rounded-lg border border-white/8 px-2 py-1.5 text-xs text-[#c2c0b6] focus:border-alloro-orange focus:outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                    >
                      <option value="America/New_York">Eastern</option>
                      <option value="America/Chicago">Central</option>
                      <option value="America/Denver">Mountain</option>
                      <option value="America/Los_Angeles">Pacific</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/London">London</option>
                      <option value="Europe/Berlin">Berlin</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Pipeline Mode */}
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                Pipeline Mode
              </label>
              <div className="space-y-2">
                {([
                  { value: "review_and_stop", label: "Review & Stop", desc: "Work is created, reviewed, then stops. No auto-publish." },
                  { value: "review_then_publish", label: "Review then Publish", desc: "Work is reviewed. If approved, auto-publishes to the target." },
                  { value: "auto_pipeline", label: "Auto Pipeline", desc: "Fully automated. Work is created and published without review." },
                ] as const).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      cfgPipelineMode === opt.value
                        ? "border-alloro-orange bg-alloro-orange/10"
                        : "border-white/8 hover:border-white/15"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pipeline-mode"
                      value={opt.value}
                      checked={cfgPipelineMode === opt.value}
                      onChange={() => setCfgPipelineMode(opt.value)}
                      className="mt-0.5 accent-alloro-orange"
                    />
                    <div>
                      <span className="text-sm font-medium text-[#eaeaea]">{opt.label}</span>
                      <p className="text-xs text-[#6a6a75] mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Publish Channel */}
            {cfgPipelineMode !== "review_and_stop" && (
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                  Publish Channel
                </label>
                <select
                  value={cfgPublishChannelId}
                  onChange={(e) => setCfgPublishChannelId(e.target.value)}
                  className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                >
                  <option value="">No channel (internal only)</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}{ch.status === "disabled" ? " (disabled)" : ""}
                    </option>
                  ))}
                </select>
                {channels.length === 0 && (
                  <p className="text-xs text-[#6a6a75] mt-1">
                    No channels configured. Add one in the Publish Channels tab.
                  </p>
                )}
              </div>
            )}

            {/* Test Skill Portal */}
            <div className="rounded-xl border border-white/8 bg-white/[0.04] p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Send className="h-4 w-4 text-[#a0a0a8]" />
                  <h4 className="text-sm font-semibold text-[#eaeaea]">Test Skill Portal</h4>
                </div>
                <p className="text-xs text-[#6a6a75] mb-3">
                  Test the Skill Portal response using JWT auth.
                </p>
                <textarea
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  rows={3}
                  placeholder="Ask this skill portal a question..."
                  className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] placeholder-[#6a6a75] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50 resize-none mb-3"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                />
                <div className="flex justify-end mb-3">
                  <ActionButton
                    label="Test"
                    icon={<Send className="h-4 w-4" />}
                    onClick={handleTestSkillPortal}
                    variant="primary"
                    size="sm"
                    loading={testingPortal}
                    disabled={!testQuery.trim()}
                  />
                </div>
                {testPortalResponse && (
                  <div className="rounded-lg border border-white/8 bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-[#a0a0a8] uppercase tracking-wider">Response</span>
                    </div>
                    <p className="text-sm text-[#c2c0b6] whitespace-pre-wrap leading-relaxed">
                      {testPortalResponse.response}
                    </p>
                  </div>
                )}
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <ActionButton
                label="Save Configuration"
                icon={<Save className="h-4 w-4" />}
                onClick={handleSaveConfig}
                variant="primary"
                loading={savingConfig}
              />
            </div>
          </div>
        )}

        {/* Work Runs tab */}
        {activeTab === "work-runs" && (
          <WorkRunsTab
            mindId={mindId}
            skill={skill}
            rejectionCategories={rejectionCategories}
          />
        )}

        {/* Analytics tab */}
        {activeTab === "analytics" && (
          <AnalyticsSection
            mindId={mindId}
            skillId={skill.id}
            initial={analytics}
          />
        )}
      </div>
    </div>
  );
}
