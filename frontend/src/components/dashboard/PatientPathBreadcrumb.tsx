/**
 * PatientPath Breadcrumb — quiet card, lower right, max 280px.
 *
 * Three states:
 * - building: "Your website preview is being prepared."
 * - preview_ready: CTA to preview URL
 * - live: "Your website is live." + view links
 *
 * Never shows error. If build fails, shows building state.
 */

import { Globe, ExternalLink } from "lucide-react";

type PatientPathStatus = "building" | "preview_ready" | "live";

interface PatientPathBreadcrumbProps {
  status: PatientPathStatus | null;
  previewUrl?: string | null;
  liveUrl?: string | null;
  hostname?: string | null;
}

export default function PatientPathBreadcrumb({
  status,
  previewUrl,
  liveUrl,
  hostname,
}: PatientPathBreadcrumbProps) {
  // Don't render if no status at all
  if (!status) return null;

  // Never show error -- fall back to building
  const safeStatus: PatientPathStatus =
    status === "preview_ready" || status === "live" ? status : "building";

  return (
    <div className="fixed bottom-4 right-4 z-30 w-[280px] rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          safeStatus === "live" ? "bg-emerald-50" : safeStatus === "preview_ready" ? "bg-[#D56753]/10" : "bg-gray-100"
        }`}>
          <Globe className={`h-4 w-4 ${
            safeStatus === "live" ? "text-emerald-600" : safeStatus === "preview_ready" ? "text-[#D56753]" : "text-gray-400"
          }`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[#212D40]">
            {safeStatus === "live"
              ? "Your website is live"
              : safeStatus === "preview_ready"
                ? "Your website is ready to preview"
                : "Website preview"}
          </p>
          {hostname && (
            <p className="text-[10px] text-gray-400 truncate">{hostname}</p>
          )}
        </div>
      </div>

      {safeStatus === "building" && (
        <p className="text-xs text-gray-500 leading-relaxed">
          Your website preview is being prepared. We'll notify you when it's ready.
        </p>
      )}

      {safeStatus === "preview_ready" && previewUrl && (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 mt-2 w-full rounded-lg bg-[#D56753] px-3 py-2 text-xs font-semibold text-white hover:brightness-105 transition-all"
        >
          View preview
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {safeStatus === "live" && (
        <div className="flex items-center gap-2 mt-2">
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#212D40] px-3 py-2 text-xs font-semibold text-white hover:bg-[#212D40]/90 transition-colors"
            >
              View it
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <a
            href="/dfy/website"
            className="text-[10px] font-medium text-gray-400 hover:text-[#212D40] transition-colors"
          >
            View in dashboard
          </a>
        </div>
      )}
    </div>
  );
}
