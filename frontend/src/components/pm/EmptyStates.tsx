import { motion } from "framer-motion";
import { FolderPlus, Inbox, Clock, SearchX } from "lucide-react";

// Shared styling helpers — keep each variant small and composable

interface NoProjectsProps {
  onCreate: () => void;
}

export function NoProjects({ onCreate }: NoProjectsProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 rounded-xl"
      style={{
        border: "2px dashed var(--color-pm-border)",
        borderRadius: "12px",
      }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
        style={{ backgroundColor: "var(--color-pm-accent-subtle)" }}
      >
        <FolderPlus
          className="h-7 w-7"
          strokeWidth={1.5}
          style={{ color: "var(--color-pm-text-muted)" }}
        />
      </div>
      <h2
        className="text-lg font-semibold mb-1.5"
        style={{ color: "var(--color-pm-text-primary)" }}
      >
        No projects yet
      </h2>
      <p
        className="text-sm text-center max-w-[320px] mb-6"
        style={{ color: "var(--color-pm-text-secondary)" }}
      >
        Create your first project to start tracking tasks.
      </p>
      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        onClick={onCreate}
        className="rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors duration-150"
        style={{
          backgroundColor: "#D66853",
          boxShadow: "0 2px 8px rgba(214,104,83,0.25)",
        }}
      >
        Create Project
      </motion.button>
    </div>
  );
}

export function NoTasksInColumn() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg py-8 px-3 mx-0 my-1 text-center"
      style={{
        border: "1.5px dashed var(--color-pm-border-subtle)",
        color: "var(--color-pm-text-muted)",
      }}
    >
      <Inbox className="h-4 w-4 mb-1.5" strokeWidth={1.5} />
      <p className="text-[12px]">No tasks yet</p>
    </div>
  );
}

export function NoActivity({ message = "No activity yet" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-5">
      <Clock
        className="h-5 w-5 mb-2"
        strokeWidth={1.5}
        style={{ color: "var(--color-pm-text-muted)" }}
      />
      <p
        className="text-[12px]"
        style={{ color: "var(--color-pm-text-muted)" }}
      >
        {message}
      </p>
    </div>
  );
}

interface NoSearchResultsProps {
  query: string;
}

export function NoSearchResults({ query }: NoSearchResultsProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <SearchX
        className="h-5 w-5 mb-2"
        strokeWidth={1.5}
        style={{ color: "var(--color-pm-text-muted)" }}
      />
      <p className="text-sm" style={{ color: "var(--color-pm-text-muted)" }}>
        {query ? (
          <>
            No results for <span className="font-medium">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          <>No results</>
        )}
      </p>
    </div>
  );
}
