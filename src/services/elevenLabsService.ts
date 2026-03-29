/**
 * ElevenLabs Service -- AI Voice / Podcast Audio Generation
 *
 * Wraps the ElevenLabs API to convert text into high-quality audio.
 * Every blog post, report, or content brief can become a podcast clip.
 *
 * Env vars: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
 */

// -- Types ------------------------------------------------------------------

export interface ElevenLabsAudioResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

// -- Constants --------------------------------------------------------------

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const MAX_CHARS_PER_REQUEST = 5000;

// -- Configuration ----------------------------------------------------------

/**
 * Returns true when the ElevenLabs integration is ready to use.
 */
export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function getApiKey(): string | null {
  return process.env.ELEVENLABS_API_KEY || null;
}

function getDefaultVoiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel default
}

// -- Core -------------------------------------------------------------------

/**
 * Convert text to speech using the ElevenLabs text-to-speech API.
 * Returns a URL to the generated audio (base64 data URI when streaming
 * directly, or a hosted URL if a storage layer is wired later).
 *
 * Gracefully returns an error object when the API key is missing.
 */
export async function createAudioFromText(
  text: string,
  voiceId?: string
): Promise<ElevenLabsAudioResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      error:
        "ELEVENLABS_API_KEY is not configured. Set it in environment variables to enable audio generation.",
    };
  }

  if (!text || text.trim().length === 0) {
    return {
      success: false,
      error: "No text provided for audio generation.",
    };
  }

  const truncatedText = text.slice(0, MAX_CHARS_PER_REQUEST);
  const resolvedVoiceId = voiceId || getDefaultVoiceId();

  try {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(resolvedVoiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: truncatedText,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[ElevenLabs] API error ${response.status}: ${errorText}`
      );
      return {
        success: false,
        error: `ElevenLabs API returned ${response.status}: ${errorText}`,
      };
    }

    // Convert the audio stream to a base64 data URI.
    // In production a storage layer (S3, R2) would host the file and return
    // a real URL. For now the data URI keeps the service self-contained.
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const audioUrl = `data:audio/mpeg;base64,${base64}`;

    console.log(
      `[ElevenLabs] Audio generated: ${truncatedText.length} chars, voice ${resolvedVoiceId}`
    );

    return {
      success: true,
      audioUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ElevenLabs] Failed to create audio:", message);
    return {
      success: false,
      error: `ElevenLabs request failed: ${message}`,
    };
  }
}
