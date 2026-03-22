import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";

export interface AnimatedSelectOption {
  value: string;
  label: string;
  color?: string;
}

interface AnimatedSelectProps {
  options: AnimatedSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  size?: "sm" | "md";
}

export default function AnimatedSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  label,
  size = "md",
}: AnimatedSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);
  const isSm = size === "sm";

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between border border-gray-300 rounded-lg bg-white text-left transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange ${
          isSm ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
        }`}
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.color && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: selected.color }}
            />
          )}
          <span className={selected ? "text-gray-900" : "text-gray-400"}>
            {selected?.label || placeholder}
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 ml-2"
        >
          <ChevronDown className={isSm ? "w-3.5 h-3.5 text-gray-400" : "w-4 h-4 text-gray-400"} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden ${
              isSm ? "text-xs" : "text-sm"
            }`}
          >
            <div className="max-h-48 overflow-y-auto py-1">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 transition-colors ${
                      isSm ? "py-1.5" : "py-2"
                    } ${
                      isSelected
                        ? "bg-alloro-orange/5 text-alloro-orange"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {option.color && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: option.color }}
                        />
                      )}
                      {option.label}
                    </span>
                    {isSelected && (
                      <Check className={isSm ? "w-3 h-3 flex-shrink-0" : "w-3.5 h-3.5 flex-shrink-0"} />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
