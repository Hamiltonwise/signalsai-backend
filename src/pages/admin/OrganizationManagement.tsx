import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  ChevronRight,
  Building,
  Edit2,
  X,
  RefreshCw,
  Plus,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  AdminPageHeader,
  Badge,
  EmptyState,
} from "../../components/ui/DesignSystem";
import {
  cardVariants,
  staggerContainer,
} from "../../lib/animations";
import {
  adminUpdateOrganizationName,
  adminCreateOrganization,
  type AdminOrganization,
  type AdminCreateOrgInput,
} from "../../api/admin-organizations";
import {
  useAdminOrganizations,
  useInvalidateOrganizations,
} from "../../hooks/queries/useAdminQueries";

const EMPTY_CREATE_FORM: AdminCreateOrgInput = {
  organization: { name: "", domain: "", address: "" },
  user: { email: "", password: "", firstName: "", lastName: "" },
  location: { name: "", address: "" },
};

export function OrganizationManagement() {
  const { data: organizations = [], isLoading: loading, isFetching } = useAdminOrganizations();
  const { invalidateAll: refetchOrganizations } = useInvalidateOrganizations();

  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  // Create Organization modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] =
    useState<AdminCreateOrgInput>(EMPTY_CREATE_FORM);
  const [isCreating, setIsCreating] = useState(false);

  const startEditing = (e: React.MouseEvent, org: AdminOrganization) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingOrgId(org.id);
    setEditName(org.name);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingOrgId(null);
    setEditName("");
  };

  const handleUpdateName = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editingOrgId || !editName.trim()) return;

    try {
      const response = await adminUpdateOrganizationName(editingOrgId, editName);
      if (response.success) {
        toast.success("Organization updated");
        setEditingOrgId(null);
        await refetchOrganizations();
      } else {
        toast.error("Failed to update organization");
      }
    } catch {
      toast.error("Failed to update organization");
    }
  };

  const handleCreateOrganization = async () => {
    if (!createForm.organization.name.trim()) {
      toast.error("Organization name is required");
      return;
    }
    if (!createForm.user.email.trim()) {
      toast.error("User email is required");
      return;
    }
    if (!createForm.user.password) {
      toast.error("Password is required");
      return;
    }

    setIsCreating(true);
    try {
      const response = await adminCreateOrganization(createForm);
      if (response.success) {
        toast.success(response.message || "Organization created");
        setShowCreateModal(false);
        setCreateForm(EMPTY_CREATE_FORM);
        refetchOrganizations();
      } else {
        toast.error("Failed to create organization");
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to create organization";
      toast.error(message);
    } finally {
      setIsCreating(false);
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
          Loading organizations...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<Building className="w-6 h-6" />}
        title="Organizations"
        description="Manage accounts and their integrations"
        actionButtons={
          <div className="flex items-center gap-3">
            <Badge label={`${organizations.length} total`} color="blue" />
            <motion.button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-xl bg-alloro-orange px-4 py-2 text-sm font-bold text-white hover:bg-alloro-navy transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus className="h-4 w-4" />
              Create Organization
            </motion.button>
          </div>
        }
      />

      {organizations.length === 0 ? (
        <EmptyState
          icon={<Building className="w-8 h-8" />}
          title="No organizations"
          description="No organizations have been created yet."
        />
      ) : (
        <motion.div
          className="space-y-3"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {organizations.map((org, index) => (
            <Link
              key={org.id}
              to={`/admin/organizations/${org.id}`}
              className="block no-underline"
            >
              <motion.div
                custom={index}
                variants={cardVariants}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all hover:shadow-lg hover:border-alloro-orange/30"
              >
                <div className="flex items-center gap-4 p-5">
                  <motion.div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-alloro-navy/5 text-alloro-navy"
                    whileHover={{ scale: 1.05, rotate: 5 }}
                  >
                    <Building className="h-6 w-6" />
                  </motion.div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {editingOrgId === org.id ? (
                        <motion.div
                          className="flex items-center gap-2"
                          onClick={(e) => e.preventDefault()}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                            autoFocus
                          />
                          <motion.button
                            onClick={handleUpdateName}
                            className="rounded-lg bg-alloro-orange p-1.5 text-white hover:bg-alloro-navy transition-colors"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            ✓
                          </motion.button>
                          <motion.button
                            onClick={cancelEditing}
                            className="rounded-lg bg-gray-100 p-1.5 text-gray-600 hover:bg-gray-200 transition-colors"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <X className="h-4 w-4" />
                          </motion.button>
                        </motion.div>
                      ) : (
                        <div className="group/name flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 text-lg">
                            {org.name}
                          </h3>
                          <Badge variant="orange">DFY</Badge>
                          {/* Billing status badge */}
                          {org.subscription_status === "inactive" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-50 text-red-700 border border-red-200">
                              🔒 Locked
                            </span>
                          ) : org.stripe_customer_id ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-50 text-green-700 border border-green-200">
                              ✓ Active
                            </span>
                          ) : org.subscription_status === "active" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              ⚠ No Billing
                            </span>
                          ) : null}
                          <motion.button
                            onClick={(e) => startEditing(e, org)}
                            className="opacity-0 transition-opacity group-hover/name:opacity-100 p-1.5 text-gray-400 hover:text-alloro-orange rounded-lg hover:bg-alloro-orange/10"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </motion.button>
                        </div>
                      )}
                      {org.domain && (
                        <Badge label={org.domain} color="gray" />
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {org.userCount} users
                      </span>
                      <span className="text-gray-300">|</span>
                      <span
                        className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg ${
                          org.connections.gbp
                            ? "text-green-700 bg-green-50"
                            : "text-gray-400 bg-gray-50"
                        }`}
                      >
                        {org.connections.gbp ? "✓" : "○"} GBP
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </motion.div>
            </Link>
          ))}
        </motion.div>
      )}

      {/* ── Create Organization Modal ── */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-alloro-navy tracking-tight">
                  Create Organization
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Organization Section */}
                <div>
                  <h3 className="text-sm font-bold text-alloro-navy uppercase tracking-wider mb-3">
                    Organization
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={createForm.organization.name}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            organization: {
                              ...prev.organization,
                              name: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        placeholder="e.g. Dr. Smith Dental Practice"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Domain
                      </label>
                      <input
                        type="text"
                        value={createForm.organization.domain || ""}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            organization: {
                              ...prev.organization,
                              domain: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        placeholder="e.g. smithdental.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address
                      </label>
                      <input
                        type="text"
                        value={createForm.organization.address || ""}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            organization: {
                              ...prev.organization,
                              address: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        placeholder="e.g. 123 Main St, City, State"
                      />
                    </div>
                  </div>
                </div>

                {/* User Section */}
                <div>
                  <h3 className="text-sm font-bold text-alloro-navy uppercase tracking-wider mb-3">
                    Admin User
                  </h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          First Name
                        </label>
                        <input
                          type="text"
                          value={createForm.user.firstName || ""}
                          onChange={(e) =>
                            setCreateForm((prev) => ({
                              ...prev,
                              user: {
                                ...prev.user,
                                firstName: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={createForm.user.lastName || ""}
                          onChange={(e) =>
                            setCreateForm((prev) => ({
                              ...prev,
                              user: {
                                ...prev.user,
                                lastName: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={createForm.user.email}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            user: { ...prev.user, email: e.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        placeholder="user@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        value={createForm.user.password}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            user: { ...prev.user, password: e.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        placeholder="Min 8 chars, 1 uppercase, 1 number"
                      />
                    </div>
                  </div>
                </div>

                {/* Location Section */}
                <div>
                  <h3 className="text-sm font-bold text-alloro-navy uppercase tracking-wider mb-3">
                    Primary Location
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location Name
                      </label>
                      <input
                        type="text"
                        value={createForm.location.name}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            location: {
                              ...prev.location,
                              name: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        placeholder="Defaults to organization name if empty"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location Address
                      </label>
                      <input
                        type="text"
                        value={createForm.location.address || ""}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            location: {
                              ...prev.location,
                              address: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        placeholder="e.g. 123 Main St, City, State"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateForm(EMPTY_CREATE_FORM);
                  }}
                  className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  onClick={handleCreateOrganization}
                  disabled={isCreating}
                  className="flex items-center gap-2 rounded-xl bg-alloro-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-alloro-navy transition-colors disabled:opacity-50"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Plus className="h-4 w-4" />
                  {isCreating ? "Creating..." : "Create Organization"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
