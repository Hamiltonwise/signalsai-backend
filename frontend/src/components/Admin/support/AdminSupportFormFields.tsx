import { SupportAnimatedSelect } from "./SupportAnimatedSelect";
import type { SupportSelectOption } from "./SupportAnimatedSelect";

type AdminSelectProps<T extends string | number | null> = {
  label: string;
  value: T;
  options: SupportSelectOption<T>[];
  onChange: (value: T) => void;
};

type AdminInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function AdminSelect<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
}: AdminSelectProps<T>) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <SupportAnimatedSelect
        value={value}
        options={options}
        onChange={onChange}
        ariaLabel={label}
      />
    </label>
  );
}

export function AdminInput({ label, value, onChange }: AdminInputProps) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-semibold text-alloro-navy focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
      />
    </label>
  );
}

export function AdminTextarea({ label, value, onChange }: AdminInputProps) {
  return (
    <label className="space-y-1.5 lg:col-span-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-semibold text-alloro-navy focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
      />
    </label>
  );
}
