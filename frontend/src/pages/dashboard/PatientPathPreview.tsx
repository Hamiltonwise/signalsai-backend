/**
 * PatientPath Preview -- Conversion Anchor
 *
 * Shows the auto-generated website in a live preview.
 * Gated by billing status for the "Launch" action.
 *
 * Route: /dashboard/patientpath-preview
 */

import { useState, useEffect } from "react";
import { Globe, Loader2, ExternalLink, Lock, Wifi } from "lucide-react";

interface PatientPathData {
  status: string | null;
  previewUrl: string | null;
}

export default function PatientPathPreview() {
  const [data, setData] = useState<PatientPathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingActive, setBillingActive] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem("auth_token");
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const [ppRes, billingRes] = await Promise.all([
          fetch("/api/user/patientpath", { headers }),
          fetch("/api/billing/status", { headers }).catch(() => null),
        ]);

        if (ppRes.ok) {
          const ppData = await ppRes.json();
          setData({
            status: ppData.status || null,
            previewUrl: ppData.previewUrl || null,
          });
        }

        if (billingRes?.ok) {
          const bData = await billingRes.json();
          setBillingActive(
            bData.subscriptionStatus === "active" ||
              bData.subscriptionStatus === "trialing"
          );
        }
      } catch {
        /* non-critical */
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#D56753]" />
      </div>
    );
  }

  // No PatientPath data at all
  if (!data?.status && !data?.previewUrl) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
          <Wifi className="h-8 w-8 text-gray-400" />
        </div>
        <h1 className="mb-3 text-2xl font-semibold text-[#1A1D23]">
          Connect your Google Business Profile to get started
        </h1>
        <p className="mb-8 text-gray-500">
          Once connected, Alloro builds a custom website for your practice
          using your real data, reviews, and competitive positioning.
        </p>
        <a
          href="/settings/integrations"
          className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-6 py-3 text-sm font-semibold text-white hover:brightness-105 transition-all"
        >
          Connect GBP
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  // Building state
  if (data.status === "building" || data.status === "researching" || data.status === "generating") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D56753]/10">
          <Loader2 className="h-8 w-8 animate-spin text-[#D56753]" />
        </div>
        <h1 className="mb-3 text-2xl font-semibold text-[#1A1D23]">
          Your site is being built
        </h1>
        <p className="mb-2 text-gray-500">
          Alloro is researching your market, analyzing competitors,
          and generating content tailored to your practice. Check back soon.
        </p>
        <p className="text-sm text-gray-400">
          Status: <span className="font-medium text-[#D56753]">{data.status}</span>
        </p>
      </div>
    );
  }

  // Preview ready
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1D23]">Your Website</h1>
          <p className="text-sm text-gray-500 mt-1">
            Built from your real data. Preview below, launch when ready.
          </p>
        </div>

        {billingActive ? (
          <a
            href={data.previewUrl || "/dashboard/website"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-6 py-3 text-sm font-semibold text-white hover:brightness-105 transition-all"
          >
            <Globe className="h-4 w-4" />
            Launch Your Site
          </a>
        ) : (
          <a
            href="/settings/billing"
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-6 py-3 text-sm font-semibold text-white hover:brightness-105 transition-all"
          >
            <Lock className="h-4 w-4" />
            Add payment to go live
          </a>
        )}
      </div>

      {data.previewUrl ? (
        <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
            </div>
            <div className="ml-2 flex-1 rounded-md bg-white px-3 py-1 text-xs text-gray-400 border border-gray-100">
              {data.previewUrl}
            </div>
          </div>
          <iframe
            src={data.previewUrl}
            className="h-[70vh] w-full border-0"
            title="Website Preview"
          />
        </div>
      ) : (
        <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50">
          <p className="text-gray-400">Preview loading...</p>
        </div>
      )}
    </div>
  );
}
