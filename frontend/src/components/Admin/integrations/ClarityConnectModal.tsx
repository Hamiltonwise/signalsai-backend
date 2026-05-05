import { useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, KeyRound, ExternalLink } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  createIntegration,
  updateIntegration,
  type Integration,
} from "../../../api/integrations";

interface Props {
  projectId: string;
  existingIntegration?: Integration | null;
  onClose: () => void;
  onSaved: (integration: Integration) => void;
}

export default function ClarityConnectModal({
  projectId,
  existingIntegration,
  onClose,
  onSaved,
}: Props) {
  const isUpdate = !!existingIntegration;

  const [clarityProjectId, setClarityProjectId] = useState(
    existingIntegration?.metadata?.projectId
      ? String(existingIntegration.metadata.projectId)
      : "",
  );
  const [apiToken, setApiToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);

    if (!clarityProjectId.trim()) {
      setError("Clarity Project ID is required.");
      return;
    }
    if (!isUpdate && !apiToken.trim()) {
      setError("API Token is required.");
      return;
    }

    setSubmitting(true);
    try {
      let res;
      if (isUpdate && existingIntegration) {
        const payload: { label?: string | null; credentials?: string } = {};
        const newCreds: Record<string, string> = {};
        if (clarityProjectId.trim()) {
          newCreds.projectId = clarityProjectId.trim();
        }
        if (apiToken.trim()) {
          newCreds.apiToken = apiToken.trim();
        }
        payload.credentials = JSON.stringify(newCreds);
        res = await updateIntegration(
          projectId,
          existingIntegration.id,
          payload,
        );
        toast.success("Clarity connection updated");
      } else {
        res = await createIntegration(projectId, {
          platform: "clarity",
          credentials: JSON.stringify({
            projectId: clarityProjectId.trim(),
            apiToken: apiToken.trim(),
          }),
        });
        toast.success("Clarity connected");
      }
      onSaved(res.data);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save connection";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-alloro-orange">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">
                {isUpdate ? "Update Clarity Connection" : "Connect Clarity"}
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">
                {isUpdate
                  ? "Update credentials for Microsoft Clarity."
                  : "Enter your Clarity project credentials."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Help block */}
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-800 leading-relaxed">
            <p>
              Generate an API token in the Clarity dashboard under{" "}
              <span className="font-medium">Settings &rarr; Data Export</span>.
            </p>
            <a
              href="https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 font-medium hover:underline"
            >
              Clarity docs
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Project ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Clarity Project ID
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={clarityProjectId}
              onChange={(e) => setClarityProjectId(e.target.value)}
              placeholder="e.g. abc123xyz"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange"
            />
          </div>

          {/* API Token */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Token
              {!isUpdate && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                isUpdate
                  ? "Leave blank to keep existing token"
                  : "Paste your Clarity API token"
              }
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              The token is encrypted at rest and never returned to the browser.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !clarityProjectId.trim() ||
              (!isUpdate && !apiToken.trim())
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-alloro-orange text-white text-sm font-semibold rounded-xl hover:bg-alloro-orange/90 shadow-lg shadow-alloro-orange/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validating
              </>
            ) : isUpdate ? (
              "Save"
            ) : (
              "Connect"
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
