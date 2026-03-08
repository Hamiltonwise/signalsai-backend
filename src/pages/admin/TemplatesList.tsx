import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  AlertCircle,
  Loader2,
  FileCode,
  Trash2,
  Plus,
  Clock,
  Zap,
  Upload,
} from "lucide-react";
import {
  deleteTemplate,
  createTemplate,
  activateTemplate,
} from "../../api/templates";
import type { Template } from "../../api/templates";
import {
  useAdminTemplates,
  useInvalidateAdminTemplates,
} from "../../hooks/queries/useAdminQueries";
import {
  AdminPageHeader,
  FilterBar,
  EmptyState,
  Badge,
  ActionButton,
  TabBar,
} from "../../components/ui/DesignSystem";
import ImportsList from "./ImportsList";
import { ConfirmModal } from "../../components/settings/ConfirmModal";
import { AlertModal } from "../../components/ui/AlertModal";

/**
 * Templates & Imports Page
 * Tabbed admin page under Done For You > Templates
 * Tab 1: Templates — manage website-builder templates
 * Tab 2: Imports — manage self-hosted CSS/JS/images
 */
export default function TemplatesList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "templates");

  // Template state (TanStack Query)
  const { data: templatesResponse, isLoading: loading, error: queryError, isFetching, refetch: refetchTemplates } = useAdminTemplates();
  const { invalidateAll: invalidateTemplates } = useInvalidateAdminTemplates();

  const templates = templatesResponse?.data ?? [];
  const error = queryError?.message ?? null;

  // Action loading states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "error" | "success" | "info";
  }>({ isOpen: false, title: "", message: "" });

  const handleCreate = async () => {
    if (creating) return;

    try {
      setCreating(true);
      const response = await createTemplate({ name: "Untitled Template" });
      navigate(`/admin/templates/${response.data.id}`);
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: "Create Failed",
        message: err instanceof Error ? err.message : "Failed to create template",
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) return;

    setConfirmModal({
      isOpen: true,
      title: "Delete Template",
      message: "Are you sure you want to DELETE this template? This action cannot be undone.",
      type: "danger",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          setDeletingId(id);
          await deleteTemplate(id);
          await invalidateTemplates();
        } catch (err) {
          setAlertModal({
            isOpen: true,
            title: "Delete Failed",
            message: err instanceof Error ? err.message : "Failed to delete template",
            type: "error",
          });
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleActivate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activatingId) return;

    try {
      setActivatingId(id);
      await activateTemplate(id);
      await invalidateTemplates();
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: "Activation Failed",
        message: err instanceof Error ? err.message : "Failed to activate template",
        type: "error",
      });
    } finally {
      setActivatingId(null);
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const filteredTemplates = templates.filter((t) => {
    if (statusFilter === "all") return true;
    return t.status === statusFilter;
  });

  const tabs = [
    {
      id: "templates",
      label: "Templates",
      icon: <FileCode className="w-4 h-4" />,
    },
    {
      id: "imports",
      label: "Imports",
      icon: <Upload className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<FileCode className="w-6 h-6" />}
        title="Templates & Imports"
        description="Manage website builder templates and self-hosted assets"
      />

      {/* Tab Bar */}
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Templates Tab */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          {/* Templates Action Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge label={`${templates.length} total`} color="blue" />
            </div>
            <div className="flex items-center gap-2">
              <ActionButton
                label={creating ? "Creating..." : "New Template"}
                icon={
                  creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )
                }
                onClick={handleCreate}
                variant="primary"
                disabled={creating}
              />
              <ActionButton
                label={loading ? "Loading" : "Refresh"}
                icon={
                  <RefreshCw
                    className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                  />
                }
                onClick={() => invalidateTemplates()}
                variant="secondary"
                disabled={loading}
                loading={loading}
              />
            </div>
          </div>

          {/* Filters */}
          <FilterBar>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <ActionButton
                label="Reset"
                onClick={() => setStatusFilter("all")}
                variant="secondary"
              />
            </div>
          </FilterBar>

          {/* Error State */}
          <AnimatePresence>
            {error && (
              <motion.div
                className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">
                    Error loading templates
                  </p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
                <ActionButton
                  label="Retry"
                  onClick={() => invalidateTemplates()}
                  variant="danger"
                  size="sm"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading State - use top bar only */}
          {loading && templates.length === 0 ? null : filteredTemplates.length === 0 ? (
            <EmptyState
              icon={<FileCode className="w-12 h-12" />}
              title="No templates found"
              description={
                statusFilter !== "all"
                  ? "No templates match the selected filter. Try adjusting your filter or create a new template."
                  : "Create your first template to get started with website generation."
              }
              action={{ label: "Create Template", onClick: handleCreate }}
            />
          ) : (
            /* Templates List */
            <div className="space-y-3">
              {filteredTemplates.map((template, index) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                  onClick={() => navigate(`/admin/templates/${template.id}`)}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md cursor-pointer"
                >
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div
                        className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-shadow ${
                          template.is_active
                            ? "bg-orange-100 shadow-[0_0_12px_rgba(214,104,83,0.4)]"
                            : "bg-gray-100"
                        }`}
                      >
                        <FileCode
                          className={`w-5 h-5 ${
                            template.is_active
                              ? "text-alloro-orange"
                              : "text-gray-400"
                          }`}
                        />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-base font-semibold text-gray-900">
                              {template.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Active badge */}
                            {template.is_active && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-alloro-orange">
                                <Zap className="h-3 w-3" />
                                Active
                              </span>
                            )}
                            {/* Status badge */}
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                template.status === "published"
                                  ? "border-green-200 bg-green-100 text-green-700"
                                  : "border-gray-200 bg-gray-100 text-gray-700"
                              }`}
                            >
                              {template.status === "published"
                                ? "Published"
                                : "Draft"}
                            </span>
                          </div>
                        </div>

                        {/* Metadata row */}
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                            <span>
                              Created {formatRelativeTime(template.created_at)}
                            </span>
                          </div>
                          {template.updated_at !== template.created_at && (
                            <div className="flex items-center gap-1.5 text-gray-500">
                              <span>
                                Updated{" "}
                                {formatRelativeTime(template.updated_at)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div
                        className="flex items-center gap-2 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Activate */}
                        {!template.is_active && (
                          <motion.button
                            onClick={(e) => handleActivate(template.id, e)}
                            disabled={activatingId !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-alloro-orange transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            {activatingId === template.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Zap className="h-3.5 w-3.5" />
                            )}
                            Activate
                          </motion.button>
                        )}

                        {/* Delete */}
                        {deletingId === template.id ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Deleting...
                          </span>
                        ) : (
                          <motion.button
                            onClick={(e) => handleDelete(template.id, e)}
                            disabled={deletingId !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Summary Stats */}
          {!loading && !error && templates.length > 0 && (
            <motion.div
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <span className="text-sm text-gray-600">
                Showing {filteredTemplates.length} of {templates.length}{" "}
                template
                {templates.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-gray-600">
                    <strong className="text-gray-900">
                      {
                        templates.filter((t) => t.status === "published")
                          .length
                      }
                    </strong>{" "}
                    published
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-gray-400" />
                  <span className="text-gray-600">
                    <strong className="text-gray-900">
                      {templates.filter((t) => t.status === "draft").length}
                    </strong>{" "}
                    draft
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-alloro-orange" />
                  <span className="text-gray-600">
                    <strong className="text-gray-900">
                      {templates.filter((t) => t.is_active).length}
                    </strong>{" "}
                    active
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Imports Tab */}
      {activeTab === "imports" && <ImportsList />}

      {/* Modals */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText="Delete"
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((prev) => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}
