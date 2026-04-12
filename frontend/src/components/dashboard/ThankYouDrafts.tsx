/**
 * Thank-You Drafts -- Referral Hub component (WO-47)
 *
 * Shows pending auto-draft thank-you notes for referring GPs.
 * Doctor can send via email, edit, or skip.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Edit3, Send, Check } from "lucide-react";
import { apiGet, apiPost } from "../../api/index";

interface Draft {
  id: string;
  gp_name: string;
  patient_initials: string | null;
  body: string;
  status: string;
}

export default function ThankYouDrafts() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["thank-you-drafts"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/referral-thank-you/drafts" });
      return res?.success ? (res.drafts as Draft[]) : [];
    },
    staleTime: 5 * 60_000,
  });

  const drafts = data || [];
  if (drafts.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#D56753]">
        Thank-you drafts
      </p>
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} onAction={() => queryClient.invalidateQueries({ queryKey: ["thank-you-drafts"] })} />
      ))}
    </div>
  );
}

function DraftCard({ draft, onAction }: { draft: Draft; onAction: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(draft.body);
  const [sent, setSent] = useState(false);
  const [gpEmail, setGpEmail] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async () => {
      return apiPost({
        path: "/user/referral-thank-you/send",
        passedData: { draftId: draft.id, method: "email", gpEmail: gpEmail || undefined },
      });
    },
    onSuccess: () => { setSent(true); setTimeout(onAction, 1500); },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      return apiPost({ path: "/user/referral-thank-you/skip", passedData: { draftId: draft.id } });
    },
    onSuccess: onAction,
  });

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2">
        <Check className="w-4 h-4 text-emerald-600" />
        <p className="text-sm font-medium text-emerald-700">Sent to {draft.gp_name}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200/60 bg-stone-50/80 p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-[#1A1D23]">
          Thank-you to {draft.gp_name}
        </p>
        <span className="text-xs font-semibold uppercase tracking-wider text-[#D56753] bg-[#D56753]/10 px-2 py-0.5 rounded-full">
          Draft
        </span>
      </div>

      {editing ? (
        <textarea
          value={editedBody}
          onChange={(e) => setEditedBody(e.target.value)}
          rows={4}
          className="w-full text-sm text-[#1A1D23] border border-gray-200 rounded-lg px-3 py-2 focus:border-[#D56753] focus:outline-none focus:ring-2 focus:ring-[#D56753]/10 resize-none mb-3"
        />
      ) : (
        <p className="text-sm text-[#1A1D23]/70 leading-relaxed mb-3 italic">
          &ldquo;{draft.body}&rdquo;
        </p>
      )}

      {showEmailInput && (
        <div className="mb-3">
          <input
            type="email"
            value={gpEmail}
            onChange={(e) => setGpEmail(e.target.value)}
            placeholder={`${draft.gp_name}'s email`}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-[#D56753] focus:outline-none focus:ring-2 focus:ring-[#D56753]/10"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (!showEmailInput) { setShowEmailInput(true); return; }
            sendMutation.mutate();
          }}
          disabled={sendMutation.isPending}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D56753] hover:text-[#c45a48] transition-colors"
        >
          <Send className="w-3 h-3" />
          {sendMutation.isPending ? "Sending..." : showEmailInput ? "Send" : "Send via email"}
        </button>
        <button
          onClick={() => setEditing(!editing)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-500 transition-colors"
        >
          <Edit3 className="w-3 h-3" />
          {editing ? "Done" : "Edit"}
        </button>
        <button
          onClick={() => skipMutation.mutate()}
          disabled={skipMutation.isPending}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-500 transition-colors ml-auto"
        >
          <X className="w-3 h-3" />
          Skip
        </button>
      </div>
    </div>
  );
}
