import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Eye, Activity, Search } from "lucide-react";
import AIVisibilityGrid from "./AIVisibilityGrid";
import LiveActivityTimeline from "./LiveActivityTimeline";
import WatchingList from "./WatchingList";

/**
 * Answer Engine doctor-facing module. Hosted as a section on the
 * Presence page (and reachable as a sub-tab once the design lands).
 *
 * Three sub-modules (collapsible, all open by default):
 *   - AI Visibility (25 queries x 6 platforms)
 *   - Live Activity (last 50 entries grouped by day)
 *   - Watching (signals being monitored that have not yet fired)
 *
 * Feature-flag gated server-side. If the flag is off for the practice,
 * each child renders a calm "not yet active" message; the parent stays
 * mounted so future activations don't require a code change.
 */

interface Props {
  practiceId: number;
}

export default function AnswerEngineModule({ practiceId }: Props) {
  return (
    <div className="space-y-4">
      <SubSection title="AI Visibility" icon={Search} defaultOpen={true}>
        <AIVisibilityGrid practiceId={practiceId} />
      </SubSection>

      <SubSection title="Live Activity" icon={Activity} defaultOpen={true}>
        <LiveActivityTimeline practiceId={practiceId} />
      </SubSection>

      <SubSection title="Watching" icon={Eye} defaultOpen={false}>
        <WatchingList practiceId={practiceId} />
      </SubSection>
    </div>
  );
}

function SubSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: typeof Search;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-stone-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wider">
            {title}
          </h3>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}
