/**
 * HeyGen Service -- AI Avatar Video Generation
 *
 * Wraps the HeyGen API to create AI avatar videos from text scripts.
 * Every blog post and content brief can become a video automatically.
 *
 * Env vars: HEYGEN_API_KEY, HEYGEN_AVATAR_ID, HEYGEN_VOICE_ID
 */

// -- Types ------------------------------------------------------------------

export interface HeyGenVideoRequest {
  script: string;
  avatarId?: string;
  voiceId?: string;
  title: string;
  background?: string;
}

export interface HeyGenVideoResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  status: "pending" | "processing" | "completed" | "failed";
  estimatedDuration?: number;
  error?: string;
}

// -- Constants --------------------------------------------------------------

const HEYGEN_API_BASE = "https://api.heygen.com";
const MAX_SCRIPT_LENGTH = 3000;

// -- Configuration ----------------------------------------------------------

export function isHeyGenConfigured(): boolean {
  return Boolean(process.env.HEYGEN_API_KEY);
}

function getApiKey(): string | null {
  return process.env.HEYGEN_API_KEY || null;
}

function getDefaultAvatarId(): string {
  return process.env.HEYGEN_AVATAR_ID || "";
}

function getDefaultVoiceId(): string {
  return process.env.HEYGEN_VOICE_ID || "";
}

// -- Core -------------------------------------------------------------------

/**
 * Create a video using HeyGen's video generation API.
 * Gracefully handles missing API key.
 */
export async function createVideo(
  request: HeyGenVideoRequest
): Promise<HeyGenVideoResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      status: "failed",
      error:
        "HEYGEN_API_KEY is not configured. Set it in environment variables to enable video generation.",
    };
  }

  const script = request.script.slice(0, MAX_SCRIPT_LENGTH);
  const avatarId = request.avatarId || getDefaultAvatarId();
  const voiceId = request.voiceId || getDefaultVoiceId();

  if (!avatarId) {
    return {
      success: false,
      status: "failed",
      error:
        "No avatar ID provided. Set HEYGEN_AVATAR_ID or pass avatarId in the request.",
    };
  }

  try {
    const payload = {
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: avatarId,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: script,
            ...(voiceId ? { voice_id: voiceId } : {}),
          },
          background: {
            type: "color",
            value: request.background || "#212D40", // Alloro Navy
          },
        },
      ],
      dimension: {
        width: 1920,
        height: 1080,
      },
      test: false,
    };

    const response = await fetch(`${HEYGEN_API_BASE}/v2/video/generate`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[HeyGen] API error ${response.status}: ${errorText}`
      );
      return {
        success: false,
        status: "failed",
        error: `HeyGen API returned ${response.status}: ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      data?: { video_id?: string };
      error?: string;
    };

    if (!data.data?.video_id) {
      return {
        success: false,
        status: "failed",
        error: data.error || "No video_id returned from HeyGen API.",
      };
    }

    console.log(
      `[HeyGen] Video queued: ${data.data.video_id} for "${request.title}"`
    );

    return {
      success: true,
      videoId: data.data.video_id,
      status: "pending",
      estimatedDuration: Math.ceil(script.length / 15), // rough estimate: ~15 chars per second
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[HeyGen] Failed to create video:", message);
    return {
      success: false,
      status: "failed",
      error: `HeyGen request failed: ${message}`,
    };
  }
}

/**
 * Check the status of a HeyGen video by its video ID.
 */
export async function getVideoStatus(
  videoId: string
): Promise<HeyGenVideoResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      status: "failed",
      error: "HEYGEN_API_KEY is not configured.",
    };
  }

  try {
    const response = await fetch(
      `${HEYGEN_API_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      {
        method: "GET",
        headers: {
          "X-Api-Key": apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        videoId,
        status: "failed",
        error: `HeyGen status API returned ${response.status}: ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      data?: {
        status?: string;
        video_url?: string;
        duration?: number;
      };
      error?: string;
    };

    const rawStatus = data.data?.status || "unknown";
    const normalizedStatus = normalizeStatus(rawStatus);

    return {
      success: normalizedStatus !== "failed",
      videoId,
      videoUrl: data.data?.video_url || undefined,
      status: normalizedStatus,
      estimatedDuration: data.data?.duration,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[HeyGen] Failed to get video status:", message);
    return {
      success: false,
      videoId,
      status: "failed",
      error: `HeyGen status request failed: ${message}`,
    };
  }
}

// -- Helpers ----------------------------------------------------------------

function normalizeStatus(
  raw: string
): "pending" | "processing" | "completed" | "failed" {
  switch (raw.toLowerCase()) {
    case "completed":
    case "done":
      return "completed";
    case "processing":
    case "rendering":
      return "processing";
    case "pending":
    case "waiting":
    case "queued":
      return "pending";
    default:
      return "failed";
  }
}
