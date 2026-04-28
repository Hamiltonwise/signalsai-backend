import React from "react";

interface TickerProps {
  items: string[];
  refreshedAt?: Date;
}

/**
 * Ticker — today strip rendered above the dashboard hero.
 *
 * Visual contract (matches design at ~/Desktop/another-design/project/Focus Dashboard.html
 * lines 173-194 and the Ticker function in app.jsx lines 52-72):
 * - Small "Today" label in brand orange (#D66853) preceded by a 5px orange dot
 * - N items separated by tiny 3px circle dividers
 * - Uppercase, mono-tracked (letter-spacing 0.16em), muted foreground
 * - Right-aligned timestamp ("Refreshed 12:42 PM")
 *
 * Parent is expected to gate rendering to dashboard routes and supply the
 * bottom-border container chrome. This component owns its inner max-width
 * constraint via `max-w-[1320px] mx-auto px-8` so it aligns with the
 * surrounding Focus layout.
 */
const Ticker: React.FC<TickerProps> = ({ items, refreshedAt }) => {
  const timestamp = refreshedAt
    ? `Refreshed ${refreshedAt.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : null;

  return (
    <div className="max-w-[1320px] mx-auto px-8">
      <div
        className="flex items-center gap-8 py-2.5 text-[10.5px] font-semibold uppercase text-neutral-500"
        style={{ letterSpacing: "0.16em" }}
      >
        <span
          className="inline-flex items-center gap-1.5 font-bold"
          style={{ color: "#D66853" }}
        >
          <span
            aria-hidden="true"
            className="inline-block rounded-full"
            style={{ width: 5, height: 5, background: "#D66853" }}
          />
          Today
        </span>

        {items.map((item, i) => (
          <React.Fragment key={`${i}-${item}`}>
            <span className="inline-flex items-center gap-1.5">{item}</span>
            {i < items.length - 1 && (
              <span aria-hidden="true" className="inline-flex items-center">
                <span
                  className="inline-block rounded-full"
                  style={{ width: 3, height: 3, background: "#E5E0D6" }}
                />
              </span>
            )}
          </React.Fragment>
        ))}

        {timestamp && (
          <span className="ml-auto normal-case tracking-normal text-neutral-400">
            {timestamp}
          </span>
        )}
      </div>
    </div>
  );
};

export default Ticker;
