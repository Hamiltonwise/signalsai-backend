/**
 * GBPConnectCard -- Optional Enhancement
 *
 * Shows when gbp_access_token is null on the org.
 * Checkup intelligence is already displayed without GBP.
 * GBP connection adds live ranking tracking and review alerts.
 * One button: "Connect Google" -- redirects to /api/auth/google.
 * Disappears permanently once connected. Never shows again.
 */

import { ExternalLink } from "lucide-react";
import { TailorText } from "../TailorText";

interface GBPConnectCardProps {
  gbpConnected: boolean;
  orgId: number | null;
}

export default function GBPConnectCard({ gbpConnected, orgId }: GBPConnectCardProps) {
  // Once connected, this card never renders
  if (gbpConnected || !orgId) return null;

  return (
    <div className="card-supporting">
      <div className="flex items-start gap-4">
        {/* Google icon */}
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <TailorText editKey="dashboard.gbp.title" defaultText="Go deeper with live Google data" as="p" className="text-sm font-semibold text-[#1A1D23]" />
          <TailorText editKey="dashboard.gbp.body" defaultText="Your checkup already mapped your market. Connect Google to add live ranking tracking, review alerts, and automatic website updates." as="p" className="text-sm text-gray-500 mt-1 leading-relaxed" />

          <a
            href={`/api/auth/google?orgId=${orgId}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#212D40] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#212D40]/90 transition-colors"
          >
            Connect Google
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
