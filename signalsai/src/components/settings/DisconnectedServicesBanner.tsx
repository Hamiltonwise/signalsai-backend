import React from "react";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

interface DisconnectedServicesBannerProps {
  disconnectedServices: string[]; // Array of service IDs: 'gbp'
}

export const DisconnectedServicesBanner: React.FC<
  DisconnectedServicesBannerProps
> = ({ disconnectedServices }) => {
  if (disconnectedServices.length === 0) return null;

  const serviceNames = disconnectedServices.map((service) => {
    switch (service) {
      case "gbp":
        return "Business Profile";
      default:
        return service.toUpperCase();
    }
  });

  const formatServiceList = (names: string[]) => {
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-2xl p-6 mb-8"
    >
      <div className="flex items-start gap-4">
        <div className="p-2 bg-amber-100 rounded-xl shrink-0">
          <AlertCircle size={20} className="text-amber-600" />
        </div>
        <div>
          <h3 className="font-black text-amber-900 text-lg">
            {disconnectedServices.length === 1
              ? "1 Integration Not Connected"
              : `${disconnectedServices.length} Integrations Not Connected`}
          </h3>
          <p className="text-amber-700 text-sm mt-1">
            Connect <strong>{formatServiceList(serviceNames)}</strong> to enable
            full practice analytics. All integrations are required for Alloro to
            accurately analyze your practice.
          </p>
        </div>
      </div>
    </motion.div>
  );
};
