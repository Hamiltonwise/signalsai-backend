import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "error" | "success" | "info";
  buttonText?: string;
  autoDismiss?: boolean;
}

const ICON_MAP = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
};

const STYLE_MAP = {
  error: {
    iconBg: "bg-red-50 text-red-600",
    button: "bg-red-600 hover:bg-red-700",
  },
  success: {
    iconBg: "bg-green-50 text-green-600",
    button: "bg-green-600 hover:bg-green-700",
  },
  info: {
    iconBg: "bg-alloro-orange/10 text-alloro-orange",
    button: "bg-alloro-orange hover:bg-alloro-orange/90",
  },
};

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = "error",
  buttonText = "OK",
  autoDismiss = false,
}) => {
  useEffect(() => {
    if (isOpen && autoDismiss && type === "success") {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoDismiss, type, onClose]);

  const Icon = ICON_MAP[type];
  const styles = STYLE_MAP[type];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`p-3 rounded-xl ${styles.iconBg}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-alloro-navy font-heading">
                  {title}
                </h3>
              </div>

              <p className="text-slate-600 mb-6 leading-relaxed">{message}</p>

              <div className="flex justify-end pt-4 border-t border-slate-200">
                <button
                  onClick={onClose}
                  className={`px-5 py-2.5 text-sm font-bold text-white rounded-xl transition-colors shadow-md ${styles.button}`}
                >
                  {buttonText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
