import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Radio,
  Link,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ActionButton, EmptyState } from "../../ui/DesignSystem";
import {
  listPublishChannels,
  createPublishChannel,
  updatePublishChannel,
  deletePublishChannel,
  type PublishChannel,
} from "../../../api/minds";

const inputClass =
  "w-full rounded-lg border border-white/8 bg-white/[0.04] backdrop-blur-sm px-3 py-2 text-sm text-[#c2c0b6] placeholder-[#6a6a75] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50";

export function MindPublishChannelsTab() {
  const [channels, setChannels] = useState<PublishChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    const data = await listPublishChannels();
    setChannels(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleAdd = async () => {
    if (!addName.trim() || !addUrl.trim()) return;
    setAdding(true);
    const ch = await createPublishChannel({
      name: addName.trim(),
      webhook_url: addUrl.trim(),
      description: addDesc.trim() || undefined,
    });
    if (ch) {
      toast.success("Channel created");
      setShowAdd(false);
      setAddName("");
      setAddUrl("");
      setAddDesc("");
      fetchChannels();
    } else {
      toast.error("Failed to create channel");
    }
    setAdding(false);
  };

  const handleStartEdit = (ch: PublishChannel) => {
    setEditingId(ch.id);
    setEditName(ch.name);
    setEditUrl(ch.webhook_url);
    setEditDesc(ch.description || "");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || !editUrl.trim()) return;
    setSaving(true);
    const updated = await updatePublishChannel(editingId, {
      name: editName.trim(),
      webhook_url: editUrl.trim(),
      description: editDesc.trim() || undefined,
    });
    if (updated) {
      toast.success("Channel updated");
      setEditingId(null);
      fetchChannels();
    } else {
      toast.error("Failed to update channel");
    }
    setSaving(false);
  };

  const handleDelete = async (channelId: string) => {
    setDeletingId(channelId);
    const ok = await deletePublishChannel(channelId);
    if (ok) {
      toast.success("Channel deleted");
      fetchChannels();
    } else {
      toast.error("Failed to delete channel");
    }
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#6a6a75]" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-[#eaeaea]">Publish Channels</h3>
          <p className="text-xs text-[#6a6a75] mt-1">
            Configure where approved work gets published. Each channel points to an n8n webhook.
          </p>
        </div>
        {!showAdd && (
          <ActionButton
            label="Add Channel"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAdd(true)}
            variant="primary"
            size="sm"
          />
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-alloro-orange/30 bg-white/[0.04] backdrop-blur-sm p-5 mb-4">
          <h4 className="text-sm font-semibold text-[#eaeaea] mb-3">New Publish Channel</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a8] mb-1">Name</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. X / Twitter"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a8] mb-1">Webhook URL</label>
              <input
                type="text"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="https://your-n8n.com/webhook/..."
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a8] mb-1">Description (optional)</label>
              <input
                type="text"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                placeholder="What this channel publishes to"
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <ActionButton
                label="Cancel"
                onClick={() => { setShowAdd(false); setAddName(""); setAddUrl(""); setAddDesc(""); }}
                variant="ghost"
                size="sm"
              />
              <ActionButton
                label="Create"
                icon={<Plus className="h-4 w-4" />}
                onClick={handleAdd}
                variant="primary"
                size="sm"
                loading={adding}
                disabled={!addName.trim() || !addUrl.trim()}
              />
            </div>
          </div>
        </div>
      )}

      {/* Channel list */}
      {channels.length === 0 && !showAdd ? (
        <EmptyState
          icon={<Radio className="h-8 w-8" />}
          title="No publish channels yet"
          description="Add a channel to enable publishing approved work to external platforms via n8n webhooks."
        />
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="rounded-xl border border-white/8 bg-white/[0.04] p-4 group"
            >
              {editingId === ch.id ? (
                /* Edit mode */
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#a0a0a8] mb-1">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#a0a0a8] mb-1">Webhook URL</label>
                    <input
                      type="text"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#a0a0a8] mb-1">Description</label>
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded-lg text-[#6a6a75] hover:text-[#eaeaea] hover:bg-white/[0.06] transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving || !editName.trim() || !editUrl.trim()}
                      className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloro-orange/10 text-alloro-orange mt-0.5">
                    <Radio className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-[#eaeaea]">{ch.name}</h4>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        ch.status === "active"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-white/[0.06] text-[#6a6a75]"
                      }`}>
                        {ch.status}
                      </span>
                    </div>
                    {ch.description && (
                      <p className="text-xs text-[#6a6a75] mt-0.5">{ch.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Link className="h-3 w-3 text-[#6a6a75]" />
                      <code className="text-[11px] text-[#6a6a75] font-mono truncate">
                        {ch.webhook_url}
                      </code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleStartEdit(ch)}
                      className="p-1.5 rounded-lg text-[#6a6a75] hover:text-[#eaeaea] hover:bg-white/[0.06] transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(ch.id)}
                      disabled={deletingId === ch.id}
                      className="p-1.5 rounded-lg text-[#6a6a75] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === ch.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
