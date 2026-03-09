import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Globe,
  Lock,
  Unlock,
  CreditCard,
  Link2,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "../ui/ConfirmModal";
import {
  adminCreateProject,
  adminRemovePaymentMethod,
  adminLockoutOrganization,
  adminUnlockOrganization,
  type AdminOrganizationDetail,
} from "../../api/admin-organizations";
import { fetchWebsites, linkWebsiteToOrganization } from "../../api/websites";

interface OrgSubscriptionSectionProps {
  org: AdminOrganizationDetail;
  orgId: number;
  onRefresh: () => Promise<void>;
}

export function OrgSubscriptionSection({
  org,
  orgId,
  onRefresh,
}: OrgSubscriptionSectionProps) {
  const confirm = useConfirm();
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isRemovingPayment, setIsRemovingPayment] = useState(false);
  const [isLockoutLoading, setIsLockoutLoading] = useState(false);

  // Attach Website state
  const [showAttachDropdown, setShowAttachDropdown] = useState(false);
  const [unlinkedWebsites, setUnlinkedWebsites] = useState<
    Array<{ id: string; generated_hostname: string }>
  >([]);
  const [loadingWebsites, setLoadingWebsites] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const attachDropdownRef = useRef<HTMLDivElement>(null);

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

  const handleCreateProject = async () => {
    setIsCreatingProject(true);
    try {
      const response = await adminCreateProject(orgId);
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
      } else {
        toast.error((response as any).error || "Failed to create project");
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to create project";
      toast.error(message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleAttachWebsite = async (websiteId: string) => {
    setIsAttaching(true);
    setShowAttachDropdown(false);
    try {
      await linkWebsiteToOrganization(websiteId, orgId);
      toast.success("Website attached to organization");
      await onRefresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to attach website");
    } finally {
      setIsAttaching(false);
    }
  };

  const handleRemovePayment = async () => {
    const confirmed = await confirm({
      title: `Remove payment method for "${org.name}"?`,
      message:
        "This will cancel their Stripe subscription and revert them to admin-granted state (no billing).",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsRemovingPayment(true);
    try {
      const response = await adminRemovePaymentMethod(orgId);
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
      } else {
        toast.error(
          (response as any).error || "Failed to remove payment method",
        );
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to remove payment method";
      toast.error(message);
    } finally {
      setIsRemovingPayment(false);
    }
  };

  const handleLockout = async () => {
    setIsLockoutLoading(true);
    try {
      const response = await adminLockoutOrganization(orgId);
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
      } else {
        toast.error(
          (response as any).error || "Failed to lock out organization",
        );
      }
    } catch {
      toast.error("Failed to lock out organization");
    } finally {
      setIsLockoutLoading(false);
    }
  };

  const handleUnlock = async () => {
    setIsLockoutLoading(true);
    try {
      const response = await adminUnlockOrganization(orgId);
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
      } else {
        toast.error("Failed to unlock organization");
      }
    } catch {
      toast.error("Failed to unlock organization");
    } finally {
      setIsLockoutLoading(false);
    }
  };

  return (
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
        {org.website ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <Globe className="h-3 w-3" /> Project:{" "}
            {org.website.generated_hostname}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-gray-50 text-gray-500 border border-gray-200">
            No Website Project
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
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
  );
}
