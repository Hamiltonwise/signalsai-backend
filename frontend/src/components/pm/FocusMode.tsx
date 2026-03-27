import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { PmProjectDetail, PmTask } from "../../types/pm";
import { KanbanBoard } from "./KanbanBoard";

interface FocusModeProps {
  isActive: boolean;
  onExit: () => void;
  project: PmProjectDetail;
  onTaskClick: (task: PmTask) => void;
}

export function FocusMode({ isActive, onExit, project, onTaskClick }: FocusModeProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isActive) onExit();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isActive, onExit]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="fixed inset-0 z-40 flex flex-col"
          style={{
            background:
              "linear-gradient(135deg, #1A1A1A 0%, #241e1c 50%, #1A1A1A 100%)",
            backgroundSize: "400% 400%",
            animation: "focusGradient 30s ease infinite",
          }}
        >
          {/* Minimal header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white/80">
              {project.name}
            </h2>
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
              Exit Focus
            </button>
          </div>

          {/* Full-width kanban */}
          <div className="flex-1 overflow-auto p-6">
            <KanbanBoard
              project={project}
              onTaskClick={onTaskClick}
              showBacklog={false}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
