import type { SupportTicketMessage } from "../../api/support";

export type SupportMessageThreadProps = {
  messages: SupportTicketMessage[];
};

export function SupportMessageThread({ messages }: SupportMessageThreadProps) {
  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isClient = message.authorRole === "client";
        return (
          <article
            key={message.id}
            className={`rounded-xl border p-4 ${
              isClient
                ? "border-[#EDE5C0] bg-white"
                : "border-alloro-orange/20 bg-alloro-orange/5"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {isClient ? "You" : message.authorName || "Alloro Support"}
              </p>
              <time className="text-xs font-semibold text-slate-400">
                {formatDate(message.createdAt)}
              </time>
            </div>
            <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-alloro-navy">
              {message.body}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
