import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { Integration, IntegrationStatus } from "../../../api/integrations";

type ProviderStatus = "not_connected" | IntegrationStatus;

const HubSpotLogo = () => (
  <svg viewBox="0 0 24 24" fill="#FF7A59" className="w-4.5 h-4.5" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z"/>
  </svg>
);

const RybbitLogo = () => (
  <svg viewBox="0 0 263.33 173.53" fill="#22c55e" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
    <polygon points="181.28 171.2 227.21 123.96 261.15 171.2 181.28 171.2"/>
    <path d="M261.15,89.05L206.64,2.33l-33.22,17.75-34.61-7.4c2.88,5.56,4.56,12.11,4.56,19.15,0,20.03-13.46,36.26-30.06,36.26-13.66,0-25.17-11-28.83-26.06l-39.92,71.46L2.18,94.19l22.66,77.01h55.81l22.28-54.01v54.01h64.66l-49.95-82.15h143.51Z"/>
    <ellipse cx="105.94" cy="28.62" rx="12.9" ry="18.88"/>
  </svg>
);

const ClarityLogo = () => (
  <svg viewBox="-1 -2 23 21" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.0004 -1.00888L14.4827 6.67518L3.72505 9.7488L10.0004 -1.00888Z" fill="#41A5EE"/>
    <path d="M3.72505 9.7488L20.758 17.4329L14.4827 6.67518L3.72505 9.7488Z" fill="#2B7CD3"/>
    <path d="M20.758 17.4329H-0.757812L3.72505 9.7488L20.758 17.4329Z" fill="#185ABD"/>
  </svg>
);

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" fill="#4285F4" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
  </svg>
);

interface ProviderEntry {
  platform: string;
  label: string;
  description: string;
  logo: ReactNode;
  bgColor: string;
}

const PROVIDERS: ProviderEntry[] = [
  {
    platform: "hubspot",
    label: "HubSpot",
    description: "Push form submissions as contacts",
    logo: <HubSpotLogo />,
    bgColor: "bg-orange-50",
  },
  {
    platform: "rybbit",
    label: "Rybbit",
    description: "Privacy-first website analytics",
    logo: <RybbitLogo />,
    bgColor: "bg-green-50",
  },
  {
    platform: "clarity",
    label: "Clarity",
    description: "Heatmaps and session recordings",
    logo: <ClarityLogo />,
    bgColor: "bg-blue-50",
  },
  {
    platform: "gsc",
    label: "Search Console",
    description: "Google search performance data",
    logo: <GoogleLogo />,
    bgColor: "bg-blue-50",
  },
];

interface Props {
  integrations: Integration[];
  selectedPlatform: string | null;
  onSelectPlatform: (platform: string) => void;
}

const STATUS_BADGE: Record<ProviderStatus, { label: string; className: string }> = {
  not_connected: {
    label: "Not connected",
    className: "bg-gray-100 text-gray-500",
  },
  active: {
    label: "Connected",
    className: "bg-green-100 text-green-700",
  },
  revoked: {
    label: "Revoked",
    className: "bg-red-100 text-red-700",
  },
  broken: {
    label: "Broken",
    className: "bg-amber-100 text-amber-700",
  },
};

export default function IntegrationProviderList({
  integrations,
  selectedPlatform,
  onSelectPlatform,
}: Props) {
  return (
    <div className="flex flex-col h-full border-r border-gray-200">
      {/* Sidebar header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Providers</h3>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {integrations.filter((i) => i.status === "active").length}/{PROVIDERS.length} Providers connected
          </span>
          {/* Placeholder for adding additional providers in v2 */}
          <button
            type="button"
            disabled
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-300 rounded-md cursor-not-allowed"
            title="More providers coming soon"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>
      </div>

      {/* Provider list */}
      <div className="flex-1 overflow-y-auto py-1">
        {PROVIDERS.map((provider) => {
          const integration = integrations.find(
            (i) => i.platform === provider.platform,
          );
          const status: ProviderStatus = integration?.status ?? "not_connected";
          const badge = STATUS_BADGE[status];
          const isActive = selectedPlatform === provider.platform;
          const portalId = getPortalId(integration);

          return (
            <motion.button
              key={provider.platform}
              type="button"
              onClick={() => onSelectPlatform(provider.platform)}
              whileTap={{ scale: 0.995 }}
              className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                isActive
                  ? "border-l-alloro-orange bg-orange-50/50"
                  : "border-l-transparent hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${provider.bgColor}`}
                >
                  {provider.logo}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {provider.label}
                    {integration?.label && (
                      <span className="text-gray-400 font-normal ml-1.5">
                        &middot; {integration.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {provider.description}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.className}`}
                >
                  {badge.label}
                </span>
                {portalId && (
                  <span className="text-[10px] text-gray-400 truncate">
                    Portal {portalId}
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function getPortalId(integration?: Integration): string | null {
  const portalId = integration?.metadata?.portalId;
  if (typeof portalId === "string" || typeof portalId === "number") {
    return String(portalId);
  }
  return null;
}
