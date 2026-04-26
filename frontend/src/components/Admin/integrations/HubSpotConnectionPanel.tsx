import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Pencil,
  ShieldOff,
  Loader2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  deleteIntegration,
  validateMappings,
  type Integration,
} from "../../../api/integrations";
import { useConfirm } from "../../ui/ConfirmModal";

interface Props {
  projectId: string;
  integration: Integration;
  onReconnect: () => void;
  onDeleted: () => void;
  onValidated: () => void;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function HubSpotConnectionPanel({
  projectId,
  integration,
  onReconnect,
  onDeleted,
  onValidated,
}: Props) {
  const confirm = useConfirm();
  const [validating, setValidating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const portalId = integration.metadata?.portalId
    ? String(integration.metadata.portalId)
    : null;
  const accountName = integration.metadata?.accountName
    ? String(integration.metadata.accountName)
    : null;

  const statusVisuals = (() => {
    switch (integration.status) {
      case "active":
        return {
          label: "Connected",
          icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
          className: "bg-green-50 text-green-700 border-green-200",
        };
      case "revoked":
        return {
          label: "Revoked",
          icon: <ShieldOff className="w-4 h-4 text-red-600" />,
          className: "bg-red-50 text-red-700 border-red-200",
        };
      case "broken":
        return {
          label: "Broken",
          icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
          className: "bg-amber-50 text-amber-700 border-amber-200",
        };
      default:
        return {
          label: integration.status,
          icon: null,
          className: "bg-gray-100 text-gray-700 border-gray-200",
        };
    }
  })();

  const handleValidate = async () => {
    setValidating(true);
    try {
      await validateMappings(projectId, integration.id);
      toast.success("Connection and mappings validated");
      onValidated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Validation failed",
      );
    } finally {
      setValidating(false);
    }
  };

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: "Disconnect HubSpot?",
      message:
        "This removes the connection and all field mappings. Past sync history is preserved. New form submissions will not be pushed to HubSpot.",
      confirmLabel: "Disconnect",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteIntegration(projectId, integration.id);
      toast.success("HubSpot disconnected");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      {/* Top row: title + status pill */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold text-gray-900">
              {accountName || "HubSpot Account"}
            </h4>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusVisuals.className}`}
            >
              {statusVisuals.icon}
              {statusVisuals.label}
            </span>
          </div>
          {integration.label && (
            <p className="text-xs text-gray-500 mt-0.5">{integration.label}</p>
          )}
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4 text-xs">
        <div>
          <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
            Portal ID
          </div>
          <div className="text-gray-900 font-medium font-mono">
            {portalId || "—"}
          </div>
        </div>
        <div>
          <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
            Account
          </div>
          <div className="text-gray-900 font-medium truncate">
            {accountName || "—"}
          </div>
        </div>
        <div>
          <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
            Last validated
          </div>
          <div className="text-gray-900 font-medium">
            {formatTimestamp(integration.last_validated_at)}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {integration.last_error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Last error: </span>
            {integration.last_error}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleValidate}
          disabled={validating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
        >
          {validating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Validate now
        </button>
        <button
          type="button"
          onClick={onReconnect}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition"
        >
          <Pencil className="w-3.5 h-3.5" />
          {integration.status === "revoked" ? "Reconnect" : "Update token"}
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition disabled:opacity-50 ml-auto"
        >
          {deleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Disconnect
        </button>
      </div>
    </motion.div>
  );
}
