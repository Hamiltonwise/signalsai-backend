/**
 * MarketingFooter -- shared footer for all public marketing pages.
 *
 * Three columns: brand, links, contact/trust.
 */

import { Link } from "react-router-dom";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-gray-200 bg-[#FAFAF8] px-5 py-12">
      <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
        {/* Column 1: Logo + tagline */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-[#D56753] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[#212D40]">alloro</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Business Clarity for local service professionals.
          </p>
          <p className="mt-4 text-[10px] text-gray-400">
            &copy; 2026 Alloro, Inc. All rights reserved.
          </p>
        </div>

        {/* Column 2: Links */}
        <div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {[
              { label: "How it works", to: "/how-it-works" },
              { label: "Who it's for", to: "/who-its-for" },
              { label: "Pricing", to: "/pricing" },
              { label: "Our story", to: "/story" },
              { label: "Blog", to: "/blog" },
              { label: "Checkup", to: "/checkup" },
              { label: "Foundation", to: "/foundation" },
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
        </div>

        {/* Column 3: Contact + trust */}
        <div>
          <a
            href="mailto:corey@getalloro.com"
            className="text-xs font-medium text-[#D56753] hover:underline"
          >
            corey@getalloro.com
          </a>
          <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
            HIPAA-ready. No patient records. No contracts.
          </p>
          <div className="mt-3 h-0.5 w-16 bg-[#D56753] rounded-full opacity-40" />
        </div>
      </div>

      {/* Footer schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SiteNavigationElement",
            "name": "Alloro Footer Navigation",
            "url": "https://getalloro.com",
            "publisher": { "@id": "https://getalloro.com/#organization" },
          }),
        }}
      />
    </footer>
  );
}
