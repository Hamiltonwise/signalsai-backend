import { Outlet } from "react-router-dom";

/**
 * Public layout for the Checkup flow — no sidebar, no auth.
 * Centered, mobile-first, branded. $2,000/month product feel.
 */
export default function CheckupLayout() {
  return (
    <div className="min-h-dvh bg-[#F7F8FA] flex flex-col">
      {/* Branded header — Navy wordmark with Terracotta accent */}
      <header className="flex items-center justify-center pt-10 pb-6 px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <span className="text-[22px] font-bold tracking-tight text-[#1A1D23]">
            alloro
          </span>
        </div>
      </header>

      {/* Flow content */}
      <main className="flex-1 flex flex-col items-center px-5 pb-10">
        <Outlet />
      </main>

      {/* Refined footer */}
      <footer className="py-8 text-center">
        <div className="h-px divider-warm mx-auto max-w-[8rem] mb-6" />
        <p className="text-xs font-medium tracking-[0.15em] text-[#D56753]/25 uppercase">
          Alloro &middot; Business Clarity
        </p>
      </footer>
    </div>
  );
}
