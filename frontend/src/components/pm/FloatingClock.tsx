import { useState, useEffect } from "react";

function getTime(tz: string) {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

export function FloatingClock() {
  const [pst, setPst] = useState(() => getTime("America/Los_Angeles"));
  const [ph, setPh] = useState(() => getTime("Asia/Manila"));

  useEffect(() => {
    const tick = () => {
      setPst(getTime("America/Los_Angeles"));
      setPh(getTime("Asia/Manila"));
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex flex-col items-end gap-1 rounded-xl px-3 py-2 text-[11px] font-medium tabular-nums"
      style={{
        backgroundColor: "var(--color-pm-bg-tertiary)",
        border: "1px solid var(--color-pm-border)",
        boxShadow: "var(--pm-shadow-card)",
        color: "var(--color-pm-text-secondary)",
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--color-pm-text-muted)" }}>PST</span>
        <span style={{ color: "var(--color-pm-text-primary)" }}>{pst}</span>
      </div>
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--color-pm-text-muted)" }}>PH</span>
        <span style={{ color: "var(--color-pm-text-primary)" }}>{ph}</span>
      </div>
    </div>
  );
}
