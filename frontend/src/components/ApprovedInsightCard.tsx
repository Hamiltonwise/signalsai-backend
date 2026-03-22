import { useEffect, useState } from "react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import { getLatestAgentResult, type AgentResult } from "../api/agents";
import type { WebhookResult } from "../types/agents";

interface ApprovedInsightCardProps {
  domain: string;
}

interface ProoflineData {
  title?: string;
  proof_type?: string;
  explanation?: string;
  value_change?: string;
  metric_signal?: string;
}

interface SummaryData {
  wins?: Array<{ title?: string; description?: string }>;
  risks?: Array<{ title?: string; description?: string }>;
}

interface OpportunityData {
  title?: string;
  steps?: string[];
  expected_lift?: string;
}

const getProofTypeIcon = (proofType?: string) => {
  switch (proofType?.toLowerCase()) {
    case "win":
      return <TrendingUp className="h-5 w-5 text-green-600" />;
    case "loss":
      return <TrendingDown className="h-5 w-5 text-red-600" />;
    default:
      return <Target className="h-5 w-5 text-blue-600" />;
  }
};

const getProofTypeColor = (proofType?: string) => {
  switch (proofType?.toLowerCase()) {
    case "win":
      return "from-green-50 to-emerald-50 border-green-200";
    case "loss":
      return "from-red-50 to-rose-50 border-red-200";
    default:
      return "from-blue-50 to-indigo-50 border-blue-200";
  }
};

export function ApprovedInsightCard({ domain }: ApprovedInsightCardProps) {
  const [insight, setInsight] = useState<AgentResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInsight = async () => {
      if (!domain) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await getLatestAgentResult(domain);

        if (
          response?.success &&
          response.data &&
          response.data.status === "approved"
        ) {
          setInsight(response.data);
        } else {
          setInsight(null);
        }
      } catch (err) {
        console.error("Failed to fetch approved insight", err);
        setInsight(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInsight();
  }, [domain]);

  // Don't render anything if loading or no insight
  if (isLoading || !insight) {
    return null;
  }

  // Extract data from all three agents
  const prooflineWebhook = insight.agent_response?.webhooks?.find(
    (wh: WebhookResult) => wh.webhookUrl?.includes("proofline-agent")
  );
  const summaryWebhook = insight.agent_response?.webhooks?.find(
    (wh: WebhookResult) => wh.webhookUrl?.includes("summary-agent")
  );
  const opportunityWebhook = insight.agent_response?.webhooks?.find(
    (wh: WebhookResult) => wh.webhookUrl?.includes("opportunity-agent")
  );

  const prooflineData = prooflineWebhook?.data?.[0] as
    | ProoflineData
    | undefined;
  const summaryData = summaryWebhook?.data?.[0] as SummaryData | undefined;
  const opportunityData = opportunityWebhook?.data?.[0] as
    | OpportunityData
    | undefined;

  // Don't render if no data available
  if (!prooflineData && !summaryData && !opportunityData) {
    return null;
  }

  const colorClasses = getProofTypeColor(prooflineData?.proof_type);

  return (
    <div className="mb-6 space-y-4">
      {/* Proofline Agent - Main Insight */}
      {prooflineData?.title && (
        <div
          className={`rounded-2xl border-2 bg-gradient-to-br p-6 shadow-lg transition-all hover:shadow-xl ${colorClasses}`}
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm shadow-sm">
                {getProofTypeIcon(prooflineData.proof_type)}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Key Insight
                </span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {prooflineData.title}
              </h3>
              {prooflineData.explanation && (
                <p className="text-sm text-gray-700 leading-relaxed mb-3">
                  {prooflineData.explanation}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {prooflineData.proof_type && (
                  <span className="inline-flex items-center rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-gray-700 capitalize">
                    {prooflineData.proof_type}
                  </span>
                )}
                {prooflineData.value_change && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-gray-700">
                    <ArrowUpRight className="h-3 w-3" />
                    {prooflineData.value_change}
                  </span>
                )}
                {prooflineData.metric_signal && (
                  <span className="inline-flex items-center rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-gray-700">
                    {prooflineData.metric_signal}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Agent - Wins and Risks */}
      {(summaryData?.wins?.length || summaryData?.risks?.length) && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Wins */}
          {summaryData.wins && summaryData.wins.length > 0 && (
            <div className="rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-5 shadow-md">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <h4 className="text-sm font-bold uppercase tracking-wide text-green-800">
                  Wins
                </h4>
              </div>
              <div className="space-y-3">
                {summaryData.wins.map((win, index) => (
                  <div key={index} className="rounded-lg bg-white/60 p-3">
                    {win.title && (
                      <div className="flex items-start gap-2">
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-green-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {win.title}
                          </p>
                          {win.description && (
                            <p className="mt-1 text-xs text-gray-600">
                              {win.description}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks */}
          {summaryData.risks && summaryData.risks.length > 0 && (
            <div className="rounded-xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-5 shadow-md">
              <div className="mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                <h4 className="text-sm font-bold uppercase tracking-wide text-orange-800">
                  Risks
                </h4>
              </div>
              <div className="space-y-3">
                {summaryData.risks.map((risk, index) => (
                  <div key={index} className="rounded-lg bg-white/60 p-3">
                    {risk.title && (
                      <div className="flex items-start gap-2">
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-orange-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {risk.title}
                          </p>
                          {risk.description && (
                            <p className="mt-1 text-xs text-gray-600">
                              {risk.description}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Opportunity Agent - Action Steps */}
      {opportunityData?.title && (
        <div className="rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-5 shadow-md">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-5 w-5 text-purple-600" />
            <h4 className="text-sm font-bold uppercase tracking-wide text-purple-800">
              Opportunity
            </h4>
          </div>
          <h5 className="text-base font-bold text-gray-900 mb-3">
            {opportunityData.title}
          </h5>
          {opportunityData.steps && opportunityData.steps.length > 0 && (
            <div className="space-y-2 mb-3">
              {opportunityData.steps.map((step, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg bg-white/60 p-3"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                    {index + 1}
                  </span>
                  <p className="text-sm text-gray-700 pt-0.5">{step}</p>
                </div>
              ))}
            </div>
          )}
          {opportunityData.expected_lift && (
            <div className="rounded-lg bg-white/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Expected Impact
              </p>
              <p className="text-sm font-bold text-purple-700">
                {opportunityData.expected_lift}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
