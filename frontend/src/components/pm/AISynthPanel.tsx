import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Upload, FileText } from "lucide-react";
import { apiPost } from "../../api/index";
import type { PmColumn } from "../../types/pm";
import { ProposedTaskList } from "./ProposedTaskList";
import { usePmStore } from "../../stores/pmStore";

interface AISynthPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  columns: PmColumn[];
}

type Phase = "input" | "loading" | "review";

interface ProposedTask {
  title: string;
  description: string | null;
  priority: "P1" | "P2" | "P3";
  deadline_hint: string | null;
}

export function AISynthPanel({
  isOpen,
  onClose,
  projectId,
  columns,
}: AISynthPanelProps) {
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [proposedTasks, setProposedTasks] = useState<ProposedTask[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchProject = usePmStore((s) => s.fetchProject);

  const reset = () => {
    setPhase("input");
    setText("");
    setFile(null);
    setProposedTasks([]);
    setError(null);
    setIsCreating(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleExtract = async () => {
    setError(null);
    setPhase("loading");

    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        res = await apiPost({ path: "/pm/ai-synth", passedData: formData });
      } else {
        res = await apiPost({ path: "/pm/ai-synth", passedData: { text } });
      }

      const proposed = res.data.proposed_tasks;
      if (!Array.isArray(proposed) || proposed.length === 0) {
        setError("No tasks could be extracted. Try different content.");
        setPhase("input");
        return;
      }

      setProposedTasks(proposed);
      setPhase("review");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to extract tasks. Please try again.");
      setPhase("input");
    }
  };

  const handleConfirm = async (
    tasks: Array<{
      title: string;
      description: string | null;
      priority: string;
      deadline: string | null;
    }>,
    columnId: string
  ) => {
    setIsCreating(true);
    try {
      await apiPost({
        path: "/pm/ai-synth/batch-create",
        passedData: {
          project_id: projectId,
          column_id: columnId,
          tasks,
        },
      });
      await fetchProject(projectId);
      handleClose();
    } catch {
      setError("Failed to create tasks. Please try again.");
      setIsCreating(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const canExtract = text.trim().length > 0 || file !== null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-pm-border bg-pm-bg-secondary shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-pm-border px-6 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-pm-accent" />
                <h2 className="text-base font-bold text-pm-text-primary">
                  AI Synth
                </h2>
              </div>
              <button
                onClick={handleClose}
                className="rounded-lg p-1.5 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-6">
              {error && (
                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-pm-danger">
                  {error}
                </div>
              )}

              {phase === "input" && (
                <div className="space-y-4">
                  <p className="text-sm text-pm-text-secondary">
                    Paste text or upload a file. AI will extract actionable tasks.
                  </p>

                  {/* Textarea */}
                  <textarea
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (e.target.value) setFile(null);
                    }}
                    rows={8}
                    placeholder="Paste an email, meeting notes, or any document..."
                    className="w-full rounded-lg border border-pm-border bg-pm-bg-primary p-4 text-sm text-pm-text-primary placeholder:text-pm-text-muted focus:border-pm-accent focus:outline-none focus:ring-1 focus:ring-pm-accent resize-none"
                  />

                  {/* File drop zone */}
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-pm-border p-6 text-center hover:border-pm-accent/50 transition-colors"
                  >
                    {file ? (
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-pm-accent" />
                        <span className="text-sm font-medium text-pm-text-primary">
                          {file.name}
                        </span>
                        <span className="text-xs text-pm-text-muted">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-6 w-6 text-pm-text-muted" />
                        <span className="text-sm text-pm-text-muted">
                          Drop a file or click to upload
                        </span>
                        <span className="text-xs text-pm-text-muted">
                          .txt, .pdf, .docx, .eml
                        </span>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.pdf,.docx,.eml"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setFile(f);
                          setText("");
                        }
                      }}
                      className="hidden"
                    />
                  </div>

                  {/* Extract button */}
                  <button
                    onClick={handleExtract}
                    disabled={!canExtract}
                    className="w-full rounded-lg bg-pm-accent px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-pm-accent-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pm-accent/20"
                  >
                    Extract Tasks
                  </button>
                </div>
              )}

              {phase === "loading" && (
                <div className="space-y-3">
                  <p className="text-sm text-pm-text-secondary mb-4">
                    Analyzing content...
                  </p>
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse rounded-lg border border-pm-border bg-pm-bg-primary p-4"
                    >
                      <div className="h-3 w-3/4 rounded bg-pm-bg-hover mb-2" />
                      <div className="h-2 w-1/2 rounded bg-pm-bg-hover" />
                    </div>
                  ))}
                </div>
              )}

              {phase === "review" && (
                <ProposedTaskList
                  tasks={proposedTasks}
                  columns={columns}
                  onConfirm={handleConfirm}
                  isCreating={isCreating}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
