import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Plug } from "lucide-react";
import type { Integration } from "../../../api/integrations";
import { ActionButton } from "../../ui/DesignSystem";
import IntegrationPanel from "./IntegrationPanel";
import ClarityConnectModal from "./ClarityConnectModal";

interface Props {
  projectId: string;
  integration: Integration | null;
  onRefresh: () => void;
}

export default function ClarityTab({
  projectId,
  integration,
  onRefresh,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [updateMode, setUpdateMode] = useState(false);

  const handleOpenConnect = () => {
    setUpdateMode(false);
    setShowModal(true);
  };

  const handleSaved = () => {
    onRefresh();
  };

  if (!integration) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-12 flex flex-col items-center text-center max-w-md mx-auto"
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
            <Eye className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Connect Microsoft Clarity
          </h3>
          <p className="text-sm text-gray-500 mt-1 mb-5 leading-relaxed">
            Pull heatmap and session recording data from Clarity to enrich
            website performance reports.
          </p>
          <ActionButton
            label="Connect Clarity"
            icon={<Plug className="w-4 h-4" />}
            variant="primary"
            onClick={handleOpenConnect}
          />
        </motion.div>

        <AnimatePresence>
          {showModal && (
            <ClarityConnectModal
              projectId={projectId}
              onClose={() => setShowModal(false)}
              onSaved={handleSaved}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  const clarityProjectId = integration.metadata?.projectId
    ? String(integration.metadata.projectId)
    : null;

  return (
    <div className="p-6">
      <IntegrationPanel
        integration={integration}
        projectId={projectId}
        onRefresh={onRefresh}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Clarity Project ID
              </div>
              <div className="text-gray-900 font-medium font-mono">
                {clarityProjectId || "--"}
              </div>
            </div>
            <div>
              <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Last validated
              </div>
              <div className="text-gray-900 font-medium">
                {integration.last_validated_at
                  ? new Date(integration.last_validated_at).toLocaleString()
                  : "Never"}
              </div>
            </div>
          </div>
        </motion.div>
      </IntegrationPanel>

      <AnimatePresence>
        {showModal && (
          <ClarityConnectModal
            projectId={projectId}
            existingIntegration={updateMode ? integration : null}
            onClose={() => setShowModal(false)}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
