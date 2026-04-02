/**
 * EnvironmentBanner -- shows a subtle "SANDBOX" indicator when on a sandbox hostname.
 * Prevents confusion about which environment someone is viewing.
 */

export function EnvironmentBanner() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isSandbox =
    hostname.includes("sandbox") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  if (!isSandbox) return null;

  return (
    <div className="bg-amber-400 text-amber-900 text-center py-1 px-4 text-[11px] font-bold uppercase tracking-widest z-[9999] relative">
      SANDBOX
    </div>
  );
}
