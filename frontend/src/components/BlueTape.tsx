/**
 * BlueTape -- Jo's punch list. Walk the room, mark what's wrong.
 *
 * Named after the blue painter's tape used in construction punch lists.
 * Walk through a new building, stick tape on anything that needs fixing.
 * Come back later with the list.
 *
 * For Jo, Shawn, and Corey: toggle BlueTape mode from the sidebar.
 * Click anywhere on any page. A small blue flag appears where you clicked.
 * Type a note. It saves with full context (page, coordinates, viewport,
 * user, timestamp). The flags persist across sessions.
 *
 * All flags flow to a single "Punch List" board visible in admin.
 * Jo processes them. Dave picks up the technical ones. The dream team
 * handles the rest.
 *
 * NOT for customers. This is the internal quality system.
 * Customers use the HelpButton.
 * The team uses BlueTape.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Flag, X, Send, CheckCircle2 } from "lucide-react";
import { apiPost, apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { isSuperAdminEmail } from "@/constants/superAdmins";

interface BlueTapeFlag {
  id?: string;
  x: number;
  y: number;
  page: string;
  note: string;
  author: string;
  status: "open" | "fixed";
  createdAt: string;
}

export function useBlueTapeMode() {
  const [active, setActive] = useState(false);
  const toggle = useCallback(() => setActive((a) => !a), []);
  return { active, toggle };
}

interface BlueTapeOverlayProps {
  active: boolean;
}

export function BlueTapeOverlay({ active }: BlueTapeOverlayProps) {
  const [flags, setFlags] = useState<BlueTapeFlag[]>([]);
  const [placingFlag, setPlacingFlag] = useState<{ x: number; y: number } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { userProfile } = useAuth();
  const location = useLocation();
  const noteRef = useRef<HTMLInputElement>(null);

  const isAdmin = userProfile?.email && isSuperAdminEmail(userProfile.email);
  if (!isAdmin) return null;

  // Load existing flags for current page
  useEffect(() => {
    if (!active) return;
    apiGet({ path: `/admin/blue-tape?page=${encodeURIComponent(location.pathname)}` })
      .then((res: any) => {
        if (res?.flags) setFlags(res.flags);
      })
      .catch(() => {});
  }, [active, location.pathname]);

  // Handle click to place flag
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!active) return;

      // Don't place flags on the BlueTape UI itself
      const target = e.target as HTMLElement;
      if (target.closest("[data-bluetape]")) return;

      const rect = document.documentElement;
      const x = Math.round((e.clientX / rect.clientWidth) * 100);
      const y = Math.round((e.clientY / window.innerHeight) * 100);

      setPlacingFlag({ x, y });
      setNote("");
      setTimeout(() => noteRef.current?.focus(), 100);
    },
    [active],
  );

  const handleSave = async () => {
    if (!note.trim() || !placingFlag) return;
    setSaving(true);

    const flag: BlueTapeFlag = {
      x: placingFlag.x,
      y: placingFlag.y,
      page: location.pathname,
      note: note.trim(),
      author: userProfile?.email || "unknown",
      status: "open",
      createdAt: new Date().toISOString(),
    };

    try {
      await apiPost({
        path: "/admin/blue-tape",
        passedData: flag,
      });
      setFlags((prev) => [...prev, flag]);
    } catch {
      // Still add locally even if API fails
      setFlags((prev) => [...prev, flag]);
    }

    setPlacingFlag(null);
    setNote("");
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-40"
      style={{ cursor: "crosshair" }}
      onClick={handleClick}
      data-bluetape
    >
      {/* Blue tape indicator bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-blue-500 text-white text-center py-1.5 text-xs font-semibold" data-bluetape>
        Blue Tape Mode: Click anywhere to flag an issue. Click the X to exit.
      </div>

      {/* Existing flags */}
      {flags.map((flag, i) => (
        <div
          key={i}
          className="absolute z-45"
          style={{ left: `${flag.x}%`, top: `${flag.y}%` }}
          data-bluetape
        >
          <div className="relative group">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
              flag.status === "fixed" ? "bg-emerald-500" : "bg-blue-500"
            } shadow-sm`}>
              <Flag className="w-3 h-3 text-white" />
            </div>
            {/* Tooltip on hover */}
            <div className="hidden group-hover:block absolute left-6 top-0 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56 z-50">
              <p className="text-xs text-[#1A1D23]">{flag.note}</p>
              <p className="text-xs text-gray-400 mt-1">{flag.author} -- {new Date(flag.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Flag placement popup */}
      {placingFlag && (
        <div
          className="absolute z-50"
          style={{
            left: `${Math.min(placingFlag.x, 70)}%`,
            top: `${Math.min(placingFlag.y, 80)}%`,
          }}
          data-bluetape
        >
          <div className="bg-white border-2 border-blue-400 rounded-xl shadow-xl p-3 w-64">
            <div className="flex items-center gap-2 mb-2">
              <Flag className="w-4 h-4 text-blue-500" />
              <p className="text-xs font-semibold text-[#1A1D23]">Flag this spot</p>
            </div>
            <input
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setPlacingFlag(null);
              }}
              placeholder="What's wrong here?"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
            <div className="flex justify-between mt-2">
              <button
                onClick={(e) => { e.stopPropagation(); setPlacingFlag(null); }}
                className="text-xs text-gray-400 hover:text-gray-600"
                data-bluetape
              >
                Cancel
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleSave(); }}
                disabled={!note.trim() || saving}
                className="text-xs font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg disabled:opacity-40"
                data-bluetape
              >
                {saving ? "Saving..." : "Flag it"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved confirmation */}
      {saved && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2 shadow-lg" data-bluetape>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <p className="text-sm text-emerald-700">Flagged</p>
        </div>
      )}
    </div>
  );
}
