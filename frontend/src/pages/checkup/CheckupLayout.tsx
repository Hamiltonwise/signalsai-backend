import { Outlet } from "react-router-dom";

/**
 * Public layout for the Checkup flow — no sidebar, no auth.
 * Centered, mobile-first, branded.
 */
export default function CheckupLayout() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white flex flex-col">
      {/* Minimal branded header */}
      <header className="flex items-center justify-center pt-8 pb-4 px-4">
        <span className="text-[22px] font-bold tracking-tight text-slate-900">
          alloro
        </span>
      </header>

      {/* Flow content */}
      <main className="flex-1 flex flex-col items-center px-4 pb-8">
        <Outlet />
      </main>

      {/* Minimal footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-slate-400">
          Powered by Alloro &middot; Business Clarity
        </p>
      </footer>
    </div>
  );
}
