import { useState } from "react";
import {
  ImageIcon,
  Upload,
  Loader2,
  X,
  ArrowUp,
  ArrowDown,
  Plus,
} from "lucide-react";
import MediaBrowser from "../PageEditor/MediaBrowser";
import type { MediaItem } from "../PageEditor/MediaBrowser";

interface GalleryItem {
  url: string;
  link?: string;
  alt: string;
  caption?: string;
}

interface Props {
  projectId: string;
  value: GalleryItem[];
  onChange: (next: GalleryItem[]) => void;
  label: string;
}

function GalleryItemRow({
  projectId,
  item,
  index,
  total,
  onPatch,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  projectId: string;
  item: GalleryItem;
  index: number;
  total: number;
  onPatch: (patch: Partial<GalleryItem>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch(`/api/admin/websites/${projectId}/media`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.data?.[0]?.s3_url) {
        onPatch({ url: data.data[0].s3_url });
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-2">
            {item.url ? (
              <div className="relative">
                <img
                  src={item.url}
                  alt={item.alt || "Preview"}
                  className="h-20 w-20 rounded-lg object-cover border"
                />
                <button
                  type="button"
                  onClick={() => onPatch({ url: "" })}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="h-20 w-20 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-300">
                <ImageIcon className="w-6 h-6" />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setShowBrowser(!showBrowser);
                    setShowUrlInput(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Browse Library
                </button>
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer">
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowUrlInput(!showUrlInput);
                    setShowBrowser(false);
                  }}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Paste URL
                </button>
              </div>

              {showBrowser && (
                <div className="mb-2">
                  <MediaBrowser
                    projectId={projectId}
                    onSelect={(media: MediaItem) => {
                      onPatch({ url: media.s3_url });
                      setShowBrowser(false);
                    }}
                    onClose={() => setShowBrowser(false)}
                    compact
                  />
                </div>
              )}

              {showUrlInput && (
                <input
                  type="url"
                  value={item.url}
                  onChange={(e) => onPatch({ url: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm mb-2"
                  placeholder="https://..."
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Link (optional)
              </label>
              <input
                type="url"
                value={item.link ?? ""}
                onChange={(e) => onPatch({ link: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Alt text <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={item.alt}
                onChange={(e) => onPatch({ alt: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                placeholder="Describe the image"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Caption (optional)
              </label>
              <input
                type="text"
                value={item.caption ?? ""}
                onChange={(e) => onPatch({ caption: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Move up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Move down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MediaPickerArrayField({
  projectId,
  value,
  onChange,
  label,
}: Props) {
  const items = Array.isArray(value) ? value : [];

  const patchAt = (index: number, patch: Partial<GalleryItem>) => {
    const next = items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    onChange(next);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index === items.length - 1) return;
    const next = [...items];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const removeAt = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange(next);
  };

  const addItem = () => {
    onChange([...items, { url: "", link: "", alt: "", caption: "" }]);
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
          <p className="text-xs text-gray-500 mb-3">
            No items yet — click Add item to start
          </p>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add item
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <GalleryItemRow
              key={index}
              projectId={projectId}
              item={item}
              index={index}
              total={items.length}
              onPatch={(patch) => patchAt(index, patch)}
              onMoveUp={() => moveUp(index)}
              onMoveDown={() => moveDown(index)}
              onRemove={() => removeAt(index)}
            />
          ))}
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add item
          </button>
        </div>
      )}
    </div>
  );
}
