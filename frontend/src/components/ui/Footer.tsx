/**
 * Footer — consistent footer for all public pages.
 *
 * NOT shown on dashboard, admin, or checkup screens.
 * Terracotta/Navy. Mobile-first. Minimal.
 */

import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-[#FAFAF8] px-5 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Row 1: Brand */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#D56753] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[#212D40]">alloro</span>
          </div>
          <p className="text-xs text-gray-400">
            Business Clarity for local service businesses
          </p>
        </div>

        {/* Row 2: Navigation */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {[
            { label: "Checkup", to: "/checkup" },
            { label: "Pricing", to: "/pricing" },
            { label: "About", to: "/about" },
            { label: "Help", to: "/help" },
            { label: "Changelog", to: "/changelog" },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-xs font-medium text-gray-500 hover:text-[#212D40] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Row 3: Legal */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link to="/terms" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Terms
          </Link>
          <Link to="/privacy" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Privacy
          </Link>
          <span className="text-xs text-gray-300">
            &copy; 2026 Alloro, Inc. Bend, Oregon.
          </span>
        </div>

        {/* Row 4: Mission */}
        <p className="text-center">
          <Link
            to="/about"
            className="text-xs text-gray-300 hover:text-gray-500 transition-colors"
          >
            Built with purpose. 1% of revenue goes to community.
          </Link>
        </p>
      </div>
    </footer>
  );
}
