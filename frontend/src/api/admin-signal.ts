/**
 * Admin Signal API
 */

import { apiGet } from "./index";

export interface SignalResponse {
  signal: string;
  generated_at: string;
}

export async function fetchSignal(): Promise<SignalResponse> {
  return apiGet({ path: "/admin/signal" });
}
