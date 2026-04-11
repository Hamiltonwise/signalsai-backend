/**
 * PendingActionsCard -- The work Alloro did, waiting for one tap.
 *
 * This is what turns a monitoring tool into autopilot.
 * The owner opens the dashboard and sees: Alloro drafted a GBP post.
 * They read it. They tap Approve. It goes live. 30 seconds. Done.
 *
 * That's a $2K/mo product. Without this, it's a $200/mo dashboard.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Sparkles, FileText, Search } from "lucide-react";
import { apiGet } from "@/api/index";

interface PendingAction {
  id: string;
  action_type: string;
  status: string;
  preview_title: string;
  preview_body: string;
  approval_token: string;
  created_at: string;
  expires_at: string;
}

const ACTION_TYPE_CONFIG: Record<string, { label: string; icon: typeof Sparkles; color: string }> = {
  gbp_post: { label: "GBP Post", icon: Sparkles, color: "bg-[#D56753]/10 text-[#D56753]" },
  cro_title: { label: "SEO Title", icon: Search, color: "bg-blue-50 text-blue-600" },
  cro_meta: { label: "Meta Description", icon: FileText, color: "bg-blue-50 text-blue-600" },
};

function getActionConfig(type: string) {
  return ACTION_TYPE_CONFIG[type] || { label: "Action", icon: Sparkles, color: "bg-gray-100 text-gray-600" };
}

async function approveAction(token: string): Promise<{ status: string }> {
  const res = await fetch(`/api/actions/approve/${token}`, { method: "POST" });
  if (!res.ok) throw new Error("Approve failed");
  return res.json();
}

async function rejectAction(token: string): Promise<{ status: string }> {
  const res = await fetch(`/api/actions/reject/${token}`, { method: "POST" });
  if (!res.ok) throw new Error("Reject failed");
  return res.json();
}

export default function PendingActionsCard({ orgId }: { orgId: number }) {
  const queryClient = useQueryClient();
  const [actionStates, setActionStates] = useState<Record<string, "approving" | "approved" | "rejecting" | "rejected">>({});

  const { data, isLoading } = useQuery<{ actions: PendingAction[] }>({
    queryKey: ["pending-actions", orgId],
    queryFn: () => apiGet({ path: `/actions/pending/${orgId}` }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const approveMutation = useMutation({
    mutationFn: approveAction,
    onMutate: (token) => {
      setActionStates(prev => ({ ...prev, [token]: "approving" }));
    },
    onSuccess: (_, token) => {
      setActionStates(prev => ({ ...prev, [token]: "approved" }));
      // Refetch after a moment so the card can show the success state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["pending-actions", orgId] });
      }, 2000);
    },
    onError: (_, token) => {
      setActionStates(prev => {
        const next = { ...prev };
        delete next[token];
        return next;
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectAction,
    onMutate: (token) => {
      setActionStates(prev => ({ ...prev, [token]: "rejecting" }));
    },
    onSuccess: (_, token) => {
      setActionStates(prev => ({ ...prev, [token]: "rejected" }));
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["pending-actions", orgId] });
      }, 1500);
    },
  });

  const actions = data?.actions || [];

  // Don't render anything if no pending actions
  if (isLoading || actions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="mb-8"
    >
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#D56753]/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[#D56753]" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#D56753]">
            Drafts for You
          </p>
          <p className="text-sm text-gray-500">
            Alloro prepared {actions.length === 1 ? "1 action" : `${actions.length} actions`}. One tap to go live.
          </p>
        </div>
      </div>

      {/* Action cards */}
      <div className="space-y-3">
        <AnimatePresence>
          {actions.map((action) => {
            const config = getActionConfig(action.action_type);
            const Icon = config.icon;
            const state = actionStates[action.approval_token];

            return (
              <motion.div
                key={action.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, height: 0 }}
                className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${
                  state === "approved"
                    ? "bg-emerald-50/50 border-emerald-200"
                    : state === "rejected"
                      ? "bg-stone-50/50 border-stone-200/40 opacity-60"
                      : "bg-stone-50/80 border-stone-200/60"
                }`}
              >
                <div className="p-6">
                  {/* Type badge */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${config.color}`}>
                      <Icon className="w-3 h-3" />
                      {config.label}
                    </span>
                    {state === "approved" && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <Check className="w-3.5 h-3.5" />
                        Published
                      </span>
                    )}
                    {state === "rejected" && (
                      <span className="text-xs text-gray-400">Skipped</span>
                    )}
                  </div>

                  {/* Title */}
                  <p className="text-base font-semibold text-[#1A1D23] leading-snug mb-2">
                    {action.preview_title}
                  </p>

                  {/* Preview body -- the actual content */}
                  <div className="rounded-xl bg-[#F8F6F2] p-4 mb-4">
                    <p className="text-sm text-[#1A1D23]/70 leading-relaxed whitespace-pre-line">
                      {action.preview_body}
                    </p>
                  </div>

                  {/* Approve / Skip buttons */}
                  {!state && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => approveMutation.mutate(action.approval_token)}
                        disabled={approveMutation.isPending}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D56753] text-white text-sm font-semibold hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate(action.approval_token)}
                        disabled={rejectMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Skip
                      </button>
                    </div>
                  )}

                  {/* Approving state */}
                  {state === "approving" && (
                    <div className="flex items-center gap-2 text-sm text-[#D56753] font-semibold">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-[#D56753] border-t-transparent rounded-full"
                      />
                      Publishing...
                    </div>
                  )}

                  {/* Success state */}
                  {state === "approved" && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 text-sm text-emerald-600 font-semibold"
                    >
                      <Check className="w-4 h-4" />
                      Done. This is live on your Google Business Profile.
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
