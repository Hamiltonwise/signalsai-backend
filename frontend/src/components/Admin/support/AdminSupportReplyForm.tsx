import type { FormEvent } from "react";
import type { SupportMessageVisibility } from "../../../api/support";
import { SupportAnimatedSelect } from "./SupportAnimatedSelect";

export type AdminSupportReplyFormProps = {
  message: string;
  visibility: SupportMessageVisibility;
  isMessaging: boolean;
  onMessageChange: (message: string) => void;
  onVisibilityChange: (visibility: SupportMessageVisibility) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const visibilityOptions: Array<{
  value: SupportMessageVisibility;
  label: string;
  hint: string;
}> = [
  {
    value: "client_visible",
    label: "Client visible",
    hint: "Sends a client notification",
  },
  {
    value: "internal",
    label: "Internal note",
    hint: "Only super-admins can see it",
  },
];

export function AdminSupportReplyForm({
  message,
  visibility,
  isMessaging,
  onMessageChange,
  onVisibilityChange,
  onSubmit,
}: AdminSupportReplyFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="h-fit rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        Reply
      </label>
      <textarea
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        rows={7}
        className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
      />
      <div className="mt-3">
        <SupportAnimatedSelect
          value={visibility}
          options={visibilityOptions}
          onChange={onVisibilityChange}
          ariaLabel="Reply visibility"
        />
      </div>
      <button
        type="submit"
        disabled={isMessaging || !message.trim()}
        className="mt-3 w-full rounded-xl bg-alloro-navy px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-teal/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isMessaging ? "Sending" : "Send message"}
      </button>
    </form>
  );
}
