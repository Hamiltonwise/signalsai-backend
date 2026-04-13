/**
 * MarketingHeader -- shared navigation for all public marketing pages.
 *
 * Desktop: horizontal nav with logo left, links center, CTA right.
 * Mobile: hamburger revealing full menu, sticky CTA at bottom.
 */

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { trackEvent } from "../../api/tracking";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import { isSuperAdminEmail } from "../../constants/superAdmins";

const NAV_LINKS = [
  { label: "How It Works", to: "/how-it-works" },
  { label: "Heroes & Founders", to: "/foundation" },
  { label: "Our Story", to: "/story" },
  { label: "Blog", to: "/blog" },
];

export default function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isAuthenticated = !!getPriorityItem("auth_token") || !!getPriorityItem("token");
  const userEmail = getPriorityItem("user_email") || "";
  const dashboardPath = isSuperAdminEmail(userEmail) ? "/hq/command" : "/dashboard";

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 py-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#D56753] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight text-[#1A1D23]">
              alloro
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? "text-[#D56753]"
                    : "text-[#1A1D23]/70 hover:text-[#1A1D23]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          {isAuthenticated ? (
            <Link
              to={dashboardPath}
              className="hidden md:inline-flex items-center justify-center rounded-lg bg-[#212D40] text-white text-sm font-semibold px-5 py-2.5 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              to="/checkup"
              onClick={() => trackEvent("marketing.cta_click", { source: "header_desktop", page: location.pathname })}
              className="hidden md:inline-flex items-center justify-center rounded-lg bg-[#D56753] text-white text-sm font-semibold px-5 py-2.5 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Free Checkup
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 text-[#1A1D23]"
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden border-t border-gray-100 bg-white px-5 pb-4 max-h-[calc(100dvh-60px)] overflow-y-auto">
            <nav className="flex flex-col gap-1 pt-2">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className={`py-2.5 text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? "text-[#D56753]"
                      : "text-[#1A1D23]/70"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 px-5 py-3">
        {isAuthenticated ? (
          <Link
            to={dashboardPath}
            className="flex items-center justify-center rounded-lg bg-[#212D40] text-white text-sm font-semibold px-5 py-3 w-full hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Go to Dashboard
          </Link>
        ) : (
          <Link
            to="/checkup"
            onClick={() => trackEvent("marketing.cta_click", { source: "header_mobile", page: location.pathname })}
            className="flex items-center justify-center rounded-lg bg-[#D56753] text-white text-sm font-semibold px-5 py-3 w-full hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Free Checkup
          </Link>
        )}
      </div>
    </>
  );
}
