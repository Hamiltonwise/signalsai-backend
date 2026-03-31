import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FolderKanban, Plus, Maximize, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePmStore } from "../../stores/pmStore";


interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject?: () => void;
  onToggleFocusMode?: () => void;
}

interface SearchResult {
  id: string;
  type: "project" | "task" | "action";
  title: string;
  subtitle?: string;
  icon: typeof Search;
  action: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onCreateProject,
  onToggleFocusMode,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { projects, activeProject } = usePmStore();

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const results: SearchResult[] = (() => {
    const items: SearchResult[] = [];
    const q = query.toLowerCase().trim();

    // Actions (always available)
    if (!q || "new task".includes(q) || "create task".includes(q)) {
      items.push({
        id: "action-new-task",
        type: "action",
        title: "Create new task",
        subtitle: "Quick-add a task to any project",
        icon: Plus,
        action: () => {
          onClose();
          // Navigate to active project or first project
          const targetId = activeProject?.id || projects[0]?.id;
          if (targetId) navigate(`/admin/pm/${targetId}`);
        },
      });
    }

    if (!q || "new project".includes(q) || "create project".includes(q)) {
      items.push({
        id: "action-new-project",
        type: "action",
        title: "Create new project",
        icon: FolderKanban,
        action: () => {
          onClose();
          onCreateProject?.();
        },
      });
    }

    if (!q || "focus mode".includes(q)) {
      items.push({
        id: "action-focus",
        type: "action",
        title: "Toggle Focus Mode",
        icon: Maximize,
        action: () => {
          onClose();
          onToggleFocusMode?.();
        },
      });
    }

    // Projects
    const matchingProjects = projects.filter(
      (p) => !q || p.name.toLowerCase().includes(q)
    );
    for (const project of matchingProjects.slice(0, 5)) {
      items.push({
        id: `project-${project.id}`,
        type: "project",
        title: project.name,
        subtitle: `${project.total_tasks || 0} tasks`,
        icon: FolderKanban,
        action: () => {
          onClose();
          navigate(`/admin/pm/${project.id}`);
        },
      });
    }

    // Tasks (search across all loaded project tasks)
    if (q && activeProject) {
      const matchingTasks = activeProject.columns
        .flatMap((c) => c.tasks)
        .filter((t) => t.title.toLowerCase().includes(q))
        .slice(0, 5);

      for (const task of matchingTasks) {
        items.push({
          id: `task-${task.id}`,
          type: "task",
          title: task.title,
          subtitle: task.priority ?? undefined,
          icon: ClipboardList,
          action: () => {
            onClose();
            // Task is in active project, just close palette
          },
        });
      }
    }

    return items;
  })();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        results[selectedIndex].action();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, selectedIndex, onClose]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-1/4 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search tasks, projects, or actions..."
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              <kbd className="hidden sm:inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto py-2">
              {results.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  No results for &ldquo;{query}&rdquo;
                </p>
              ) : (
                results.map((result, i) => {
                  const Icon = result.icon;
                  return (
                    <button
                      key={result.id}
                      onClick={result.action}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === selectedIndex
                          ? "bg-alloro-orange/10"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 ${
                          i === selectedIndex
                            ? "text-alloro-orange"
                            : "text-gray-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {result.title}
                        </p>
                        {result.subtitle && (
                          <p className="text-xs text-gray-500">{result.subtitle}</p>
                        )}
                      </div>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400 capitalize">
                        {result.type}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
