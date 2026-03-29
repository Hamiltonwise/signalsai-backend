/**
 * DynamicArticle -- /blog/:slug
 *
 * Renders published content fetched from /api/content/:slug.
 * Includes Article JSON-LD, FAQPage schema, OG meta tags,
 * and a Checkup CTA at the bottom.
 * Shows 404 if content not found.
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

interface FaqItem {
  question: string;
  answer: string;
}

interface ArticleData {
  id: number;
  slug: string;
  title: string;
  body: string;
  metaDescription: string;
  faqItems: FaqItem[];
  category: string;
  authorName: string;
  publishedAt: string;
  updatedAt: string;
}

export default function DynamicArticle() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/content/${slug}`)
      .then((res) => {
        if (!res.ok) {
          setNotFound(true);
          setLoading(false);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setArticle(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <MarketingLayout title="Loading..." description="">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#D56753]" />
        </div>
      </MarketingLayout>
    );
  }

  if (notFound || !article) {
    return (
      <MarketingLayout
        title="Article Not Found"
        description="This article does not exist."
      >
        <section className="px-5 py-24 sm:py-32">
          <div className="max-w-md mx-auto text-center">
            <p className="text-7xl font-black text-[#212D40]/10 mb-4">404</p>
            <h1 className="text-2xl font-bold text-[#212D40] mb-4">
              This article does not exist.
            </h1>
            <p className="text-base text-[#212D40]/60 mb-8">
              Run your free Checkup while you are here.
            </p>
            <Link
              to="/checkup"
              className="inline-flex items-center justify-center rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              See where you rank
            </Link>
          </div>
        </section>
      </MarketingLayout>
    );
  }

  const publishedDate = article.publishedAt
    ? new Date(article.publishedAt).toISOString().split("T")[0]
    : "";
  const displayDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      })
    : "";

  // Simple markdown-to-HTML: headings, paragraphs, bold, italic, lists
  const renderBody = (body: string) => {
    const lines = body.split("\n");
    const elements: JSX.Element[] = [];
    let inList = false;
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc pl-6 space-y-2">
            {listItems.map((item, i) => (
              <li key={i} className="text-base text-[#212D40]/80 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: inlineFormat(item) }}
              />
            ))}
          </ul>
        );
        listItems = [];
        inList = false;
      }
    };

    const inlineFormat = (text: string) => {
      return text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        continue;
      }

      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        inList = true;
        listItems.push(trimmed.slice(2));
        continue;
      }

      flushList();

      if (trimmed.startsWith("### ")) {
        elements.push(
          <h3 key={elements.length} className="text-lg font-bold text-[#212D40] pt-4">
            {trimmed.slice(4)}
          </h3>
        );
      } else if (trimmed.startsWith("## ")) {
        elements.push(
          <h2 key={elements.length} className="text-xl font-bold text-[#212D40] pt-4">
            {trimmed.slice(3)}
          </h2>
        );
      } else if (trimmed.startsWith("# ")) {
        elements.push(
          <h2 key={elements.length} className="text-xl font-bold text-[#212D40] pt-4">
            {trimmed.slice(2)}
          </h2>
        );
      } else {
        elements.push(
          <p key={elements.length} className="text-base text-[#212D40]/80 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }}
          />
        );
      }
    }

    flushList();
    return elements;
  };

  // Build JSON-LD schema
  const schemaGraph: any[] = [
    {
      "@id": "https://getalloro.com/#organization",
      "@type": "Organization",
      name: "Alloro",
    },
    {
      "@type": "Article",
      headline: article.title,
      description: article.metaDescription || "",
      url: `https://getalloro.com/blog/${article.slug}`,
      publisher: { "@id": "https://getalloro.com/#organization" },
      author: { "@type": "Person", name: article.authorName || "Alloro Intelligence" },
      datePublished: publishedDate,
      dateModified: article.updatedAt
        ? new Date(article.updatedAt).toISOString().split("T")[0]
        : publishedDate,
    },
  ];

  if (article.faqItems && article.faqItems.length > 0) {
    schemaGraph.push({
      "@type": "FAQPage",
      mainEntity: article.faqItems.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    });
  }

  return (
    <MarketingLayout
      title={article.title}
      description={article.metaDescription || ""}
      ogType="article"
    >
      <article className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <header className="mb-12">
          {article.category && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#D56753]">
              {article.category}
            </span>
          )}
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-[#212D40] leading-tight tracking-tight">
            {article.title}
          </h1>
          {displayDate && (
            <p className="mt-4 text-base text-[#212D40]/50">{displayDate}</p>
          )}
          {article.authorName && (
            <p className="mt-1 text-sm text-[#212D40]/40">
              By {article.authorName}
            </p>
          )}
        </header>

        <div className="space-y-6">{renderBody(article.body)}</div>

        {/* FAQ section if present */}
        {article.faqItems && article.faqItems.length > 0 && (
          <div className="mt-12 border-t border-gray-200 pt-8">
            <h2 className="text-xl font-bold text-[#212D40] mb-6">
              Frequently Asked Questions
            </h2>
            <div className="space-y-6">
              {article.faqItems.map((faq, i) => (
                <div key={i}>
                  <h3 className="text-base font-semibold text-[#212D40]">
                    {faq.question}
                  </h3>
                  <p className="mt-2 text-sm text-[#212D40]/70 leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checkup CTA */}
        <div className="mt-12 rounded-2xl bg-[#D56753]/5 border border-[#D56753]/20 p-8 text-center">
          <p className="text-base font-bold text-[#212D40] mb-2">
            Curious what your business is saying?
          </p>
          <p className="text-sm text-[#212D40]/50 mb-4">
            See where you rank. 60 seconds. Free.
          </p>
          <Link
            to="/checkup"
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See my market
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Back to blog */}
        <div className="mt-8 text-center">
          <Link
            to="/blog"
            className="text-sm text-[#D56753] font-medium hover:underline"
          >
            &larr; All posts
          </Link>
        </div>
      </article>

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": schemaGraph,
          }),
        }}
      />
    </MarketingLayout>
  );
}
