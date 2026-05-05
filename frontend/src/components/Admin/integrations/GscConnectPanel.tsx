import { motion } from "framer-motion";
import { Search, AlertTriangle, ExternalLink } from "lucide-react";
import { ActionButton } from "../../ui/DesignSystem";

type GscState = "no_google" | "missing_scope" | "ready";

interface Props {
  state: GscState;
  googleEmail?: string | null;
}

export default function GscConnectPanel({ state, googleEmail }: Props) {
  if (state === "no_google") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="p-12 flex flex-col items-center text-center max-w-md mx-auto"
      >
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4">
          <Search className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          Connect Google Search Console
        </h3>
        <p className="text-sm text-gray-500 mt-1 mb-5 leading-relaxed">
          Google account not connected. Connect from{" "}
          <span className="font-medium text-gray-700">
            Settings &rarr; Integrations
          </span>{" "}
          to enable Search Console data.
        </p>
      </motion.div>
    );
  }

  if (state === "missing_scope") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="p-12 flex flex-col items-center text-center max-w-md mx-auto"
      >
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4">
          <Search className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          Google Search Console
        </h3>
        {googleEmail && (
          <p className="text-xs text-gray-400 mt-0.5 mb-3">
            Signed in as {googleEmail}
          </p>
        )}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-3 text-left w-full mb-5">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1">
            <p className="font-semibold">Additional permission needed</p>
            <p className="text-xs mt-1 leading-relaxed text-amber-700">
              Your Google account is connected but Search Console access has not
              been granted. Click below to grant the required scope.
            </p>
          </div>
        </div>
        <ActionButton
          label="Grant Search Console Access"
          icon={<ExternalLink className="w-4 h-4" />}
          variant="primary"
          onClick={() => {
            window.location.href = "/auth/google/reconnect?scopes=gsc";
          }}
        />
      </motion.div>
    );
  }

  return null;
}
