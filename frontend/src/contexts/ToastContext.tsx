/**
 * Toast Context — app-wide toast notifications.
 *
 * useToast() returns showToast(message, type).
 * Bottom-center, stacks up to 3, auto-dismiss 4s.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />,
    error: <XCircle className="h-4 w-4 text-red-600 shrink-0" />,
    info: <Info className="h-4 w-4 text-[#212D40] shrink-0" />,
  };

  const borders = {
    success: "border-l-emerald-500",
    error: "border-l-red-500",
    info: "border-l-[#212D40]",
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container — fixed bottom center */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-full max-w-sm px-4">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-3 rounded-xl border border-gray-200 border-l-4 ${borders[toast.type]} bg-white px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.1)] animate-in slide-in-from-bottom-2 duration-200`}
            >
              {icons[toast.type]}
              <p className="text-sm text-[#212D40] flex-1">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
