/**
 * Trial Email Preview -- /admin/trial-emails
 *
 * Corey previews and approves the 7 trial emails before Dave wires n8n.
 * Each card shows the email with AAE demo account data filled in.
 * "Copy n8n template" copies the field structure for Dave.
 */

import { useState } from "react";
import {
  Mail,
  Copy,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Demo Data (Mountain View Endodontics) ──────────────────────────

const DEMO = {
  practice_name: "Mountain View Endodontics",
  last_name: "Mitchell",
  specialty: "endodontist",
  city: "Salt Lake City",
  ranking_position: 3,
  total_competitors: 9,
  top_competitor_name: "Valley Endodontics SLC",
  primary_gap: "you have 34 reviews. The #1 ranked practice has 61. That gap is closeable in 90 days.",
  preview_url: "https://getalloro.com/p/mountain-view-endo",
  referral_code: "D2MMXH74",
};

// ─── Email Definitions ──────────────────────────────────────────────

interface TrialEmail {
  day: number;
  dayLabel: string;
  subject: string;
  body: string;
  live: boolean;
}

const EMAILS: TrialEmail[] = [
  {
    day: 0,
    dayLabel: "Day 0 (Immediate)",
    subject: `Your ${DEMO.specialty} website for ${DEMO.practice_name} is being prepared`,
    body: `Dr. ${DEMO.last_name} --

We ran ${DEMO.practice_name} through our market analysis. You're currently ranking #${DEMO.ranking_position} of ${DEMO.total_competitors} ${DEMO.specialty} practices in ${DEMO.city}. ${DEMO.top_competitor_name} holds position 1.

Your PatientPath website is being built now -- we pulled your information from your Google Business Profile and built you a starting point. You'll get a link when it's ready, usually within the hour.

While that's running, the one thing that will move your ranking faster than anything else: ${DEMO.primary_gap}.

More tomorrow.

Corey Wise
Founder, Alloro`,
    live: false,
  },
  {
    day: 1,
    dayLabel: "Day 1",
    subject: "Your PatientPath site is ready -- here's the link",
    body: `Dr. ${DEMO.last_name} --

Your PatientPath site for ${DEMO.practice_name} is live in preview:
${DEMO.preview_url}

Everything is editable -- hero text, photos, services, hours, doctor bio. It won't go live at your domain until you decide it's ready.

One thing worth knowing: we optimized the page structure for the search terms patients in ${DEMO.city} actually use when looking for a ${DEMO.specialty}. The practices ranking above you don't have this. You do now.

If anything looks off or you want to change something, reply to this email or open the editor directly.

Corey`,
    live: false,
  },
  {
    day: 2,
    dayLabel: "Day 2",
    subject: `${DEMO.top_competitor_name} made a move this week`,
    body: `Dr. ${DEMO.last_name} --

Alloro has been watching your market. One update worth knowing:

${DEMO.top_competitor_name} currently holds position #1 in ${DEMO.city}. They've added 8 reviews in the last 30 days. You've added 1.

That gap compounds. A practice that adds reviews consistently doesn't just rank higher -- they become the default choice for patients who search your specialty. Reversing a ranking gap is harder than preventing one.

Your trial includes 7 days of Alloro watching this for you. What it does about it is up to you.

Corey`,
    live: false,
  },
  {
    day: 3,
    dayLabel: "Day 3",
    subject: "What Alloro found in your market this week",
    body: `Dr. ${DEMO.last_name} --

Three things from your market scan this week:

1. Your GBP photo count is 8. The average for top-3 ranked practices in your market is 34.

2. Your website has no content mentioning dental trauma or root resorption -- two of the top search queries for endodontists in ${DEMO.city}.

3. ${DEMO.top_competitor_name} updated their GBP description this week. Their visibility for "emergency endodontist ${DEMO.city}" increased.

Alloro found these. It can also fix them. That's the difference between a report and a system.

Corey`,
    live: false,
  },
  {
    day: 5,
    dayLabel: "Day 5",
    subject: "Do you know another doctor flying blind?",
    body: `Dr. ${DEMO.last_name} --

Quick one.

If you know another doctor who would want to see what you've seen this week -- your ranking, your competitor data, your PatientPath site -- send them your link:

getalloro.com/checkup?ref=${DEMO.referral_code}

If they sign up, you both get a month free. No strings.

More importantly: your trial ends in 2 days. Before you decide anything, reply and tell me -- what's the one thing you'd want Alloro to do that it hasn't done yet? I read every reply.

Corey`,
    live: false,
  },
  {
    day: 6,
    dayLabel: "Day 6",
    subject: "Tomorrow is the last day of your trial",
    body: `Dr. ${DEMO.last_name} --

Your Alloro trial ends tomorrow.

Here's what happened in the last 6 days:

- Your ranking scan ran 6 times
- ${DEMO.top_competitor_name} added 3 reviews while you added 0
- Your PatientPath site is live in preview
- No competitor ranking changes detected

The question is simple: is the intelligence Alloro gave you this week worth $2,000/month?

If the answer is yes, your card gets charged tomorrow and everything keeps running.

If the answer is no, reply to this email before midnight tonight and I'll cancel it personally. No automated retention sequence. No guilt. You keep the PatientPath site we built.

Corey`,
    live: false,
  },
  {
    day: 7,
    dayLabel: "Day 7 (Convert / Cancel)",
    subject: "You're in. Here's what happens next.",
    body: `Dr. ${DEMO.last_name} --

Welcome to Alloro.

Here's what runs automatically every week without you doing anything:

- Proofline Agent monitors your market and flags changes
- PatientPath keeps your online presence optimized
- Your Monday brief lands with what moved and what it means

The one thing that would make this significantly more valuable: connecting your PMS so Alloro can see your referral data. Which GPs are sending patients. Which ones are fading. That takes 10 minutes and unlocks the most important intelligence Alloro can give you.

Corey

---

[Path B -- if no subscription]

Subject: Your trial ended -- one thing before you go

Your trial ended today. No hard feelings.

Your PatientPath site is still there -- you own everything we built. If you ever want to launch it, it's ready.

One question, genuinely: what would have made Alloro worth $2,000/month to you? I read every reply and I use the feedback to build the product.

Corey`,
    live: false,
  },
];

// ─── n8n Template ───────────────────────────────────────────────────

const N8N_PAYLOAD_SCHEMA = `{
  "trigger_event": "account_created",
  "webhook_url": "ALLORO_N8N_WEBHOOK_URL",
  "payload": {
    "practice_name": "string",
    "last_name": "string",
    "email": "string",
    "specialty": "string",
    "city": "string",
    "ranking_position": "number",
    "total_competitors": "number",
    "top_competitor_name": "string",
    "primary_gap": "string",
    "preview_url": "string",
    "referral_code": "string"
  },
  "schedule": {
    "email_1": "immediate",
    "email_2": "+24 hours",
    "email_3": "+48 hours",
    "email_4": "+72 hours",
    "email_5": "+120 hours",
    "email_6": "+144 hours",
    "email_7a": "trigger: subscription.created",
    "email_7b": "trigger: trial_end + no_subscription"
  },
  "sender": "Corey Wise <corey@getalloro.com>",
  "reply_to": "corey@getalloro.com",
  "provider": "Mailgun"
}`;

// ─── Component ──────────────────────────────────────────────────────

export default function TrialEmailPreview() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const copySchema = () => {
    navigator.clipboard.writeText(N8N_PAYLOAD_SCHEMA).then(() => {
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2000);
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-2">
          Trial Sequence
        </p>
        <h1 className="text-2xl font-extrabold text-[#212D40]">
          7-Day Trial Emails
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Preview with Mountain View Endodontics demo data. Copy templates
          for Dave to wire in n8n.
        </p>
      </div>

      {/* Email Cards */}
      <div className="space-y-3">
        {EMAILS.map((email, i) => {
          const isExpanded = expandedIndex === i;
          const isCopied = copiedIndex === i;

          return (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 bg-white overflow-hidden"
            >
              {/* Header row */}
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-[#D56753]/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-[#D56753]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-400">
                        {email.dayLabel}
                      </p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          email.live
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {email.live ? "Live" : "Pending n8n setup"}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#212D40] truncate mt-0.5">
                      {email.subject}
                    </p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {/* Expanded body */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-gray-100">
                  {/* Email preview */}
                  <div className="mt-4 rounded-xl bg-[#FAFAF8] border border-gray-100 p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Subject: {email.subject}
                    </p>
                    <pre className="text-xs text-[#212D40]/80 leading-relaxed whitespace-pre-wrap font-sans">
                      {email.body}
                    </pre>
                  </div>

                  {/* Copy button */}
                  <button
                    onClick={() => copyToClipboard(
                      `Subject: ${email.subject}\n\n${email.body}`,
                      i
                    )}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#D56753] hover:underline"
                  >
                    {isCopied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy n8n template
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* n8n Configuration */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-[#D56753]" />
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
            n8n Webhook Configuration
          </p>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Dave: paste this payload schema into the n8n webhook node.
          Replace ALLORO_N8N_WEBHOOK_URL with the actual endpoint.
        </p>
        <div className="rounded-xl bg-[#212D40] p-4 overflow-x-auto">
          <pre className="text-xs text-white/80 leading-relaxed font-mono">
            {N8N_PAYLOAD_SCHEMA}
          </pre>
        </div>
        <button
          onClick={copySchema}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#D56753] hover:underline"
        >
          {copiedSchema ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy payload schema
            </>
          )}
        </button>
      </div>

      {/* Field reference */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-3">
          Template field reference
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["practice_name", DEMO.practice_name],
            ["last_name", DEMO.last_name],
            ["specialty", DEMO.specialty],
            ["city", DEMO.city],
            ["ranking_position", String(DEMO.ranking_position)],
            ["total_competitors", String(DEMO.total_competitors)],
            ["top_competitor_name", DEMO.top_competitor_name],
            ["referral_code", DEMO.referral_code],
          ].map(([field, value]) => (
            <div key={field} className="flex items-center gap-2 text-xs">
              <code className="font-mono text-[#D56753] bg-[#D56753]/5 px-1.5 py-0.5 rounded">
                {field}
              </code>
              <span className="text-slate-400 truncate">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// T1 adds /admin/trial-emails route to App.tsx
