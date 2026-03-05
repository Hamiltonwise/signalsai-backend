import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Pencil,
  Tag,
  FolderTree,
  Loader2,
  FileText,
  Save,
  X,
  ImageIcon,
  Upload,
  ChevronLeft,
} from "lucide-react";
import MediaBrowser from "../PageEditor/MediaBrowser";
import type { MediaItem } from "../PageEditor/MediaBrowser";
import RichTextEditor from "../ui/RichTextEditor";
import AnimatedSelect from "../ui/AnimatedSelect";
import {
  fetchPosts,
  createPost,
  updatePost,
  deletePost,
  fetchPostTypes,
  fetchCategories,
  fetchTags,
  createCategory,
  createTag,
} from "../../api/posts";
import type { Post, PostType, PostCategory, PostTag } from "../../api/posts";
import { ActionButton } from "../ui/DesignSystem";
import { useConfirm } from "../ui/ConfirmModal";

/* ─── Media Picker Field ─── */
function MediaPickerField({
  projectId,
  value,
  onChange,
  label,
}: {
  projectId: string;
  value: string;
  onChange: (url: string) => void;
  label: string;
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
        onChange(data.data[0].s3_url);
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>

      {/* Preview */}
      {value && (
        <div className="relative mb-2 inline-block">
          <img
            src={value}
            alt="Preview"
            className="h-32 w-auto rounded-lg object-cover border"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => { setShowBrowser(!showBrowser); setShowUrlInput(false); }}
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
          onClick={() => { setShowUrlInput(!showUrlInput); setShowBrowser(false); }}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Paste URL
        </button>
      </div>

      {/* Media browser */}
      {showBrowser && (
        <div className="mb-2">
          <MediaBrowser
            projectId={projectId}
            onSelect={(media: MediaItem) => {
              onChange(media.s3_url);
              setShowBrowser(false);
            }}
            onClose={() => setShowBrowser(false)}
            compact
          />
        </div>
      )}

      {/* Manual URL input */}
      {showUrlInput && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          placeholder="https://..."
        />
      )}
    </div>
  );
}

interface PostsTabProps {
  projectId: string;
  templateId: string | null;
}

type ViewState = "list" | "editor";

export default function PostsTab({ projectId, templateId }: PostsTabProps) {
  const confirm = useConfirm();

  const [posts, setPosts] = useState<Post[]>([]);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [_taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [view, setView] = useState<ViewState>("list");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  // Editor state
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formExcerpt, setFormExcerpt] = useState("");
  const [formFeaturedImage, setFormFeaturedImage] = useState("");
  const [formStatus, setFormStatus] = useState<"draft" | "published">("draft");
  const [formPostTypeId, setFormPostTypeId] = useState("");
  const [formCustomFields, setFormCustomFields] = useState<Record<string, unknown>>({});
  const [formCategoryIds, setFormCategoryIds] = useState<string[]>([]);
  const [formTagIds, setFormTagIds] = useState<string[]>([]);

  // Taxonomy
  const [categories, setCategories] = useState<PostCategory[]>([]);
  const [tags, setTags] = useState<PostTag[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTagName, setNewTagName] = useState("");

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");

  const loadData = useCallback(async () => {
    if (!templateId) return;
    try {
      setError(null);
      const [postsRes, typesRes] = await Promise.all([
        fetchPosts(projectId),
        fetchPostTypes(templateId),
      ]);
      setPosts(postsRes.data);
      setPostTypes(typesRes.data);
      if (typesRes.data.length > 0 && !formPostTypeId) {
        setFormPostTypeId(typesRes.data[0].id);
      }
      // Auto-select first type on initial load
      if (typesRes.data.length > 0 && !selectedTypeId) {
        setSelectedTypeId(typesRes.data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setInitialLoading(false);
    }
  }, [projectId, templateId, formPostTypeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load taxonomy when selected type changes
  useEffect(() => {
    const typeId = selectedTypeId || formPostTypeId;
    if (!typeId) return;
    setTaxonomyLoading(true);
    Promise.all([
      fetchCategories(typeId),
      fetchTags(typeId),
    ]).then(([catRes, tagRes]) => {
      setCategories(catRes.data);
      setTags(tagRes.data);
    }).finally(() => setTaxonomyLoading(false));
  }, [selectedTypeId, formPostTypeId]);

  // Reset filters when type changes
  useEffect(() => {
    setFilterStatus("all");
    setFilterCategory("all");
    setFilterTag("all");
  }, [selectedTypeId]);

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormExcerpt("");
    setFormFeaturedImage("");
    setFormStatus("draft");
    setFormCustomFields({});
    setFormCategoryIds([]);
    setFormTagIds([]);
    setEditingPost(null);
    setIsCreating(false);
  };

  const openEditor = (post?: Post) => {
    if (post) {
      setEditingPost(post);
      setFormTitle(post.title);
      setFormContent(post.content);
      setFormExcerpt(post.excerpt || "");
      setFormFeaturedImage(post.featured_image || "");
      setFormStatus(post.status);
      setFormPostTypeId(post.post_type_id);
      setFormCustomFields(post.custom_fields || {});
      setFormCategoryIds(post.categories.map((c) => c.id));
      setFormTagIds(post.tags.map((t) => t.id));
      setIsCreating(false);
    } else {
      resetForm();
      if (selectedTypeId) setFormPostTypeId(selectedTypeId);
      setIsCreating(true);
    }
    setView("editor");
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      if (editingPost) {
        await updatePost(projectId, editingPost.id, {
          title: formTitle,
          content: formContent,
          excerpt: formExcerpt || null,
          featured_image: formFeaturedImage || null,
          custom_fields: formCustomFields,
          status: formStatus,
          category_ids: formCategoryIds,
          tag_ids: formTagIds,
        });
      } else {
        await createPost(projectId, {
          post_type_id: formPostTypeId,
          title: formTitle,
          content: formContent,
          excerpt: formExcerpt || undefined,
          featured_image: formFeaturedImage || undefined,
          custom_fields: formCustomFields,
          status: formStatus,
          category_ids: formCategoryIds,
          tag_ids: formTagIds,
        });
      }
      resetForm();
      setView("list");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: Post) => {
    const ok = await confirm({
      title: "Delete Post",
      message: `Delete "${post.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deletePost(projectId, post.id);
    if (editingPost?.id === post.id) {
      resetForm();
      setView("list");
    }
    await loadData();
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !formPostTypeId) return;
    await createCategory(formPostTypeId, { name: newCategoryName });
    setNewCategoryName("");
    const res = await fetchCategories(formPostTypeId);
    setCategories(res.data);
  };

  const handleAddTag = async () => {
    if (!newTagName.trim() || !formPostTypeId) return;
    await createTag(formPostTypeId, { name: newTagName });
    setNewTagName("");
    const res = await fetchTags(formPostTypeId);
    setTags(res.data);
  };

  const typePosts = selectedTypeId
    ? posts.filter((p) => p.post_type_id === selectedTypeId)
    : posts;

  const filteredPosts = typePosts.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterCategory !== "all" && !p.categories.some((c) => c.id === filterCategory)) return false;
    if (filterTag !== "all" && !p.tags.some((t) => t.id === filterTag)) return false;
    return true;
  });

  const selectedType = postTypes.find((pt) => pt.id === selectedTypeId);

  if (!templateId) {
    return (
      <div className="text-center py-12 text-gray-500">
        This project has no template assigned. Posts require a template with post types defined.
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (postTypes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No post types defined in this template. Add post types in the template editor first.
      </div>
    );
  }

  const postCountByType = (typeId: string) => posts.filter((p) => p.post_type_id === typeId).length;

  /* ─── Sidebar ─── */
  const renderSidebar = () => {
    // In editor mode, sidebar shows posts list for the active type
    const showPostsList = view === "editor";

    return (
      <div className="flex flex-col h-full border-r border-gray-200">
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          {showPostsList && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setView("list");
              }}
              className="p-1 -ml-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <h3 className="text-sm font-semibold text-gray-900">
            {showPostsList ? (selectedType?.name || "Posts") : "Post Types"}
          </h3>
          {showPostsList && (
            <span className="text-xs text-gray-400 ml-auto">
              {typePosts.length} post{typePosts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto">
          {showPostsList ? (
            /* Posts list — shown when editing */
            <div className="py-1">
              {typePosts.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-400">
                  No posts yet
                </div>
              ) : (
                typePosts.map((post) => {
                  const isActive = editingPost?.id === post.id;
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => openEditor(post)}
                      className={`w-full text-left px-4 py-2.5 transition-colors border-l-2 ${
                        isActive
                          ? "border-l-alloro-orange bg-orange-50/50"
                          : "border-l-transparent hover:bg-gray-50"
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">{post.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                          post.status === "published" ? "bg-green-500" : "bg-yellow-400"
                        }`} />
                        <span className="text-xs text-gray-400">{post.status}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            /* Post types list — shown in list view */
            <div className="py-1">
              {postTypes.map((pt) => {
                const isActive = pt.id === selectedTypeId;
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => {
                      setSelectedTypeId(pt.id);
                      setFormPostTypeId(pt.id);
                    }}
                    className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                      isActive
                        ? "border-l-alloro-orange bg-orange-50/50"
                        : "border-l-transparent hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">{pt.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">/{pt.slug}</span>
                      <span className="text-xs text-gray-400">&middot;</span>
                      <span className="text-xs text-gray-500">{postCountByType(pt.id)} posts</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar footer: New Post */}
        <div className="px-3 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => openEditor()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-alloro-orange bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Post
          </button>
        </div>
      </div>
    );
  };

  /* ─── Main Content: Posts List ─── */
  const renderPostsList = () => {
    const statusOptions = [
      { value: "all", label: "All statuses" },
      { value: "draft", label: "Draft" },
      { value: "published", label: "Published" },
    ];

    const categoryOptions = [
      { value: "all", label: "All categories" },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ];

    const tagOptions = [
      { value: "all", label: "All tags" },
      ...tags.map((t) => ({ value: t.id, label: t.name })),
    ];

    return (
      <div className="p-6">
        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-40">
            <AnimatedSelect
              options={statusOptions}
              value={filterStatus}
              onChange={setFilterStatus}
              placeholder="Status"
              size="sm"
            />
          </div>
          {categories.length > 0 && (
            <div className="w-44">
              <AnimatedSelect
                options={categoryOptions}
                value={filterCategory}
                onChange={setFilterCategory}
                placeholder="Category"
                size="sm"
              />
            </div>
          )}
          {tags.length > 0 && (
            <div className="w-40">
              <AnimatedSelect
                options={tagOptions}
                value={filterTag}
                onChange={setFilterTag}
                placeholder="Tag"
                size="sm"
              />
            </div>
          )}
        </div>

        {/* Posts */}
        {filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No posts found.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPosts.map((post, index) => {
              const postType = postTypes.find((pt) => pt.id === post.post_type_id);
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">
                        {post.title}
                      </h4>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          post.status === "published"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {post.status}
                      </span>
                      {postType && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-600">
                          {postType.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>/{post.slug}</span>
                      {post.categories.length > 0 && (
                        <span className="flex items-center gap-1">
                          <FolderTree className="w-3 h-3" />
                          {post.categories.map((c) => c.name).join(", ")}
                        </span>
                      )}
                      {post.tags.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {post.tags.map((t) => t.name).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <button
                      onClick={() => openEditor(post)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(post)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /* ─── Main Content: Editor ─── */
  const renderEditor = () => {
    const statusOptions = [
      { value: "draft", label: "Draft", color: "#eab308" },
      { value: "published", label: "Published", color: "#22c55e" },
    ];

    const postTypeOptions = postTypes.map((pt) => ({
      value: pt.id,
      label: pt.name,
    }));

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-full overflow-y-auto"
      >
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {editingPost ? "Edit Post" : "New Post"}
          </h3>
          <button
            onClick={() => {
              resetForm();
              setView("list");
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Post Type (only for new) */}
          {isCreating && (
            <AnimatedSelect
              label="Post Type"
              options={postTypeOptions}
              value={formPostTypeId}
              onChange={setFormPostTypeId}
              placeholder="Select post type"
            />
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Post title"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <RichTextEditor content={formContent} onChange={setFormContent} />
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
            <textarea
              value={formExcerpt}
              onChange={(e) => setFormExcerpt(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Short summary..."
            />
          </div>

          {/* Featured Image */}
          <MediaPickerField
            projectId={projectId}
            value={formFeaturedImage}
            onChange={setFormFeaturedImage}
            label="Featured Image"
          />

          {/* Custom Fields (dynamic from post type schema) */}
          {(() => {
            const activeType = postTypes.find((pt) => pt.id === formPostTypeId);
            const schema = Array.isArray(activeType?.schema) ? activeType.schema : [];
            if (schema.length === 0) return null;
            return (
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Custom Fields</h4>
                <div className="grid grid-cols-2 gap-3">
                  {schema.map((field: any) => {
                    const slug = field.slug || field.name;
                    const value = formCustomFields[slug] ?? field.default_value ?? "";
                    return (
                      <div key={slug}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {field.name}
                          {field.required && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        {field.type === "textarea" ? (
                          <textarea
                            value={String(value)}
                            onChange={(e) =>
                              setFormCustomFields((prev) => ({ ...prev, [slug]: e.target.value }))
                            }
                            rows={3}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                          />
                        ) : field.type === "boolean" ? (
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!value}
                              onChange={(e) =>
                                setFormCustomFields((prev) => ({ ...prev, [slug]: e.target.checked }))
                              }
                              className="rounded"
                            />
                            {value ? "Yes" : "No"}
                          </label>
                        ) : field.type === "select" ? (
                          <AnimatedSelect
                            options={(field.options || []).map((opt: string) => ({
                              value: opt,
                              label: opt,
                            }))}
                            value={String(value)}
                            onChange={(val) =>
                              setFormCustomFields((prev) => ({ ...prev, [slug]: val }))
                            }
                            placeholder="Select..."
                            size="sm"
                          />
                        ) : field.type === "number" ? (
                          <input
                            type="number"
                            value={String(value)}
                            onChange={(e) =>
                              setFormCustomFields((prev) => ({
                                ...prev,
                                [slug]: e.target.value ? Number(e.target.value) : "",
                              }))
                            }
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                          />
                        ) : field.type === "date" ? (
                          <input
                            type="date"
                            value={String(value)}
                            onChange={(e) =>
                              setFormCustomFields((prev) => ({ ...prev, [slug]: e.target.value }))
                            }
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                          />
                        ) : field.type === "media_url" ? (
                          <MediaPickerField
                            projectId={projectId}
                            value={String(value)}
                            onChange={(url) =>
                              setFormCustomFields((prev) => ({ ...prev, [slug]: url }))
                            }
                            label=""
                          />
                        ) : (
                          <input
                            type="text"
                            value={String(value)}
                            onChange={(e) =>
                              setFormCustomFields((prev) => ({ ...prev, [slug]: e.target.value }))
                            }
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Categories */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categories</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {categories.map((cat) => (
                <label key={cat.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={formCategoryIds.includes(cat.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormCategoryIds([...formCategoryIds, cat.id]);
                      } else {
                        setFormCategoryIds(formCategoryIds.filter((id) => id !== cat.id));
                      }
                    }}
                    className="rounded"
                  />
                  {cat.name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                placeholder="New category"
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              />
              <button
                onClick={handleAddCategory}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Add
              </button>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={formTagIds.includes(tag.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormTagIds([...formTagIds, tag.id]);
                      } else {
                        setFormTagIds(formTagIds.filter((id) => id !== tag.id));
                      }
                    }}
                    className="rounded"
                  />
                  {tag.name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                placeholder="New tag"
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              />
              <button
                onClick={handleAddTag}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Add
              </button>
            </div>
          </div>

          {/* Status */}
          <AnimatedSelect
            label="Status"
            options={statusOptions}
            value={formStatus}
            onChange={(val) => setFormStatus(val as "draft" | "published")}
          />

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <ActionButton
              onClick={handleSave}
              disabled={saving || !formTitle.trim()}
              loading={saving}
              icon={<Save className="w-4 h-4" />}
              label={editingPost ? "Update" : "Create"}
            />
            <button
              onClick={() => {
                resetForm();
                setView("list");
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  /* ─── Layout: 30/70 sidebar ─── */
  return (
    <div className="flex rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden" style={{ minHeight: 480 }}>
      {/* Sidebar — 30% */}
      <div className="w-[30%] min-w-[220px] max-w-[320px] flex-shrink-0 bg-gray-50/50">
        {renderSidebar()}
      </div>

      {/* Main — 70% */}
      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {view === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {renderPostsList()}
            </motion.div>
          )}
          {view === "editor" && (
            <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {renderEditor()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
