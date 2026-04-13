/**
 * Kill Switch Banner -- Emergency Agent Stop
 *
 * Displays in all admin views (VisionaryView, IntegratorView, BuildView).
 * When active: red banner with reason and deactivate button.
 * When inactive: small red emergency button in sticky header.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/api/index";
import { AlertTriangle, Power, ShieldOff } from "lucide-react";

interface KillSwitchStatus {
  active: boolean;
  reason?: string;
  activatedAt?: string;
  activatedBy?: string;
}

export function KillSwitchBanner() {
  const queryClient = useQueryClient();
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [reason, setReason] = useState("");

  const { data: status } = useQuery<KillSwitchStatus>({
    queryKey: ["kill-switch-status"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/kill-switch/status" });
      return res?.success ? res : { active: false };
    },
    refetchInterval: 10_000, // Poll every 10s for real-time status
    retry: false,
  });

  const activateMutation = useMutation({
    mutationFn: async (activateReason: string) => {
      return apiPost({ path: "/admin/kill-switch/activate", passedData: { reason: activateReason } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kill-switch-status"] });
      setShowActivateDialog(false);
      setReason("");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      return apiPost({ path: "/admin/kill-switch/deactivate", passedData: {} });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kill-switch-status"] });
    },
  });

  const isActive = status?.active ?? false;

  return (
    <>
      {/* Active banner */}
      {isActive && (
        <div className="sticky top-0 z-50 bg-red-600 text-white px-4 py-3 flex items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
            <div>
              <span className="font-semibold text-sm">KILL SWITCH ACTIVE</span>
              {status?.reason && (
                <span className="text-sm text-red-100 ml-2">
                  {status.reason}
                </span>
              )}
              {status?.activatedBy && (
                <span className="text-xs text-red-200 ml-2">
                  by {status.activatedBy}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => deactivateMutation.mutate()}
            disabled={deactivateMutation.isPending}
            className="px-4 py-1.5 bg-white text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
          </button>
        </div>
      )}

      {/* Inactive: emergency button */}
      {!isActive && (
        <div className="sticky top-0 z-50 flex justify-end px-4 py-2 pointer-events-none">
          <button
            onClick={() => setShowActivateDialog(true)}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-lg"
            title="Emergency: Stop all agents"
          >
            <Power className="w-3.5 h-3.5" />
            Kill Switch
          </button>
        </div>
      )}

      {/* Activate dialog */}
      {showActivateDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <ShieldOff className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Activate Kill Switch</h3>
                <p className="text-sm text-slate-500">This will halt ALL agent execution</p>
              </div>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for emergency stop..."
              className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowActivateDialog(false); setReason(""); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => reason.trim() && activateMutation.mutate(reason.trim())}
                disabled={!reason.trim() || activateMutation.isPending}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {activateMutation.isPending ? "Activating..." : "Activate Kill Switch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
