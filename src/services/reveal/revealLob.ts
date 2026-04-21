import type { ComposedLobPostcard, RevealMode } from "./types";

/**
 * Card 4: Lob postcard integration.
 *
 * Shadow mode (dry_run): composes and logs, does NOT call Lob. Cost-safety
 * mandated by the spec: Lob is real money per postcard.
 *
 * Address validation is enforced upstream (lobPostcardTemplate.validateAddress);
 * if an address is invalid we do not dispatch, we log it, and orchestrator
 * reports graceful degradation.
 */

export interface SendRevealPostcardResult {
  sent: boolean;
  postcardId: string | null;
  sentAt: Date | null;
  error?: string;
  skipped?: "dry_run" | "address_invalid" | "no_api_key";
}

export async function sendRevealPostcard(
  composed: ComposedLobPostcard,
  mode: RevealMode
): Promise<SendRevealPostcardResult> {
  if (!composed.addressValid) {
    return {
      sent: false,
      postcardId: null,
      sentAt: null,
      skipped: "address_invalid",
      error: `cannot_mail: address failed validation`,
    };
  }

  if (mode === "dry_run") {
    return {
      sent: false,
      postcardId: null,
      sentAt: null,
      skipped: "dry_run",
    };
  }

  const apiKey = process.env.LOB_API_KEY;
  if (!apiKey) {
    return {
      sent: false,
      postcardId: null,
      sentAt: null,
      skipped: "no_api_key",
      error: "LOB_API_KEY not set; postcard logged only",
    };
  }

  try {
    const response = await fetch("https://api.lob.com/v1/postcards", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: composed.description,
        to: composed.to,
        front: composed.front,
        back: composed.back,
        size: composed.size,
      }),
    });

    const data = (await response.json()) as { id?: string; error?: { message?: string } };

    if (!response.ok || !data.id) {
      return {
        sent: false,
        postcardId: null,
        sentAt: null,
        error: data.error?.message || `Lob HTTP ${response.status}`,
      };
    }

    return {
      sent: true,
      postcardId: data.id,
      sentAt: new Date(),
    };
  } catch (err: any) {
    return {
      sent: false,
      postcardId: null,
      sentAt: null,
      error: err?.message || "lob_network_error",
    };
  }
}
