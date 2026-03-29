/**
 * PatientPath Website — /dashboard/website
 * Shows website status, preview link, or a "being built" message.
 */

import { Globe, ExternalLink, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/index";
import { useAuth } from "../../hooks/useAuth";

interface WebsiteInfo {
  generated_hostname: string;
  status: string;
  liveUrl?: string;
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

    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <Globe className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-[#212D40] mb-2">
            Your PatientPath Website
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {websiteData.generated_hostname}
          </p>
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#212D40] px-5 py-3 text-sm font-semibold text-white hover:bg-[#212D40]/90 transition-colors"
          >
            View your site
            <ExternalLink className="h-4 w-4" />
          </a>
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
            Our team is researching your business and building your site. This usually takes less than 24 hours.
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
            Take a look and let us know if you'd like any changes.
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
          Your PatientPath Website
        </h1>
        <p className="text-sm text-gray-500">
          Your website is being built. We'll notify you when it's ready for review.
        </p>
      </div>
    </div>
  );
}
