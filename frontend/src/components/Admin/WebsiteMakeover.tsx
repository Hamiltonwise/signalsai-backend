/**
 * Website Makeover -- Trigger the full PatientPath/ClearPath pipeline.
 *
 * "These hard working folks need to be represented authentically,
 * not like a stock medical site that's cold and distant."
 *
 * One button. Triggers: research agent -> copy agent -> HTML build.
 * The research agent reads their reviews, finds the irreplaceable thing,
 * maps their competitors, and the copy agent writes every section
 * in their patients' own words.
 *
 * Usage: <WebsiteMakeover orgId={5} orgName="Garrison Orthodontics" />
 */

import { useState } from "react";
import { Wand2, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { apiPost } from "@/api/index";

interface Props {
  orgId: number;
  orgName: string;
  currentStatus?: string | null;
}

export default function WebsiteMakeover({ orgId, orgName, currentStatus }: Props) {
  const [status, setStatus] = useState<"idle" | "building" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleBuild = async () => {
    setStatus("building");
    setError(null);
    try {
      const res = await apiPost({
        path: "/admin/patientpath/build",
        passedData: { org_id: orgId },
      });
      if (res?.success) {
        setStatus("done");
      } else {
        setStatus("error");
        setError(res?.error || "Build failed to start.");
      }
    } catch (err) {
      setStatus("error");
      setError("Connection error. Try again.");
    }
  };

  return (
    <div className="card-supporting">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-[#1A1D23] flex items-center justify-center">
          <Wand2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1A1D23]">Website Makeover</p>
          <p className="text-xs text-gray-400">
            {currentStatus === "live" ? "Site is live. Rebuild to update."
             : currentStatus === "preview_ready" ? "Preview ready. Rebuild to refresh."
             : "Build a site from their reviews and market data."}
          </p>
        </div>
      </div>

      {status === "idle" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 leading-relaxed">
            Alloro will read {orgName}'s Google reviews, study their competitors,
            find what makes them irreplaceable, and build a site in their patients' own words.
          </p>
          <button
            onClick={handleBuild}
            className="btn-primary btn-press inline-flex items-center gap-2"
          >
            <Wand2 className="w-4 h-4" />
            Start Makeover
          </button>
        </div>
      )}

      {status === "building" && (
        <div className="flex items-center gap-3 py-2">
          <Loader2 className="w-4 h-4 text-[#D56753] animate-spin" />
          <p className="text-sm text-gray-500">
            Reading reviews, finding the irreplaceable thing, writing copy...
          </p>
        </div>
      )}

      {status === "done" && (
        <div className="flex items-center gap-3 py-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <p className="text-sm text-emerald-700">
            Makeover started for {orgName}. The research agent is working.
            This takes a few minutes.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={() => { setStatus("idle"); setError(null); }}
            className="text-xs text-[#D56753] font-medium hover:underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
