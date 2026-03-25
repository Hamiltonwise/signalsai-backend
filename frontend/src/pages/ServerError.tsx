/**
 * 500 — Server error.
 * "Something went wrong on our end. We've been notified."
 */

import { RefreshCw } from "lucide-react";

export default function ServerError() {
  return (
    <div className="min-h-dvh bg-[#FAFAF8] flex flex-col items-center justify-center px-5 text-center">
      <p className="text-7xl font-black text-[#D56753]/10 mb-4">500</p>
      <h1 className="text-2xl font-bold text-[#212D40]">Something went wrong on our end.</h1>
      <p className="text-base text-gray-500 mt-2 max-w-sm">
        We've been notified and are looking into it.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-6 py-3 text-sm font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
      <a
        href="/dashboard"
        className="mt-3 text-sm text-gray-400 hover:text-[#212D40] transition-colors"
      >
        Go to dashboard
      </a>
    </div>
  );
}
