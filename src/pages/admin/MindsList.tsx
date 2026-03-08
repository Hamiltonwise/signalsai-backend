import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Bot,
  Radio,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  AdminPageHeader,
  ActionButton,
  EmptyState,
} from "../../components/ui/DesignSystem";
import { createMind } from "../../api/minds";
import { useAdminMinds } from "../../hooks/queries/useAdminQueries";
import { MindPublishChannelsTab } from "../../components/Admin/minds/MindPublishChannelsTab";

function MindsEntryTransition() {
  // Only show when entering from outside the minds section
  const [show] = useState(
    () => !document.body.classList.contains("minds-page-active"),
  );
  const [visible, setVisible] = useState(show);

  if (!show) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="minds-entry-overlay"
          initial={{ clipPath: "circle(150% at 50% 50%)" }}
          animate={{ clipPath: "circle(0% at 100% 100%)" }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          onAnimationComplete={() => setVisible(false)}
        />
      )}
    </AnimatePresence>
  );
}

export default function MindsList() {
  const navigate = useNavigate();
  const { data: minds = [], isLoading: loading, error: queryError, refetch } = useAdminMinds();
  const error = queryError?.message ?? null;

  // Full-dark body when on minds page
  useEffect(() => {
    document.body.classList.add("minds-page-active");
    return () => document.body.classList.remove("minds-page-active");
  }, []);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPersonality, setCreatePersonality] = useState("");
  const [creating, setCreating] = useState(false);
  const [showChannels, setShowChannels] = useState(false);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const mind = await createMind(
        createName.trim(),
        createPersonality.trim(),
      );
      if (mind) {
        toast.success(`Mind "${mind.name}" created`);
        setShowCreate(false);
        setCreateName("");
        setCreatePersonality("");
        navigate(`/admin/minds/${mind.id}`);
      } else {
        toast.error("Failed to create mind");
      }
    } catch {
      toast.error("Failed to create mind");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="minds-theme">
      <MindsEntryTransition />
      <div className="minds-microdots" />
      <div className="relative z-[1]">
        <AdminPageHeader
          icon={<Brain className="h-6 w-6" />}
          title="Minds"
          description="Agents that think. A system that improves."
          actionButtons={
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowChannels(!showChannels)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all liquid-glass ${
                  showChannels
                    ? "text-alloro-orange border-alloro-orange/30"
                    : "text-[#a0a0a8] hover:text-[#eaeaea]"
                }`}
              >
                <Radio className="h-4 w-4" />
                Publish Channels
              </button>
              <ActionButton
                label="Create Mind"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setShowCreate(true)}
                variant="primary"
              />
            </div>
          }
        />

        {/* Create modal */}
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl liquid-glass p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#eaeaea]">
                Create New Mind
              </h3>
              <button
                onClick={() => setShowCreate(false)}
                className="text-[#6a6a75] hover:text-[#a0a0a8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#a0a0a8] mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. CROSEO"
                  className="w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2 text-sm text-[#eaeaea] placeholder-[#6a6a75] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#a0a0a8] mb-1">
                  Personality Prompt
                </label>
                <textarea
                  value={createPersonality}
                  onChange={(e) => setCreatePersonality(e.target.value)}
                  placeholder="Describe this mind's personality and role..."
                  rows={4}
                  className="w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2 text-sm text-[#eaeaea] placeholder-[#6a6a75] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <ActionButton
                  label="Cancel"
                  onClick={() => setShowCreate(false)}
                  variant="ghost"
                />
                <ActionButton
                  label="Create"
                  onClick={handleCreate}
                  variant="primary"
                  disabled={!createName.trim()}
                  loading={creating}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Publish Channels section */}
        {showChannels && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl liquid-glass p-6"
          >
            <MindPublishChannelsTab />
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-sm text-alloro-orange hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && minds.length === 0 && (
          <EmptyState
            icon={<Brain className="h-8 w-8" />}
            title="No minds yet"
            description="Create your first AI mind to get started."
          />
        )}

        {/* Cards grid */}
        {!loading && !error && minds.length > 0 && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {minds.map((mind, i) => (
              <motion.div
                key={mind.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => navigate(`/admin/minds/${mind.id}`)}
                className="cursor-pointer rounded-2xl liquid-glass p-6 transition-all hover:border-alloro-orange/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_40px_rgba(214,104,83,0.08)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-alloro-orange text-white">
                    <Bot className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-[#eaeaea]">
                    {mind.name}
                  </h3>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
