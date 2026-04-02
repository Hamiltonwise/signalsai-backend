/**
 * TailorToggle -- sidebar footer toggle for Tailor mode.
 *
 * Only renders for super admin users. Sits above the user profile card in the sidebar.
 */

import { Scissors } from "lucide-react";
import { useTailor } from "../contexts/TailorContext";

interface TailorToggleProps {
  minimized?: boolean;
}

export function TailorToggle({ minimized = false }: TailorToggleProps) {
  const { isTailorMode, isSuperAdmin, toggleTailorMode } = useTailor();

  if (!isSuperAdmin) return null;

  if (minimized) {
    return (
      <button
        onClick={toggleTailorMode}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
          isTailorMode
            ? "bg-[#D56753]/20 text-[#D56753] border border-[#D56753]/40"
            : "bg-white/5 text-white/30 hover:text-white/60 border border-white/10"
        }`}
        title={isTailorMode ? "Exit Tailor Mode" : "Enter Tailor Mode"}
      >
        <Scissors size={14} />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTailorMode}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-left ${
        isTailorMode
          ? "bg-[#D56753]/15 text-[#D56753] border border-[#D56753]/30"
          : "bg-white/5 text-white/30 hover:text-white/60 hover:bg-white/10 border border-transparent"
      }`}
    >
      <Scissors size={14} className="shrink-0" />
      <span className="text-xs font-bold uppercase tracking-wider">
        {isTailorMode ? "Tailor On" : "Tailor"}
      </span>
    </button>
  );
}
