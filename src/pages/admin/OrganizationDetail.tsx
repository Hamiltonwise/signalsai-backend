import { useState, useEffect, useRef, useCallback } from "react";
import { useAdminOrganization, useAdminOrganizationLocations, useInvalidateOrganizations } from "../../hooks/queries/useAdminQueries";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  RefreshCw,
  Crown,
  Users,
  Globe,
  AlertTriangle,
  Trash2,
  X,
  Loader2,
  CheckSquare,
  Database,
  Trophy,
  MessageSquare,
  FileText,
  TrendingUp,
  Target,
  Share2,
  Bell,
  Lock,
  Unlock,
  CreditCard,
  Key,
  Copy,
  Check,
  ChevronDown,
  Link2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { AdminPageHeader, Badge } from "../../components/ui/DesignSystem";
import { useConfirm } from "../../components/ui/ConfirmModal";
import { OrgLocationSelector } from "../../components/Admin/OrgLocationSelector";
import { OrgTasksTab } from "../../components/Admin/OrgTasksTab";
import { OrgPmsTab } from "../../components/Admin/OrgPmsTab";
import { OrgAgentOutputsTab } from "../../components/Admin/OrgAgentOutputsTab";
import { OrgRankingsTab } from "../../components/Admin/OrgRankingsTab";
import { OrgNotificationsTab } from "../../components/Admin/OrgNotificationsTab";
import {
  adminDeleteOrganization,
  adminStartPilotSession,
  adminLockoutOrganization,
  adminUnlockOrganization,
  adminCreateProject,
  adminRemovePaymentMethod,
  adminSetUserPassword,
  type AdminLocation,
  type AdminUser,
} from "../../api/admin-organizations";
import { fetchWebsites, linkWebsiteToOrganization } from "../../api/websites";

const TAB_KEYS = [
  "tasks",
  "notifications",
  "rankings",
  "pms",
  "proofline",
  "summary",
  "opportunity",
  "cro",
  "referral",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_CONFIG: Record<TabKey, { label: string; icon: React.ReactNode }> = {
  tasks: { label: "Tasks Hub", icon: <CheckSquare className="h-4 w-4" /> },
  notifications: { label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  rankings: { label: "Rankings", icon: <Trophy className="h-4 w-4" /> },
  pms: { label: "PMS Ingestion", icon: <Database className="h-4 w-4" /> },
  proofline: { label: "Proofline", icon: <MessageSquare className="h-4 w-4" /> },
  summary: { label: "Summary", icon: <FileText className="h-4 w-4" /> },
  opportunity: { label: "Opportunity", icon: <TrendingUp className="h-4 w-4" /> },
  cro: { label: "CRO", icon: <Target className="h-4 w-4" /> },
  referral: { label: "Referral Engine", icon: <Share2 className="h-4 w-4" /> },
};

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const confirm = useConfirm();
  const activeTab = (searchParams.get("tab") || "tasks") as TabKey;

  const orgId = parseInt(id || "0", 10);
  const { data: org, isLoading: orgLoading, error: orgError } = useAdminOrganization(orgId);
  const { data: locations = [], isLoading: locLoading } = useAdminOrganizationLocations(orgId);
  const { invalidateOne: invalidateOrg } = useInvalidateOrganizations();
  const loading = orgLoading || locLoading;

  const [selectedLocation, setSelectedLocation] =
    useState<AdminLocation | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLockoutLoading, setIsLockoutLoading] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isRemovingPayment, setIsRemovingPayment] = useState(false);

  // Attach Website state
  const [showAttachDropdown, setShowAttachDropdown] = useState(false);
  const [unlinkedWebsites, setUnlinkedWebsites] = useState<
    Array<{ id: string; generated_hostname: string }>
  >([]);
  const [loadingWebsites, setLoadingWebsites] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const attachDropdownRef = useRef<HTMLDivElement>(null);

  // Set Password Modal
  const [passwordModalUser, setPasswordModalUser] = useState<AdminUser | null>(null);
  const [notifyUser, setNotifyUser] = useState(true);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Redirect if orgId is invalid (0 or NaN)
  useEffect(() => {
    if (!orgId) {
      toast.error("Invalid organization ID");
      navigate("/admin/organization-management");
    }
  }, [orgId]);

  // Set initial selected location when data arrives
  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0]);
    }
  }, [locations]);

  const handleCreateProject = async () => {
    if (!org) return;
    setIsCreatingProject(true);
    try {
      const response = await adminCreateProject(orgId);
      if (response.success) {
        toast.success(response.message);
        // Reload data to reflect the new website project
        await invalidateOrg(orgId);
      } else {
        toast.error((response as any).error || "Failed to create project");
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error || error?.message || "Failed to create project";
      toast.error(message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const loadUnlinkedWebsites = useCallback(async () => {
    try {
      setLoadingWebsites(true);
      const response = await fetchWebsites({ limit: 500 });
      const unlinked = response.data
        .filter((w) => !w.organization)
        .map((w) => ({ id: w.id, generated_hostname: w.generated_hostname }));
      setUnlinkedWebsites(unlinked);
    } catch {
      toast.error("Failed to load websites");
    } finally {
      setLoadingWebsites(false);
    }
  }, []);

  const handleAttachWebsite = async (websiteId: string) => {
    setIsAttaching(true);
    setShowAttachDropdown(false);
    try {
      await linkWebsiteToOrganization(websiteId, orgId);
      toast.success("Website attached to organization");
      await invalidateOrg(orgId);
    } catch (error: any) {
      toast.error(error?.message || "Failed to attach website");
    } finally {
      setIsAttaching(false);
    }
  };

  // Close attach dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        attachDropdownRef.current &&
        !attachDropdownRef.current.contains(e.target as Node)
      ) {
        setShowAttachDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRemovePayment = async () => {
    if (!org) return;
    const confirmed = await confirm({ title: `Remove payment method for "${org.name}"?`, message: "This will cancel their Stripe subscription and revert them to admin-granted state (no billing).", confirmLabel: "Remove", variant: "danger" });
    if (!confirmed) return;

    setIsRemovingPayment(true);
    try {
      const response = await adminRemovePaymentMethod(orgId);
      if (response.success) {
        toast.success(response.message);
        await invalidateOrg(orgId);
      } else {
        toast.error((response as any).error || "Failed to remove payment method");
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error || error?.message || "Failed to remove payment method";
      toast.error(message);
    } finally {
      setIsRemovingPayment(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== org?.name || !org) return;
    setIsDeleting(true);

    try {
      await adminDeleteOrganization(orgId);
      toast.success(`"${org.name}" has been permanently deleted`);
      navigate("/admin/organization-management");
    } catch {
      toast.error("Failed to delete organization");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLockout = async () => {
    if (!org) return;
    setIsLockoutLoading(true);
    try {
      const response = await adminLockoutOrganization(orgId);
      if (response.success) {
        toast.success(response.message);
        await invalidateOrg(orgId);
      } else {
        toast.error((response as any).error || "Failed to lock out organization");
      }
    } catch {
      toast.error("Failed to lock out organization");
    } finally {
      setIsLockoutLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!org) return;
    setIsLockoutLoading(true);
    try {
      const response = await adminUnlockOrganization(orgId);
      if (response.success) {
        toast.success(response.message);
        await invalidateOrg(orgId);
      } else {
        toast.error("Failed to unlock organization");
      }
    } catch {
      toast.error("Failed to unlock organization");
    } finally {
      setIsLockoutLoading(false);
    }
  };

  const handlePilotSession = async (
    userId: number,
    userName: string,
    userRole: string,
  ) => {
    try {
      toast.loading(`Starting pilot session for ${userName}...`);
      const response = await adminStartPilotSession(userId);

      if (response.success) {
        toast.dismiss();
        toast.success("Pilot session started!");

        let pilotUrl = `/?pilot_token=${response.token}`;
        if (response.googleAccountId) {
          pilotUrl += `&organization_id=${response.googleAccountId}`;
        }
        pilotUrl += `&user_role=${userRole}`;

        const width = 1280;
        const height = 800;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        window.open(
          pilotUrl,
          "Pilot",
          `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
        );
      }
    } catch (error) {
      toast.dismiss();
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Pilot failed: ${message}`);
    }
  };

  const handleSetPassword = async () => {
    if (!passwordModalUser) return;
    setIsSettingPassword(true);
    try {
      const response = await adminSetUserPassword(passwordModalUser.id, notifyUser);
      if (response.success) {
        setGeneratedPassword(response.temporaryPassword);
        toast.success(response.message);
        await invalidateOrg(orgId);
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Failed to set password";
      toast.error(message);
    } finally {
      setIsSettingPassword(false);
    }
  };

  const closePasswordModal = () => {
    setPasswordModalUser(null);
    setGeneratedPassword(null);
    setNotifyUser(true);
    setCopied(false);
  };

  const handleCopyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <motion.div
          className="flex items-center gap-3 text-gray-500"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <RefreshCw className="h-5 w-5 animate-spin" />
          Loading organization...
        </motion.div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Organization not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/admin/organization-management")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Back to organizations"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <AdminPageHeader
            icon={<Globe className="w-6 h-6" />}
            title={org.name}
            description={org.domain || "No domain assigned"}
            actionButtons={
              <div className="flex items-center gap-3">
                <Badge variant="orange">DFY</Badge>
                <OrgLocationSelector
                  locations={locations}
                  selectedLocation={selectedLocation}
                  onSelect={setSelectedLocation}
                />
              </div>
            }
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex flex-wrap gap-px bg-gray-50 border-b border-gray-200 p-1">
          {TAB_KEYS.map((tab) => (
            <button
              key={tab}
              onClick={() => setSearchParams({ tab })}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab
                  ? "bg-white text-alloro-orange border border-alloro-orange/20"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {TAB_CONFIG[tab].icon}
              {TAB_CONFIG[tab].label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "tasks" && (
            <OrgTasksTab
              organizationId={orgId}
              locationId={selectedLocation?.id ?? null}
            />
          )}
          {activeTab === "notifications" && (
            <OrgNotificationsTab
              organizationId={orgId}
              locationId={selectedLocation?.id ?? null}
            />
          )}
          {activeTab === "rankings" && (
            <OrgRankingsTab
              organizationId={orgId}
              locationId={selectedLocation?.id ?? null}
            />
          )}
          {activeTab === "pms" && (
            <OrgPmsTab
              organizationId={orgId}
              locationId={selectedLocation?.id ?? null}
            />
          )}
          {activeTab === "proofline" && (
            <OrgAgentOutputsTab
              organizationId={orgId}
              agentType="proofline"
              locationId={selectedLocation?.id ?? null}
            />
          )}
          {activeTab === "summary" && (
            <OrgAgentOutputsTab
              organizationId={orgId}
              agentType="summary"
              locationId={selectedLocation?.id ?? null}
            />
          )}
          {activeTab === "opportunity" && (
            <OrgAgentOutputsTab
              organizationId={orgId}
              agentType="opportunity"
              locationId={selectedLocation?.id ?? null}
            />
          )}
          {activeTab === "cro" && (
            <OrgAgentOutputsTab
              organizationId={orgId}
              agentType="cro_optimizer"
              locationId={selectedLocation?.id ?? null}
            />
          )}
          {activeTab === "referral" && (
            <OrgAgentOutputsTab
              organizationId={orgId}
              agentType="referral_engine"
              locationId={selectedLocation?.id ?? null}
            />
          )}
        </div>
      </div>

      {/* Subscription & Project Management */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gray-200 bg-white p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Crown className="h-5 w-5 text-alloro-orange" />
          <h3 className="font-semibold text-gray-900">Subscription & Project</h3>
        </div>

        {/* Billing Status Row */}
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm text-gray-600">
            Tier: <strong>DFY</strong>
          </span>
          {/* Billing status badge */}
          {org.subscription_status === "inactive" ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-red-50 text-red-700 border border-red-200">
              <Lock className="h-3 w-3" /> Locked Out
            </span>
          ) : org.stripe_customer_id ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-green-50 text-green-700 border border-green-200">
              ✓ Stripe Active
            </span>
          ) : org.subscription_status === "active" ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              ⚠ Admin-Granted (No Billing)
            </span>
          ) : null}
          {/* Website project status */}
          {org.website ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              <Globe className="h-3 w-3" /> Project: {org.website.generated_hostname}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-gray-50 text-gray-500 border border-gray-200">
              No Website Project
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Create Project — only when no website project exists */}
          {!org.website && (
            <button
              onClick={handleCreateProject}
              disabled={isCreatingProject}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-alloro-orange rounded-lg hover:bg-alloro-orange/90 transition-colors disabled:opacity-50"
            >
              <Globe className="h-3.5 w-3.5" />
              {isCreatingProject ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </button>
          )}

          {/* Attach Existing Website — only when no website project exists */}
          {!org.website && (
            <div className="relative" ref={attachDropdownRef}>
              <button
                onClick={() => {
                  if (!showAttachDropdown) loadUnlinkedWebsites();
                  setShowAttachDropdown(!showAttachDropdown);
                }}
                disabled={isAttaching}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Link2 className="h-3.5 w-3.5" />
                {isAttaching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Attaching...
                  </>
                ) : (
                  "Attach Website"
                )}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showAttachDropdown ? "rotate-180" : ""}`}
                />
              </button>

              {showAttachDropdown && (
                <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                  {loadingWebsites ? (
                    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading websites...
                    </div>
                  ) : unlinkedWebsites.length === 0 ? (
                    <div className="px-4 py-2 text-sm text-gray-500">
                      No unlinked websites available
                    </div>
                  ) : (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                        Available Websites
                      </div>
                      {unlinkedWebsites.map((site) => (
                        <button
                          key={site.id}
                          onClick={() => handleAttachWebsite(site.id)}
                          disabled={isAttaching}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 w-full text-left disabled:opacity-50"
                        >
                          <Globe className="h-4 w-4" />
                          {site.generated_hostname}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Remove Payment Method — only when Stripe billing is active */}
          {org.stripe_customer_id && (
            <button
              onClick={handleRemovePayment}
              disabled={isRemovingPayment}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <CreditCard className="h-3.5 w-3.5" />
              {isRemovingPayment ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Payment"
              )}
            </button>
          )}

          {/* Lockout / Unlock Buttons */}
          {org.subscription_status !== "inactive" && !org.stripe_customer_id && (
            <button
              onClick={handleLockout}
              disabled={isLockoutLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {isLockoutLoading ? "Locking..." : "Lock Out"}
            </button>
          )}
          {org.subscription_status === "inactive" && (
            <button
              onClick={handleUnlock}
              disabled={isLockoutLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              <Unlock className="h-3.5 w-3.5" />
              {isLockoutLoading ? "Unlocking..." : "Unlock"}
            </button>
          )}
        </div>
      </motion.div>

      {/* Users List */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gray-200 bg-white p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-alloro-navy" />
          <h3 className="font-semibold text-gray-900">Users & Roles</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(org.users || []).map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 hover:border-alloro-orange/30 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-alloro-navy/10 text-sm font-semibold text-alloro-navy">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {user.name}
                  </p>
                  {user.has_password ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-green-50 text-green-600 border border-green-200" title="Password set">
                      <Key className="h-2.5 w-2.5" /> PW
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-600 border border-amber-200" title="No password">
                      <Key className="h-2.5 w-2.5" /> No PW
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-gray-500">{user.email}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    setPasswordModalUser(user);
                    setGeneratedPassword(null);
                    setNotifyUser(true);
                    setCopied(false);
                  }}
                  className="p-2 text-gray-400 hover:text-alloro-orange hover:bg-alloro-orange/10 rounded-lg transition-colors"
                  title="Set password"
                >
                  <Key className="h-4 w-4" />
                </button>
                <button
                  onClick={() =>
                    handlePilotSession(user.id, user.name, user.role)
                  }
                  className="p-2 text-gray-400 hover:text-alloro-orange hover:bg-alloro-orange/10 rounded-lg transition-colors"
                  title="Pilot as this user"
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Connections */}
      {(org.connections || []).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-gray-200 bg-white p-6"
        >
          <h3 className="font-semibold text-gray-900 mb-4">Connections</h3>
          <div className="space-y-3">
            {(org.connections || []).map((conn, idx) => (
              <div key={idx} className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-600">
                  Connected via{" "}
                  <span className="font-medium">{conn.email}</span>
                </p>
                {conn.properties?.gbp && conn.properties.gbp.length > 0 ? (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2 py-1 inline-block mt-2 font-medium">
                    GBP: {conn.properties.gbp.length} locations
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded px-2 py-1 inline-block mt-2">
                    No GBP
                  </p>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-red-200 overflow-hidden"
      >
        <div className="px-6 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h3 className="font-semibold text-red-900">Danger Zone</h3>
        </div>
        <div className="p-6 bg-white flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              Delete this organization
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Permanently remove this organization and all of its data.
            </p>
          </div>
          <button
            onClick={() => setDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors shrink-0"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </motion.div>

      {/* Set Password Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => !isSettingPassword && closePasswordModal()}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden"
          >
            <button
              onClick={() => !isSettingPassword && closePasswordModal()}
              disabled={isSettingPassword}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-alloro-orange/10 text-alloro-orange">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Set Temporary Password
                  </h3>
                  <p className="text-sm text-gray-500">{passwordModalUser.email}</p>
                </div>
              </div>

              {!generatedPassword ? (
                <>
                  <div className="space-y-4 mb-6">
                    <p className="text-sm text-gray-600">
                      This will generate a temporary password for{" "}
                      <strong>{passwordModalUser.name}</strong>.
                      {passwordModalUser.has_password
                        ? " Their existing password will be replaced."
                        : " They currently have no password set (Google-only account)."}
                    </p>

                    <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-alloro-orange/30 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifyUser}
                        onChange={(e) => setNotifyUser(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Notify user via email</p>
                        <p className="text-xs text-gray-500">
                          Send an email with the temporary password and a link to change it
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={closePasswordModal}
                      disabled={isSettingPassword}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSetPassword}
                      disabled={isSettingPassword}
                      className="px-4 py-2 text-sm font-medium text-white bg-alloro-orange hover:bg-alloro-orange/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSettingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                      Set Temporary Password
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-4 mb-6">
                    <p className="text-sm text-gray-600">
                      Temporary password has been set{notifyUser ? " and emailed to the user" : ""}.
                    </p>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2">
                        Temporary Password
                      </p>
                      <div className="flex items-center gap-3">
                        <code className="text-lg font-mono font-bold text-gray-900 tracking-wider flex-1">
                          {generatedPassword}
                        </code>
                        <button
                          onClick={handleCopyPassword}
                          className="p-2 text-gray-400 hover:text-alloro-orange hover:bg-alloro-orange/10 rounded-lg transition-colors"
                          title="Copy to clipboard"
                        >
                          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {!notifyUser && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        The user was not notified. Make sure to communicate the password through another channel.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button
                      onClick={closePasswordModal}
                      className="px-4 py-2 text-sm font-medium text-white bg-alloro-navy hover:bg-alloro-navy/90 rounded-lg transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => !isDeleting && setDeleteConfirm(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden"
          >
            <button
              onClick={() => !isDeleting && setDeleteConfirm(false)}
              disabled={isDeleting}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-red-50 text-red-600">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Delete Organization
                </h3>
              </div>

              <div className="space-y-4 mb-6">
                <p className="text-sm text-gray-600">
                  This will{" "}
                  <strong className="text-red-600">permanently delete</strong> "
                  {org.name}" and all associated data.
                </p>
                <p className="text-sm text-red-600 font-bold">
                  This action cannot be undone.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type <strong>"{org.name}"</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-300"
                  placeholder={org.name}
                  disabled={isDeleting}
                  autoComplete="off"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== org.name || isDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete Organization
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
