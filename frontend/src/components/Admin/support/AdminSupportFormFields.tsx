import type { ReactNode } from "react";

type AdminSelectProps = {
  label: string;
  value: string;
  children: ReactNode;
  onChange: (value: string) => void;
};

type AdminInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function AdminSelect({
  label,
  value,
  children,
  onChange,
}: AdminSelectProps) {
  return (
    <label className="space-y-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[#EDE5C0] bg-white px-4 py-3 text-sm font-bold text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
      >
        {children}
      </select>
    </label>
  );
}

export function AdminInput({ label, value, onChange }: AdminInputProps) {
  return (
    <label className="space-y-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[#EDE5C0] bg-white px-4 py-3 text-sm font-bold text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
      />
    </label>
  );
}

export function AdminTextarea({ label, value, onChange }: AdminInputProps) {
  return (
    <label className="space-y-2 lg:col-span-1">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full resize-none rounded-xl border border-[#EDE5C0] bg-white px-4 py-3 text-sm font-bold text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
      />
    </label>
  );
}
