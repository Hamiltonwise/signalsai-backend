import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { ActiveReviewJob } from "./types";

type ReviewJobProgressBannerProps = {
  job: ActiveReviewJob;
  onDismiss: () => void;
};

export function ReviewJobProgressBanner({ job, onDismiss }: ReviewJobProgressBannerProps) {
  if (job.state === "completed") {
    return (
      <Banner tone="green" icon={<CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />}>
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800">
            {job.type === "fetch" ? "Review fetch" : "Review sync"} complete
          </p>
        </div>
        <DismissButton tone="green" onDismiss={onDismiss} />
      </Banner>
    );
  }

  if (job.state === "failed") {
    return (
      <Banner tone="red" icon={<XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}>
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">
            {job.type === "fetch" ? "Review fetch" : "Review sync"} failed
          </p>
          {job.failedReason && <p className="text-xs text-red-600 mt-0.5">{job.failedReason}</p>}
        </div>
        <DismissButton tone="red" onDismiss={onDismiss} />
      </Banner>
    );
  }

  const elapsed = Math.floor((Date.now() - job.startedAt) / 1000);
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  return (
    <Banner tone="orange" icon={<Loader2 className="w-5 h-5 text-alloro-orange animate-spin flex-shrink-0" />}>
      <div className="flex-1">
        <p className="text-sm font-medium text-orange-900">
          {job.type === "fetch" ? "Fetching reviews via Google Maps" : "Syncing reviews from GBP"}
          {job.placeCount ? ` (${job.placeCount} location${job.placeCount > 1 ? "s" : ""})` : ""}
        </p>
        <p className="text-xs text-orange-700 mt-0.5">
          {job.state === "active" ? "Processing" : "Queued"} - {elapsedStr} elapsed
        </p>
      </div>
    </Banner>
  );
}

function Banner({ tone, icon, children }: {
  tone: "green" | "red" | "orange";
  icon: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
    orange: "bg-orange-50 border-orange-200",
  };

  return (
    <div className={`${tones[tone]} border rounded-lg px-4 py-3 flex items-center gap-3`}>
      {icon}
      {children}
    </div>
  );
}

function DismissButton({ tone, onDismiss }: { tone: "green" | "red"; onDismiss: () => void }) {
  const color = tone === "green" ? "text-green-500 hover:text-green-700" : "text-red-500 hover:text-red-700";

  return (
    <button type="button" onClick={onDismiss} className={`${color} text-sm`}>
      Dismiss
    </button>
  );
}
