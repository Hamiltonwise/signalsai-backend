import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Paperclip, X, Image, Upload } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import MediaBrowser from "./MediaBrowser";
import ColorPicker from "./ColorPicker";
import type { MediaItem } from "./MediaBrowser";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isError?: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (instruction: string, attachedMedia?: MediaItem[]) => void;
  isLoading: boolean;
  disabled: boolean;
  projectId?: string;
  primaryColor?: string | null;
  accentColor?: string | null;
}

export default function ChatPanel({
  messages,
  onSend,
  isLoading,
  disabled,
  projectId,
  primaryColor,
  accentColor,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<MediaItem[]>([]);
  const [attachedColor, setAttachedColor] = useState<string | null>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  useEffect(() => {
    if (!disabled && !isLoading) {
      inputRef.current?.focus();
    }
  }, [disabled, isLoading]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || disabled) return;
    const finalInstruction = attachedColor
      ? `${trimmed}\n\nUse color: ${attachedColor}`
      : trimmed;
    onSend(finalInstruction, attachedMedia.length > 0 ? attachedMedia : undefined);
    setInput("");
    setAttachedMedia([]);
    setAttachedColor(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const uploadFile = async (file: File) => {
    if (!projectId) return;

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("files", file);

      const response = await fetch(`/api/admin/websites/${projectId}/media`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await response.json();

      if (!data.success || !data.data || data.data.length === 0) {
        throw new Error("Upload failed");
      }

      const uploadedMedia = data.data[0];

      // Add to attached media (invisible to user input)
      setAttachedMedia((prev) => [...prev, uploadedMedia]);

      // Auto-focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadFile(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || isLoading || !projectId) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || isLoading || !projectId) return;

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((file) =>
      [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "video/mp4",
        "application/pdf",
      ].includes(file.type)
    );

    if (validFiles.length === 0) {
      alert("Please drop valid image, video, or PDF files");
      return;
    }

    // Upload files one by one
    for (const file of validFiles) {
      await uploadFile(file);
    }
  };

  const removeAttachedMedia = (mediaId: string) => {
    setAttachedMedia((prev) => prev.filter((m) => m.id !== mediaId));
  };

  const attachMediaFromLibrary = (media: MediaItem) => {
    setAttachedMedia((prev) => {
      if (prev.find((m) => m.id === media.id)) return prev;
      return [...prev, media];
    });
    setShowMediaLibrary(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div
      className="flex flex-col flex-1 min-h-0 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-alloro-orange/10 border-2 border-dashed border-alloro-orange rounded-lg z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-lg px-6 py-4 flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-alloro-orange" />
            <p className="text-sm font-medium text-gray-900">Drop to attach image</p>
            <p className="text-xs text-gray-500">Supports JPG, PNG, WebP, MP4, PDF</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !disabled && (
          <p className="text-xs text-gray-400 text-center py-4">
            Describe your edit. Example: "Change the heading text to Welcome"
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-alloro-orange text-white"
                  : msg.isError
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-gray-100 text-gray-700"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-alloro-orange animate-spin" />
              <span className="text-xs text-gray-500">Editing...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-200">
        {/* Color Picker — shows when user types "color" */}
        <AnimatePresence>
          {input.toLowerCase().includes("color") && (primaryColor || accentColor) && (
            <ColorPicker
              primaryColor={primaryColor || null}
              accentColor={accentColor || null}
              onSelect={(colorStr) => setAttachedColor(colorStr)}
            />
          )}
        </AnimatePresence>

        {/* Media Library */}
        {showMediaLibrary && projectId && (
          <div className="mb-2">
            <MediaBrowser
              projectId={projectId}
              onSelect={attachMediaFromLibrary}
              onClose={() => setShowMediaLibrary(false)}
            />
          </div>
        )}

        {/* Color attachment chip */}
        {attachedColor && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
              <span
                className="w-3.5 h-3.5 rounded-sm border border-gray-300 shrink-0"
                style={{ backgroundColor: attachedColor }}
              />
              <span className="font-medium">{attachedColor}</span>
              <button
                onClick={() => setAttachedColor(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {attachedMedia.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedMedia.map((media, index) => (
              <div
                key={media.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700"
              >
                <Image className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[120px]">
                  Image {index + 1}: {media.display_name}
                </span>
                <button
                  onClick={() => removeAttachedMedia(media.id)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Upload & Browse buttons */}
          {projectId && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isLoading || uploading}
                className="p-2 rounded-xl bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-alloro-orange transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                title="Upload new image"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setShowMediaLibrary(!showMediaLibrary)}
                disabled={disabled || isLoading}
                className={`p-2 rounded-xl border transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ${
                  showMediaLibrary
                    ? "bg-alloro-orange text-white border-alloro-orange"
                    : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-alloro-orange"
                }`}
                title="Browse media library"
              >
                <Image className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,application/pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? "Select an element to edit..."
                : "Describe your edit..."
            }
            disabled={disabled || isLoading}
            rows={1}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:border-alloro-orange focus:ring-1 focus:ring-alloro-orange/20 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: "36px", maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />

          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || disabled}
            className="p-2 rounded-xl bg-alloro-orange text-white hover:bg-alloro-orange/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-sm shadow-alloro-orange/20"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
