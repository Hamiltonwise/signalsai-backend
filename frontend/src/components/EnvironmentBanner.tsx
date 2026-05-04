/**
 * EnvironmentBanner — Card I update (May 4 2026).
 *
 * Renders a sticky strip surfacing whether the build is hitting
 * production or non-production. Closes the trust gap that produced
 * the laggy80@gmail.com leakage on April 23.
 *
 * Strings use mid-dot (·) per AR-002 — em-dash banned. Strings test
 * tests/notifications/cardIStrings.test.ts gates the copy.
 */

const PRODUCTION_BANNER = "PRODUCTION · changes affect real customers";
const SANDBOX_BANNER = "SANDBOX · changes affect test data only";

function detectIsProduction(): boolean {
  // Prefer build-time signal when present, else hostname inference.
  const viteEnv = (import.meta as any).env?.VITE_ALLORO_ENV;
  if (typeof viteEnv === "string") {
    return viteEnv.toLowerCase() === "production";
  }
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host.includes("sandbox") || host === "localhost" || host === "127.0.0.1") {
    return false;
  }
  // Default production for *.getalloro.com root or app.getalloro.com
  return host.endsWith("getalloro.com");
}

export function EnvironmentBanner() {
  const isProd = detectIsProduction();
  const text = isProd ? PRODUCTION_BANNER : SANDBOX_BANNER;
  const className = isProd
    ? "bg-red-500 text-white"
    : "bg-amber-300 text-[#1A1D23]";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-[9999] w-full text-xs font-semibold uppercase tracking-wider text-center py-2 ${className}`}
    >
      {text}
    </div>
  );
}

export const ENVIRONMENT_BANNER_STRINGS = {
  PRODUCTION_BANNER,
  SANDBOX_BANNER,
};
