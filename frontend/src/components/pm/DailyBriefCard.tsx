import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { PmDailyBrief } from "../../types/pm";
import { fetchLatestBrief } from "../../api/pm";

function sanitizeBriefHtml(html: string): string {
  const div = document.createElement("div");
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const ALLOWED_TAGS = new Set(["P", "STRONG", "EM", "BR"]);

  function walk(node: Node, parent: HTMLElement) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(child.textContent || ""));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (ALLOWED_TAGS.has(el.tagName)) {
          const safe = document.createElement(el.tagName.toLowerCase());
          walk(el, safe);
          parent.appendChild(safe);
        } else {
          walk(el, parent);
        }
      }
    }
  }

  walk(doc.body, div);
  return div.innerHTML;
}

export function DailyBriefCard() {
  const [brief, setBrief] = useState<PmDailyBrief | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLatestBrief()
      .then(setBrief)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const sanitizedHtml = useMemo(
    () => (brief?.summary_html ? sanitizeBriefHtml(brief.summary_html) : ""),
    [brief?.summary_html]
  );

  if (isLoading) {
    return (
      <div
        className="animate-pulse rounded-xl p-6"
        style={{
          backgroundColor: "var(--color-pm-bg-secondary)",
          boxShadow: "var(--pm-shadow-card)",
        }}
      >
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-[var(--color-pm-bg-hover)]" />
          <div className="flex-1">
            <div className="h-4 w-28 rounded bg-[var(--color-pm-bg-hover)] mb-3" />
            <div className="h-3 w-full rounded bg-[var(--color-pm-bg-hover)] mb-2" />
            <div className="h-3 w-3/4 rounded bg-[var(--color-pm-bg-hover)]" />
          </div>
        </div>
      </div>
    );
  }

  const isToday = brief?.brief_date === new Date().toISOString().slice(0, 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative rounded-xl overflow-hidden"
      style={{
        backgroundColor: "var(--color-pm-bg-secondary)",
        boxShadow: "var(--pm-shadow-card)",
      }}
    >
      {/* Left accent border */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#D66853]" />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(135deg, var(--color-pm-accent-subtle2) 0%, transparent 60%)",
        }}
      />

      <div className="relative p-6">
        <div className="flex items-start gap-4">
          <div className="relative flex-shrink-0">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--color-pm-accent-subtle2)" }}
            >
              <Sparkles className="h-6 w-6 text-[#D66853]" strokeWidth={1.5} />
            </div>
            {/* Fresh indicator pulse */}
            {brief && isToday && (
              <motion.div
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#D66853]"
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3
              className="text-[15px] font-semibold mb-2"
              style={{ color: "var(--color-pm-text-primary)" }}
            >
              Daily Brief
            </h3>

            {!brief ? (
              <p
                className="text-sm leading-relaxed max-w-[600px]"
                style={{ color: "var(--color-pm-text-secondary)" }}
              >
                Your daily brief will appear here tomorrow morning. AI-generated
                insights about your projects, overdue tasks, and recommended focus areas.
              </p>
            ) : (
              <>
                {sanitizedHtml && (
                  <div
                    className="text-sm leading-relaxed max-w-[600px] mb-3 [&_p]:mb-1.5 [&_strong]:font-semibold"
                    style={{ color: "var(--color-pm-text-secondary)" }}
                    dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                  />
                )}

                {/* Stats badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {brief.tasks_completed_yesterday > 0 && (
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[rgba(61,139,64,0.1)] text-[#3D8B40]">
                      {brief.tasks_completed_yesterday} completed yesterday
                    </span>
                  )}
                  {brief.tasks_overdue > 0 && (
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[rgba(196,51,51,0.1)] text-[#C43333]">
                      {brief.tasks_overdue} overdue
                    </span>
                  )}
                  {brief.tasks_due_today > 0 && (
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[rgba(212,146,10,0.1)] text-[#D4920A]">
                      {brief.tasks_due_today} due today
                    </span>
                  )}
                </div>

                {/* Recommended focus */}
                {brief.recommended_tasks && brief.recommended_tasks.length > 0 && (
                  <div className="mb-3">
                    <p
                      className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2"
                      style={{ color: "var(--color-pm-text-muted)" }}
                    >
                      Recommended Focus
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {brief.recommended_tasks.map((rt, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors duration-150"
                          style={{
                            backgroundColor: "var(--color-pm-bg-hover)",
                          }}
                        >
                          <span
                            className="text-[12px] font-semibold"
                            style={{ color: "var(--color-pm-accent)" }}
                          >
                            {i + 1}.
                          </span>
                          <span
                            className="text-[13px] font-medium"
                            style={{ color: "var(--color-pm-text-primary)" }}
                          >
                            {rt.title}
                          </span>
                          <ChevronRight
                            className="h-3 w-3"
                            style={{ color: "var(--color-pm-text-muted)" }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Link
                  to="/admin/pm/briefs"
                  className="text-[12px] font-medium text-[#D66853] hover:text-[#C45A46] transition-colors duration-150"
                >
                  View history
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
