import { apiGet } from "./index";

/**
 * Answer Engine API client.
 *
 * Wraps the three Phase 4 endpoints and surfaces the typed shapes the
 * components consume. All responses include `success: boolean`. A 403
 * (feature flag off) returns `{ success: false, error: "answer_engine_not_enabled" }`
 * which the UI renders as a calm "not yet active" message.
 */

export interface LiveActivityEntry {
  id: string;
  practice_id: number;
  entry_type:
    | "signal_received"
    | "regeneration_attempted"
    | "regeneration_published"
    | "regeneration_held"
    | "citation_recovered"
    | "citation_lost"
    | "watching_started";
  entry_data: Record<string, unknown> | null;
  doctor_facing_text: string;
  linked_signal_event_id: string | null;
  linked_state_transition_id: string | null;
  visible_to_doctor: boolean;
  created_at: string;
}

export interface LiveActivityResponse {
  success: boolean;
  practiceId: number;
  count: number;
  entries: LiveActivityEntry[];
  grouped: {
    today: number[];
    yesterday: number[];
    thisWeek: number[];
    earlier: number[];
  };
  error?: string;
  message?: string;
}

export type AeoPlatform =
  | "google_ai_overviews"
  | "chatgpt"
  | "perplexity"
  | "claude"
  | "gemini"
  | "siri";

export interface AiVisibilityCell {
  status: "cited" | "competitor" | "not_appearing" | "not_polled";
  cited: boolean;
  competitor: string | null;
  citation_url: string | null;
  checked_at: string | null;
}

export interface AiVisibilityResponse {
  success: boolean;
  practiceId: number;
  platforms: AeoPlatform[];
  queries: string[];
  grid: Record<string, Record<AeoPlatform, AiVisibilityCell>>;
  summary: {
    citedCount: number;
    competitorCount: number;
    notAppearingCount: number;
    notPolledCount: number;
    totalCells: number;
  };
  error?: string;
  message?: string;
}

export interface WatchingItem {
  id: string;
  signal_type: string;
  severity: "info" | "watch" | "action";
  signal_data: Record<string, unknown> | null;
  created_at: string;
}

export interface WatchingResponse {
  success: boolean;
  practiceId: number;
  count: number;
  watching: WatchingItem[];
  error?: string;
  message?: string;
}

export async function fetchLiveActivity(
  practiceId: number,
): Promise<LiveActivityResponse> {
  return apiGet({ path: `/api/answer-engine/${practiceId}/live-activity` });
}

export async function fetchAiVisibility(
  practiceId: number,
): Promise<AiVisibilityResponse> {
  return apiGet({ path: `/api/answer-engine/${practiceId}/ai-visibility` });
}

export async function fetchWatching(
  practiceId: number,
): Promise<WatchingResponse> {
  return apiGet({ path: `/api/answer-engine/${practiceId}/watching` });
}
