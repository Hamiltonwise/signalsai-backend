/**
 * Intelligence Intake — Founder Mode panel
 *
 * Upload interface: paste URL, upload file, or paste raw text.
 * Claude extracts frameworks, tactics, quotes.
 * Generates a one-page intelligence brief.
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Link as LinkIcon,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  BookOpen,
  Video,
  Mic,
  Globe,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/index";

// ─── Types ──────────────────────────────────────────────────────────

interface KnowledgeSource {
  id: string;
  source_type: string;
  source_url: string | null;
  source_title: string;
  source_author: string | null;
  content_type: string;
  domain_tags: string[];
  status: string;
  created_at: string;
  intelligence_brief: string | null;
}

interface FullSource extends KnowledgeSource {
  raw_content: string | null;
  extracted_intelligence: {
    frameworks?: { name: string; description: string; application: string }[];
    tactics?: { tactic: string; context: string; effort_level: string; domain: string }[];
    quotes?: { quote: string; speaker: string; context: string }[];
    key_insight?: string;
    test_immediately?: string;
    content_flywheel?: string;
  };
  decision_cross_refs: { decision_title: string; relationship: string; framework: string }[];
}

const CONTENT_TYPES = [
  { value: "podcast", label: "Podcast", icon: Mic },
  { value: "article", label: "Article", icon: BookOpen },
  { value: "video", label: "Video", icon: Video },
  { value: "pdf", label: "PDF / Research", icon: FileText },
  { value: "other", label: "Other", icon: Globe },
];

const DOMAIN_COLORS: Record<string, string> = {
  product: "bg-blue-50 text-blue-700",
  gtm: "bg-emerald-50 text-emerald-700",
  operations: "bg-amber-50 text-amber-700",
  personal: "bg-purple-50 text-purple-700",
  legal_financial: "bg-red-50 text-red-700",
};

// ─── Upload Form ────────────────────────────────────────────────────

function UploadForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [mode, setMode] = useState<"url" | "text" | "file">("url");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [contentType, setContentType] = useState("article");
  const [rawText, setRawText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const submitMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        source_type: mode,
        source_url: mode === "url" ? url.trim() : null,
        source_title: title.trim() || url.trim() || "Untitled",
        source_author: author.trim() || null,
        content_type: contentType,
        raw_content: rawText.trim() || null,
      };
      return apiPost({ path: "/admin/intelligence/ingest", passedData: payload });
    },
    onSuccess: () => {
      setUrl("");
      setTitle("");
      setAuthor("");
      setRawText("");
      onSubmitted();
    },
  });

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTitle(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawText((ev.target?.result as string) || "");
      setMode("text");
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex gap-1 rounded-lg bg-white/5 p-1">
        {[
          { key: "url" as const, label: "URL", icon: LinkIcon },
          { key: "text" as const, label: "Paste Text", icon: FileText },
          { key: "file" as const, label: "Upload File", icon: Upload },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              mode === m.key
                ? "bg-[#D56753] text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <m.icon className="h-3.5 w-3.5" />
            {m.label}
          </button>
        ))}
      </div>

      {/* URL input */}
      {mode === "url" && (
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste URL — podcast, YouTube video, article..."
          className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#D56753]"
        />
      )}

      {/* Text input */}
      {mode === "text" && (
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste transcript, article text, notes..."
          rows={6}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#D56753] font-mono"
        />
      )}

      {/* File input */}
      {mode === "file" && (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-lg border-2 border-dashed border-white/10 p-8 text-center hover:border-[#D56753]/30 transition-colors"
        >
          <Upload className="h-6 w-6 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Click to upload PDF, transcript, or text file</p>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.doc,.docx" onChange={handleFileRead} className="hidden" />
        </button>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#D56753]"
        />
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Author / Speaker"
          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#D56753]"
        />
      </div>

      {/* Content type */}
      <div className="flex gap-2">
        {CONTENT_TYPES.map((ct) => (
          <button
            key={ct.value}
            onClick={() => setContentType(ct.value)}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
              contentType === ct.value
                ? "bg-white/10 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <ct.icon className="h-3 w-3" />
            {ct.label}
          </button>
        ))}
      </div>

      {/* Submit */}
      <button
        onClick={() => submitMut.mutate()}
        disabled={submitMut.isPending || (!url.trim() && !rawText.trim())}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#D56753] px-4 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40 transition-all"
      >
        {submitMut.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Extracting intelligence...</>
        ) : (
          <><Sparkles className="h-4 w-4" /> Extract Intelligence</>
        )}
      </button>
    </div>
  );
}

// ─── Source Card ─────────────────────────────────────────────────────

function SourceCard({
  source,
  isSelected,
  onClick,
}: {
  source: KnowledgeSource;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusIcon =
    source.status === "complete" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> :
    source.status === "processing" ? <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" /> :
    source.status === "failed" ? <XCircle className="h-3.5 w-3.5 text-red-400" /> :
    <Clock className="h-3.5 w-3.5 text-gray-400" />;

  const ctIcon = CONTENT_TYPES.find((ct) => ct.value === source.content_type);
  const Icon = ctIcon?.icon || Globe;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg p-3 transition-all ${
        isSelected ? "bg-white/10 border border-[#D56753]/30" : "hover:bg-white/5 border border-transparent"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">{source.source_title}</p>
            {statusIcon}
          </div>
          {source.source_author && (
            <p className="text-xs text-gray-500 mt-0.5">{source.source_author}</p>
          )}
          <div className="flex gap-1 mt-1.5">
            {(source.domain_tags || []).map((tag: string) => (
              <span key={tag} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${DOMAIN_COLORS[tag] || "bg-gray-100 text-gray-600"}`}>
                {tag.replace("_", "/")}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Brief Viewer ───────────────────────────────────────────────────

function BriefViewer({ sourceId }: { sourceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["intelligence-source", sourceId],
    queryFn: () => apiGet({ path: `/admin/intelligence/${sourceId}` }) as Promise<{ success: boolean; source: FullSource }>,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </div>
    );
  }

  const source = data?.source;
  if (!source) return null;

  const ext = source.extracted_intelligence || {};
  const crossRefs = source.decision_cross_refs || [];

  return (
    <div className="space-y-6 text-sm">
      {/* Brief */}
      {source.intelligence_brief && (
        <div className="prose prose-sm prose-invert max-w-none">
          <div className="whitespace-pre-wrap text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: source.intelligence_brief
                .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold text-white mt-4 mb-2">$1</h2>')
                .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold text-white mt-3 mb-1">$1</h3>')
                .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
                .replace(/\*(.+?)\*/g, '<em class="text-gray-400">$1</em>')
                .replace(/^\d+\.\s/gm, '<br/>• ')
            }}
          />
        </div>
      )}

      {/* Tactics */}
      {ext.tactics && ext.tactics.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Tactics to Test</h3>
          <div className="space-y-2">
            {ext.tactics.map((t: any, i: number) => (
              <div key={i} className="rounded-lg bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{t.tactic}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    t.effort_level === "low" ? "bg-emerald-900 text-emerald-300" :
                    t.effort_level === "high" ? "bg-red-900 text-red-300" :
                    "bg-amber-900 text-amber-300"
                  }`}>
                    {t.effort_level}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{t.context}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quotes */}
      {ext.quotes && ext.quotes.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Notable Quotes</h3>
          <div className="space-y-2">
            {ext.quotes.map((q: any, i: number) => (
              <div key={i} className="border-l-2 border-[#D56753]/30 pl-3">
                <p className="text-sm text-gray-300 italic">"{q.quote}"</p>
                <p className="text-xs text-gray-500 mt-1">— {q.speaker}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision Log cross-references */}
      {crossRefs.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Decision Log References</h3>
          <div className="space-y-1.5">
            {crossRefs.map((ref: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded font-bold ${
                  ref.relationship === "strengthens" ? "bg-emerald-900 text-emerald-300" : "bg-blue-900 text-blue-300"
                }`}>
                  {ref.relationship}
                </span>
                <span className="text-gray-400">{ref.decision_title}</span>
                <span className="text-gray-600">via {ref.framework}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function IntelligenceIntake() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["intelligence-sources"],
    queryFn: () => apiGet({ path: "/admin/intelligence" }) as Promise<{ success: boolean; sources: KnowledgeSource[] }>,
    refetchInterval: 10_000, // poll for processing status
  });

  const sources = data?.sources || [];

  return (
    <div className="h-full flex flex-col">
      {/* Upload Form */}
      <div className="shrink-0 border-b border-white/10 pb-5 mb-4">
        <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#D56753]" />
          Intelligence Intake
        </h2>
        <UploadForm onSubmitted={() => queryClient.invalidateQueries({ queryKey: ["intelligence-sources"] })} />
      </div>

      {/* Two-panel: source list + brief viewer */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Source list */}
        <div className="w-64 shrink-0 overflow-y-auto space-y-1">
          {isLoading && (
            <div className="text-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-500 mx-auto" />
            </div>
          )}
          {sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              isSelected={selectedId === s.id}
              onClick={() => setSelectedId(s.id)}
            />
          ))}
          {!isLoading && sources.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-8">
              No sources yet. Upload something to feed the Maven.
            </p>
          )}
        </div>

        {/* Brief viewer */}
        <div className="flex-1 overflow-y-auto">
          {selectedId ? (
            <BriefViewer sourceId={selectedId} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Select a source to view its intelligence brief
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
