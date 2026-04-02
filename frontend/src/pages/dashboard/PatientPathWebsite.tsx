/**
 * PatientPath Website — /dashboard/website
 *
 * Shows website status + natural language editor.
 * EVERY client can edit their site. Not a premium feature.
 * The wall is down. Your website is your representation.
 * "Change Team to Doctors." Preview. Confirm. Done.
 */

import { Globe, ExternalLink, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/index";
import { useAuth } from "../../hooks/useAuth";
import NaturalLanguageEditBar from "../../components/PageEditor/NaturalLanguageEditBar";

interface WebsiteInfo {
  generated_hostname: string;
  status: string;
  liveUrl?: string;
  pageId?: string | null;
}

export default function PatientPathWebsite() {
  const { userProfile } = useAuth();
  const orgId = userProfile?.organizationId || null;

  const { data: websiteData, isLoading: isWebsiteLoading } = useQuery({
    queryKey: ["client-website", orgId],
    queryFn: async (): Promise<WebsiteInfo | null> => {
      const res = await apiGet({ path: "/user/website" });
      if (!res?.success || !res?.website) return null;
      return res.website;
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  const { data: patientpathData, isLoading: isStatusLoading } = useQuery({
    queryKey: ["patientpath-status", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/patientpath" });
      return res?.success ? res : null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const isLoading = isWebsiteLoading || isStatusLoading;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <Loader2 className="h-10 w-10 text-gray-300 mx-auto mb-4 animate-spin" />
        <p className="text-sm text-gray-400">Loading website status...</p>
      </div>
    );
  }

  // Case 1: Website is live, show link
  if (websiteData) {
    const siteUrl =
      websiteData.liveUrl ||
      `https://${websiteData.generated_hostname}.sites.getalloro.com`;

    // Get the page ID for natural language editing
    const pageId = websiteData.pageId || null;

    return (
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Site status + link */}
        <div className="card-supporting">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Globe className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-[#1A1D23]">Your Website</h1>
                <p className="text-xs text-gray-400">{websiteData.generated_hostname}</p>
              </div>
            </div>
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A1D23] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1A1D23]/90 transition-colors"
            >
              View site
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Natural language editor -- the wall is down.
            Every client can edit their site. Not a premium feature.
            Your website is YOUR representation. Editing it is a right.
            "Change Team to Doctors." Preview. Confirm. Done. */}
        <div className="card-primary">
          <h2 className="text-base font-semibold text-[#1A1D23] mb-1">Make a change</h2>
          <p className="text-sm text-gray-400 mb-4">
            Type what you want changed in plain English. Alloro will show you a preview before publishing.
          </p>
          <NaturalLanguageEditBar
            pageId={pageId}
            onChangesApplied={() => {
              // Refresh the website data after changes
              window.location.reload();
            }}
          />
        </div>

        {/* Helpful examples */}
        <div className="px-1">
          <p className="text-xs text-gray-400 mb-2">Examples of what you can ask:</p>
          <div className="flex flex-wrap gap-2">
            {[
              "Change our hours to 8am-5pm Monday through Friday",
              "Add a new service called Internal Bleaching",
              "Update the team section to say Doctors instead of Team",
              "Add CareCredit as a financing option",
            ].map((example) => (
              <span key={example} className="text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg">
                "{example}"
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Case 2: PatientPath is building or preview ready
  const ppStatus = patientpathData?.status as string | undefined;

  if (ppStatus === "building" || ppStatus === "researching") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
            <Loader2 className="h-7 w-7 text-amber-600 animate-spin" />
          </div>
          <h1 className="text-xl font-bold text-[#212D40] mb-2">
            Your Website Is Being Built
          </h1>
          <p className="text-sm text-gray-500">
            Alloro is researching your business and building your site automatically. This usually takes less than an hour.
          </p>
        </div>
      </div>
    );
  }

  if (ppStatus === "preview_ready") {
    const previewUrl = patientpathData?.previewUrl as string | undefined;
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <Globe className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-[#212D40] mb-2">
            Your Website Preview Is Ready
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Built from your Google reviews, market data, and what makes your business stand out.
          </p>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#212D40] px-5 py-3 text-sm font-semibold text-white hover:bg-[#212D40]/90 transition-colors"
            >
              Preview your site
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    );
  }

  // Case 3: Nothing yet
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 text-center">
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8">
        <Globe className="h-10 w-10 text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-[#212D40] mb-2">
          Your Alloro Website
        </h1>
        <p className="text-sm text-gray-500">
          Your website is being built. We'll notify you when it's ready for review.
        </p>
      </div>
    </div>
  );
}
