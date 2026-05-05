import { motion } from "framer-motion";
import { BarChart3, Shield } from "lucide-react";
import type { Integration } from "../../../api/integrations";
import IntegrationPanel from "./IntegrationPanel";

interface Props {
  projectId: string;
  integration: Integration | null;
  onRefresh: () => void;
}

export default function RybbitTab({
  projectId,
  integration,
  onRefresh,
}: Props) {
  if (!integration) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="p-12 flex flex-col items-center text-center max-w-md mx-auto"
      >
        <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 mb-4">
          <BarChart3 className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          Rybbit Analytics
        </h3>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          Rybbit analytics is automatically provisioned when a custom domain is
          verified for this website.
        </p>
      </motion.div>
    );
  }

  const siteId = integration.metadata?.siteId
    ? String(integration.metadata.siteId)
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
                Site ID
              </div>
              <div className="text-gray-900 font-medium font-mono">
                {siteId || "--"}
              </div>
            </div>
            <div>
              <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Management
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">
                <Shield className="w-3 h-3" />
                Managed by Alloro
              </span>
            </div>
          </div>
        </motion.div>
      </IntegrationPanel>
    </div>
  );
}
