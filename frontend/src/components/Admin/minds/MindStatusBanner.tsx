import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { getMindStatus, type MindStatus } from "../../../api/minds";

interface MindStatusBannerProps {
  mindId: string;
  refreshKey?: number;
}

export function MindStatusBanner({ mindId, refreshKey }: MindStatusBannerProps) {
  const [status, setStatus] = useState<MindStatus | null>(null);

  useEffect(() => {
    getMindStatus(mindId).then(setStatus);
  }, [mindId, refreshKey]);

  if (!status) return null;

  const allReasons = [
    ...status.scrapeBlockingReasons.map((r) => `Scrape: ${r}`),
    ...status.compileBlockingReasons.map((r) => `Compile: ${r}`),
  ];

  if (allReasons.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            Some actions are currently blocked
          </p>
          <ul className="mt-2 space-y-1">
            {allReasons.map((reason, i) => (
              <li key={i} className="text-xs text-amber-700">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
