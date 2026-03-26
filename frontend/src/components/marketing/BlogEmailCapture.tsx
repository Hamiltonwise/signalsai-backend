/**
 * BlogEmailCapture -- "Get the Monday Brief" email signup.
 * Embedded at the bottom of each blog post.
 * Fires POST /api/checkup/email with minimal data to start the relationship.
 */

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { trackEvent } from "../../api/tracking";

export default function BlogEmailCapture() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const res = await fetch("/api/checkup/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          practiceName: "Blog subscriber",
          city: "",
          compositeScore: 0,
          topCompetitorName: null,
          topCompetitorReviews: null,
          practiceReviews: 0,
          finding: "Subscribed via blog post",
          rank: 0,
          totalCompetitors: 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        trackEvent("marketing.blog_email_capture", { email_domain: email.split("@")[1] });
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-2xl bg-[#212D40] p-8 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
        <p className="text-base font-bold text-white">You're in.</p>
        <p className="text-sm text-white/50 mt-2">
          Your first Monday Brief arrives next Monday at 7am.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#212D40] p-8">
      <p className="text-base font-bold text-white text-center mb-1">
        Get the Monday Brief
      </p>
      <p className="text-sm text-white/50 text-center mb-5">
        One finding. One action. Every Monday morning.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourpractice.com"
          required
          className="flex-1 rounded-lg bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#D56753] transition-colors"
        />
        <button
          type="submit"
          disabled={submitting}
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-[#D56753] text-white text-sm font-semibold px-5 py-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {submitting ? "Sending..." : "Subscribe"}
          {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
        </button>
      </form>
      {error && (
        <p className="mt-3 text-xs text-red-400 text-center">
          Something went wrong. Try again.
        </p>
      )}
      <p className="mt-4 text-[10px] text-white/30 text-center">
        No spam. Unsubscribe anytime. Your inbox, your rules.
      </p>
    </div>
  );
}
