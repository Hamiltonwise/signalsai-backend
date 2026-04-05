import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";

interface Article {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
}

const CATEGORIES = [
  "All",
  "Readings",
  "Pages",
  "Features",
  "Getting Started",
  "Troubleshooting",
] as const;

type Category = (typeof CATEGORIES)[number];

export default function HelpPage() {
  useAuth(); // ensures authenticated
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["help-articles", searchQuery],
    queryFn: () =>
      apiGet({
        path: `/user/help-articles${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`,
      }),
  });

  const articles: Article[] = data?.success ? data.articles : [];

  const filtered =
    activeCategory === "All"
      ? articles
      : articles.filter((a) => a.category === activeCategory);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#F8F6F2]"
    >
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[#1A1D23]">
            Help Center
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Find answers about your readings, features, and how Alloro works.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#1A1D23] placeholder:text-gray-400 focus:border-[#D56753] focus:outline-none transition-colors"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeCategory === cat
                  ? "bg-[#D56753]/10 text-[#D56753]"
                  : "text-gray-500 hover:text-[#1A1D23] hover:bg-stone-100/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Articles */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 sm:p-6">
              <p className="text-sm text-gray-400">Loading articles...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 sm:p-6 text-center">
              <p className="text-sm text-gray-500">
                {searchQuery
                  ? "No articles match your search. Try a different term."
                  : "No articles available in this category yet."}
              </p>
            </div>
          ) : (
            filtered.map((article) => {
              const isOpen = expandedIds.has(article.id);
              return (
                <div
                  key={article.id}
                  className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden"
                >
                  <button
                    onClick={() => toggleExpanded(article.id)}
                    className="w-full flex items-start gap-3 px-5 sm:px-6 py-4 text-left hover:bg-stone-100/50 transition-colors"
                  >
                    <span className="mt-0.5 shrink-0 text-gray-400">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                          {article.category}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-[#1A1D23]">
                        {article.title}
                      </h3>
                      {!isOpen && (
                        <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                          {article.summary}
                        </p>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="px-5 sm:px-6 pb-5 sm:pb-6 pt-0 ml-7"
                    >
                      <p className="text-sm text-gray-500 mb-3">
                        {article.summary}
                      </p>
                      <div className="rounded-xl bg-[#F0EDE8] p-4">
                        <div
                          className="text-sm text-[#1A1D23]/60 leading-relaxed whitespace-pre-line"
                          dangerouslySetInnerHTML={{ __html: article.body }}
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}
