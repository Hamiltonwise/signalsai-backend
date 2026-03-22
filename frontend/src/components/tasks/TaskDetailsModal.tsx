import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactElement } from "react";
import type { ActionItem } from "../../types/tasks";
import { AgentTypePill } from "./AgentTypePill";
import { parseHighlightTags } from "../../utils/textFormatting";

interface TaskDetailsModalProps {
  task: ActionItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TaskDetailsModal({
  task,
  isOpen,
  onClose,
}: TaskDetailsModalProps) {
  if (!isOpen || !task) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "border-amber-200 bg-amber-50 text-amber-700",
      in_progress:
        "border-alloro-orange/20 bg-alloro-orange/5 text-alloro-orange",
      complete: "border-green-200 bg-green-50 text-green-700",
      archived: "border-slate-200 bg-slate-50 text-slate-600",
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  const getCategoryBadge = (category: string) => {
    return category === "ALLORO"
      ? "border-purple-200 bg-purple-50 text-purple-700"
      : "border-alloro-orange/20 bg-alloro-orange/5 text-alloro-orange";
  };

  // Enhanced markdown rendering for description (also handles <hghlt> tags)
  const renderMarkdownText = (text: string): React.ReactNode => {
    const parts: ReactElement[] = [];
    let lastIndex = 0;
    let keyCounter = 0;

    // Match **bold**, *italic*, `code`, [links](url), and <hghlt>highlighted</hghlt>
    const regex =
      /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\)|<hghlt>([\s\S]*?)<\/hghlt>)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${keyCounter++}`}>
            {text.substring(lastIndex, match.index)}
          </span>
        );
      }

      const fullMatch = match[0];
      if (fullMatch.startsWith("<hghlt>") && fullMatch.endsWith("</hghlt>")) {
        // Highlighted text (from AI agents)
        parts.push(
          <span
            key={`highlight-${keyCounter++}`}
            className="underline underline-offset-4 font-semibold text-alloro-navy"
          >
            {match[4]}
          </span>
        );
      } else if (fullMatch.startsWith("**") && fullMatch.endsWith("**")) {
        // Bold text
        parts.push(
          <strong key={`bold-${keyCounter++}`} className="font-semibold">
            {fullMatch.slice(2, -2)}
          </strong>
        );
      } else if (fullMatch.startsWith("*") && fullMatch.endsWith("*")) {
        // Italic text
        parts.push(
          <em key={`italic-${keyCounter++}`} className="italic">
            {fullMatch.slice(1, -1)}
          </em>
        );
      } else if (fullMatch.startsWith("`") && fullMatch.endsWith("`")) {
        // Code text
        parts.push(
          <code
            key={`code-${keyCounter++}`}
            className="rounded-md bg-slate-100 px-1.5 py-0.5 text-sm font-mono text-alloro-navy"
          >
            {fullMatch.slice(1, -1)}
          </code>
        );
      } else if (match[2] && match[3]) {
        // Link
        parts.push(
          <a
            key={`link-${keyCounter++}`}
            href={match[3]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-alloro-orange font-medium underline hover:text-blue-700"
          >
            {match[2]}
          </a>
        );
      }

      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${keyCounter++}`}>{text.substring(lastIndex)}</span>
      );
    }

    return <>{parts}</>;
  };

  // Simple markdown-like rendering for description
  const renderDescription = (text: string): ReactElement[] => {
    // Filter out confidence lines
    const filteredText = text
      .split("\n")
      .filter((line) => !line.toLowerCase().includes("confidence:"))
      .join("\n");

    // Split by newlines and render paragraphs
    const paragraphs = filteredText.split("\n\n");
    return paragraphs.map((para, idx) => {
      // Check for bullet points
      if (para.trim().startsWith("- ") || para.trim().startsWith("* ")) {
        const items = para.split("\n").filter((line) => line.trim());
        return (
          <ul key={idx} className="list-disc pl-5 space-y-1.5 mb-4">
            {items.map((item, itemIdx) => {
              const cleanedItem = item.replace(/^[-*]\s+/, "");
              return (
                <li key={itemIdx} className="text-slate-700">
                  {renderMarkdownText(cleanedItem)}
                </li>
              );
            })}
          </ul>
        );
      }
      // Check for numbered lists
      if (/^\d+\.\s/.test(para.trim())) {
        const items = para.split("\n").filter((line) => line.trim());
        return (
          <ol key={idx} className="list-decimal pl-5 space-y-1.5 mb-4">
            {items.map((item, itemIdx) => {
              const cleanedItem = item.replace(/^\d+\.\s+/, "");
              return (
                <li key={itemIdx} className="text-slate-700">
                  {renderMarkdownText(cleanedItem)}
                </li>
              );
            })}
          </ol>
        );
      }
      // Check for headings
      if (para.trim().startsWith("### ")) {
        return (
          <h3
            key={idx}
            className="text-lg font-bold text-alloro-navy font-heading mb-3 mt-4"
          >
            {para.trim().substring(4)}
          </h3>
        );
      }
      if (para.trim().startsWith("## ")) {
        return (
          <h2
            key={idx}
            className="text-xl font-bold text-alloro-navy font-heading mb-3 mt-4"
          >
            {para.trim().substring(3)}
          </h2>
        );
      }
      if (para.trim().startsWith("# ")) {
        return (
          <h1
            key={idx}
            className="text-2xl font-bold text-alloro-navy font-heading mb-4 mt-4"
          >
            {para.trim().substring(2)}
          </h1>
        );
      }
      // Regular paragraph with inline markdown
      return (
        <p key={idx} className="text-slate-700 mb-4 leading-relaxed">
          {renderMarkdownText(para)}
        </p>
      );
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.3 }}
          className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white/95 backdrop-blur-md px-6 py-5 rounded-t-2xl">
            <div className="flex-1 pr-4">
              <h2 className="text-2xl font-bold text-alloro-navy font-heading">
                {parseHighlightTags(task.title, "underline")}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 rounded-xl p-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-6 px-6 py-6">
            {/* Badges Section */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Status:
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${getStatusBadge(
                    task.status
                  )}`}
                >
                  {task.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Category:
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${getCategoryBadge(
                    task.category
                  )}`}
                >
                  {task.category}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Agent Type:
                </span>
                <AgentTypePill agentType={task.agent_type ?? null} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Approval:
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${
                    task.is_approved
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {task.is_approved ? "Approved" : "Pending"}
                </span>
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Description
                </h3>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                  {renderDescription(task.description)}
                </div>
              </div>
            )}

            {/* Metadata - Only show completed and due dates if they exist */}
            {(task.completed_at || task.due_date) && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {task.completed_at && (
                  <div className="rounded-xl border border-green-100 bg-green-50/50 p-4">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-green-600">
                      Completed
                    </h3>
                    <p className="text-sm text-alloro-navy font-medium">
                      {formatDate(task.completed_at)}
                    </p>
                  </div>
                )}
                {task.due_date && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Due Date
                    </h3>
                    <p className="text-sm text-alloro-navy font-medium">
                      {formatDate(task.due_date)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur-md px-6 py-4 rounded-b-2xl">
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
