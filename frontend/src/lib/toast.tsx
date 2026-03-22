/* eslint-disable react-refresh/only-export-components */
import toast, { type Toast } from "react-hot-toast";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  Upload,
  Sparkles,
  XCircle,
} from "lucide-react";

// Internal types and component (not exported for fast refresh compatibility)
interface GlassToastProps {
  t: Toast;
  icon: React.ReactNode;
  title: string;
  message?: string;
  variant?: "success" | "error" | "info" | "upload" | "sparkle";
}

// All variants now use unified Alloro branding colors
const variantStyles = {
  success: {
    iconColor: "text-[#d66853]",
    bgGradient: "",
    border: "border-[#d66853]/30",
  },
  error: {
    iconColor: "text-[#d66853]",
    bgGradient: "",
    border: "border-[#d66853]/30",
  },
  info: {
    iconColor: "text-[#d66853]",
    bgGradient: "",
    border: "border-[#d66853]/30",
  },
  upload: {
    iconColor: "text-[#d66853]",
    bgGradient: "",
    border: "border-[#d66853]/30",
  },
  sparkle: {
    iconColor: "text-[#d66853]",
    bgGradient: "",
    border: "border-[#d66853]/30",
  },
};

const GlassToast = ({
  t,
  icon,
  title,
  message,
  variant = "info",
}: GlassToastProps) => {
  const styles = variantStyles[variant];

  return (
    <div
      className={`${
        t.visible ? "animate-enter" : "animate-leave"
      } max-w-md w-full pointer-events-auto`}
      style={{
        animation: t.visible
          ? "slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
          : "fadeOut 0.3s ease-out forwards",
      }}
    >
      <div
        className={`
          relative overflow-hidden rounded-xl
          border ${styles.border}
          shadow-2xl shadow-black/20
          p-4
        `}
        style={{
          background: "#212D40",
        }}
      >
        <div className="relative flex items-start gap-3">
          <div className={`flex-shrink-0 ${styles.iconColor}`}>{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{title}</p>
            {message && <p className="mt-1 text-sm text-white/80">{message}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// Toast configuration with smooth animations
const toastConfig = {
  duration: 4000,
  position: "top-right" as const,
  style: {
    background: "transparent",
    boxShadow: "none",
    padding: 0,
  },
};

// Reusable toast functions
export const showSuccessToast = (title: string, message?: string) => {
  return toast.custom(
    (t) => (
      <GlassToast
        t={t}
        icon={<CheckCircle2 className="h-6 w-6" />}
        title={title}
        message={message}
        variant="success"
      />
    ),
    toastConfig
  );
};

export const showErrorToast = (title: string, message?: string) => {
  return toast.custom(
    (t) => (
      <GlassToast
        t={t}
        icon={<XCircle className="h-6 w-6" />}
        title={title}
        message={message}
        variant="error"
      />
    ),
    toastConfig
  );
};

export const showInfoToast = (title: string, message?: string) => {
  return toast.custom(
    (t) => (
      <GlassToast
        t={t}
        icon={<Info className="h-6 w-6" />}
        title={title}
        message={message}
        variant="info"
      />
    ),
    toastConfig
  );
};

export const showUploadToast = (title: string, message?: string) => {
  return toast.custom(
    (t) => (
      <GlassToast
        t={t}
        icon={<Upload className="h-6 w-6" />}
        title={title}
        message={message}
        variant="upload"
      />
    ),
    toastConfig
  );
};

export const showSparkleToast = (title: string, message?: string) => {
  return toast.custom(
    (t) => (
      <GlassToast
        t={t}
        icon={<Sparkles className="h-6 w-6" />}
        title={title}
        message={message}
        variant="sparkle"
      />
    ),
    toastConfig
  );
};

export const showWarningToast = (title: string, message?: string) => {
  return toast.custom(
    (t) => (
      <GlassToast
        t={t}
        icon={<AlertCircle className="h-6 w-6" />}
        title={title}
        message={message}
        variant="info"
      />
    ),
    toastConfig
  );
};

// Custom toast with specific icon and variant
export const showCustomToast = (
  title: string,
  message: string | undefined,
  icon: React.ReactNode,
  variant: "success" | "error" | "info" | "upload" | "sparkle" = "info"
) => {
  return toast.custom(
    (t) => (
      <GlassToast
        t={t}
        icon={icon}
        title={title}
        message={message}
        variant={variant}
      />
    ),
    toastConfig
  );
};

// Export the base toast for advanced use cases
export { toast };
