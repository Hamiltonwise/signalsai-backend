/**
 * MarketingLayout -- wraps all public marketing pages with
 * shared header, footer, and canonical/OG meta.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import MarketingHeader from "./MarketingHeader";
import MarketingFooter from "./MarketingFooter";

interface MarketingLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  canonical?: string;
  ogType?: string;
}

const BASE_URL = "https://getalloro.com";

export default function MarketingLayout({
  children,
  title,
  description,
  canonical,
  ogType = "website",
}: MarketingLayoutProps) {
  const location = useLocation();
  const pageUrl = canonical || `${BASE_URL}${location.pathname}`;

  useEffect(() => {
    document.title = `${title} | Alloro`;

    // Set or update meta tags
    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setMetaName = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMetaName("description", description);
    setMeta("og:title", title);
    setMeta("og:description", description);
    setMeta("og:url", pageUrl);
    setMeta("og:type", ogType);
    setMeta("og:image", `${BASE_URL}/og-alloro.png`);
    setMeta("og:site_name", "Alloro");

    // Canonical link
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", pageUrl);

    return () => {
      document.title = "Alloro";
    };
  }, [title, description, pageUrl, ogType]);

  return (
    <div className="min-h-dvh bg-[#FAFAF8] flex flex-col">
      <MarketingHeader />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <MarketingFooter />
    </div>
  );
}
