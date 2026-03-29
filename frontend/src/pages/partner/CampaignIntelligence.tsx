/**
 * Campaign Intelligence -- WO-55
 *
 * Three-panel layout for partner campaign management:
 * 1. Left: practice list input
 * 2. Center: intelligence results table
 * 3. Right: generated email preview
 */

import { useState, useCallback } from "react";
import {
  Search,
  Send,
  Download,
  Copy,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Mail,
  BarChart3,
} from "lucide-react";
import { apiPost } from "@/api/index";

// ── Types ───────────────────────────────────────────────────────────

interface CampaignResult {
  id: string;
  name: string;
  city: string;
  state: string;
  status: "pending" | "complete" | "error";
  score: number | null;
  rank: number | null;
  topCompetitor: string | null;
  reviewGap: number | null;
  specificFinding: string | null;
  emailGenerated: boolean;
}

interface GeneratedEmail {
  subject: string;
  body: string;
  confidence: number;
  dataQuality: number;
  warnings?: string[];
}

// ── Main Component ──────────────────────────────────────────────────

export default function CampaignIntelligence() {
  const [practiceInput, setPracticeInput] = useState("");
  const [results, setResults] = useState<CampaignResult[]>([]);
  const [selectedRow, setSelectedRow] = useState<CampaignResult | null>(null);
  const [email, setEmail] = useState<GeneratedEmail | null>(null);
  const [running, setRunning] = useState(false);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parse textarea input into practice objects
  const parsePractices = useCallback((text: string) => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Try to parse "Name, City, State" format
        const parts = line.split(",").map((p) => p.trim());
        return {
          name: parts[0] || line,
          city: parts[1] || "",
          state: parts[2] || "",
        };
      });
  }, []);

  // Run campaign analysis
  const handleRunCampaign = async () => {
    const practices = parsePractices(practiceInput);
    if (practices.length === 0) return;

    setRunning(true);
    setResults([]);
    setSelectedRow(null);
    setEmail(null);

    try {
      const data = await apiPost({
        path: "/partner/campaigns/run",
        passedData: { practices },
      });

      if (data.success && data.results) {
        setResults(data.results);
      }
    } catch (err) {
      console.error("[Campaign] Run failed:", err);
    } finally {
      setRunning(false);
    }
  };

  // Generate email for a specific practice
  const handleGenerateEmail = async (result: CampaignResult) => {
    setSelectedRow(result);
    setEmail(null);
    setGeneratingEmail(true);

    try {
      const data = await apiPost({
        path: "/partner/campaigns/generate-email",
        passedData: {
          targetName: result.name,
          targetCity: result.city,
          score: result.score,
          rank: result.rank,
          topCompetitor: result.topCompetitor,
          reviewGap: result.reviewGap,
          specificFinding: result.specificFinding,
        },
      });

      if (data.success && data.email) {
        setEmail(data.email);
        // Mark row as email generated
        setResults((prev) =>
          prev.map((r) => (r.id === result.id ? { ...r, emailGenerated: true } : r)),
        );
      }
    } catch (err) {
      console.error("[Campaign] Email generation failed:", err);
    } finally {
      setGeneratingEmail(false);
    }
  };

  // Copy email to clipboard
  const handleCopyEmail = async () => {
    if (!email) return;
    const text = `Subject: ${email.subject}\n\n${email.body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export as CSV
  const handleExport = () => {
    if (results.length === 0) return;
    const encoded = btoa(JSON.stringify(results));
    const url = `/api/partner/campaigns/export?data=${encodeURIComponent(encoded)}`;

    // Add auth token
    const token =
      window.sessionStorage.getItem("token") ||
      window.localStorage.getItem("auth_token") ||
      window.localStorage.getItem("token");

    // Use fetch to get the CSV with auth
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `campaign-results-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error("[Campaign] Export failed:", err));
  };

  const practiceCount = parsePractices(practiceInput).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/partner"
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#212D40] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Partner Portal
            </a>
            <span className="text-gray-300">|</span>
            <h1 className="text-lg font-bold text-[#212D40]">Campaign Intelligence</h1>
          </div>
          {results.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex h-[calc(100vh-65px)]">
        {/* Left panel: Practice input */}
        <div className="w-80 border-r border-gray-200 bg-white p-5 flex flex-col">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-[#212D40] mb-1">Target Practices</h2>
            <p className="text-xs text-gray-500">
              One business per line. Optionally add city and state separated by commas.
            </p>
          </div>

          <textarea
            value={practiceInput}
            onChange={(e) => setPracticeInput(e.target.value)}
            placeholder={"Smith Dental, Austin, TX\nPeak Endodontics, Denver, CO\nBright Smiles Family"}
            className="flex-1 w-full p-3 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#D56753]/30 focus:border-[#D56753] placeholder:text-gray-400"
          />

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {practiceCount} {practiceCount === 1 ? "practice" : "practices"}
            </span>
            <button
              onClick={handleRunCampaign}
              disabled={practiceCount === 0 || running}
              className="flex items-center gap-2 px-4 py-2 bg-[#D56753] text-white text-sm font-medium rounded-lg hover:bg-[#c05a48] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {running ? "Analyzing..." : "Run Campaign"}
            </button>
          </div>

          {practiceCount > 50 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
              <AlertCircle className="w-3 h-3" />
              Maximum 50 practices per campaign
            </div>
          )}
        </div>

        {/* Center panel: Results table */}
        <div className="flex-1 overflow-auto p-5">
          {results.length === 0 && !running ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <BarChart3 className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No campaign results yet</p>
              <p className="text-xs mt-1">Add practices and run a campaign to see intelligence</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#212D40]">
                  Results ({results.length})
                </h2>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Business
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Location
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Score
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Top Gap
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr
                        key={r.id}
                        className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer ${
                          selectedRow?.id === r.id ? "bg-[#D56753]/5" : ""
                        }`}
                        onClick={() => setSelectedRow(r)}
                      >
                        <td className="px-4 py-3 font-medium text-[#212D40]">{r.name}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {[r.city, r.state].filter(Boolean).join(", ") || "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.score != null ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                r.score >= 70
                                  ? "bg-green-100 text-green-700"
                                  : r.score >= 40
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {r.score}
                            </span>
                          ) : (
                            <span className="text-gray-300">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">
                          {r.rank != null ? `#${r.rank}` : "--"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                          {r.specificFinding || r.topCompetitor || "--"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateEmail(r);
                            }}
                            disabled={generatingEmail}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                              r.emailGenerated
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-[#D56753]/10 text-[#D56753] hover:bg-[#D56753]/20"
                            }`}
                          >
                            {r.emailGenerated ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                Sent
                              </>
                            ) : (
                              <>
                                <Mail className="w-3 h-3" />
                                Email
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right panel: Email preview */}
        <div className="w-96 border-l border-gray-200 bg-white p-5 flex flex-col">
          {generatingEmail ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-[#D56753]" />
              <p className="text-sm font-medium text-[#212D40]">Generating outreach...</p>
              <p className="text-xs mt-1 text-gray-500">Using intelligence data to personalize</p>
            </div>
          ) : email && selectedRow ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#212D40]">Email Preview</h2>
                <button
                  onClick={handleCopyEmail}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      <span className="text-green-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">To</p>
                <p className="text-sm text-[#212D40] font-medium">{selectedRow.name}</p>
              </div>

              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Subject</p>
                <p className="text-sm text-[#212D40] font-medium">{email.subject}</p>
              </div>

              <div className="flex-1 overflow-auto">
                <p className="text-xs text-gray-500 mb-1">Body</p>
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {email.body}
                </div>
              </div>

              {/* Confidence / quality indicators */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-4">
                <div className="text-xs text-gray-500">
                  Confidence: <span className="font-medium text-[#212D40]">{email.confidence}%</span>
                </div>
                <div className="text-xs text-gray-500">
                  Data quality: <span className="font-medium text-[#212D40]">{email.dataQuality}%</span>
                </div>
              </div>

              {email.warnings && email.warnings.length > 0 && (
                <div className="mt-2 p-2 bg-amber-50 rounded-lg">
                  {email.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">{w}</p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Send className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No email selected</p>
              <p className="text-xs mt-1">
                Click "Email" on any row to generate personalized outreach
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
