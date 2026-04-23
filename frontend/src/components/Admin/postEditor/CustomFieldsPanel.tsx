import type { Dispatch, SetStateAction } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PostType } from "../../../api/posts";
import type { SchemaField, GalleryItem } from "./types";
import TextFieldEditor from "./fieldEditors/TextFieldEditor";
import TextareaFieldEditor from "./fieldEditors/TextareaFieldEditor";
import NumberFieldEditor from "./fieldEditors/NumberFieldEditor";
import DateFieldEditor from "./fieldEditors/DateFieldEditor";
import BooleanFieldEditor from "./fieldEditors/BooleanFieldEditor";
import SelectFieldEditor from "./fieldEditors/SelectFieldEditor";
import MediaUrlFieldEditor from "./fieldEditors/MediaUrlFieldEditor";
import GalleryFieldEditor from "./fieldEditors/GalleryFieldEditor";

type Props = {
  projectId: string;
  postTypes: PostType[];
  formPostTypeId: string;
  formCustomFields: Record<string, unknown>;
  setFormCustomFields: Dispatch<SetStateAction<Record<string, unknown>>>;
};

export default function CustomFieldsPanel({
  projectId,
  postTypes,
  formPostTypeId,
  formCustomFields,
  setFormCustomFields,
}: Props) {
  const activeType = postTypes.find((pt) => pt.id === formPostTypeId);
  const rawSchema = Array.isArray(activeType?.schema) ? activeType.schema : [];
  const schema = rawSchema as unknown as SchemaField[];

  const setField = (slug: string, next: unknown) => {
    setFormCustomFields((prev) => ({ ...prev, [slug]: next }));
  };

  return (
    <section
      aria-labelledby="custom-fields-heading"
      className="rounded-xl border border-gray-200 bg-white overflow-hidden"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <h4
          id="custom-fields-heading"
          className="text-sm font-semibold text-gray-700"
        >
          Custom Fields
        </h4>
      </header>

      {schema.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 italic text-center">
          This post type has no custom fields.
        </p>
      ) : (
        <motion.ul layout className="divide-y divide-gray-100">
          <AnimatePresence initial={false}>
            {schema.map((field) => {
              const slug = field.slug || field.name;
              const rawValue = formCustomFields[slug];
              return (
                <motion.li
                  key={slug}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="group"
                >
                  {renderEditor({
                    field,
                    rawValue,
                    projectId,
                    onChange: (next: unknown) => setField(slug, next),
                  })}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
    </section>
  );
}

type RenderArgs = {
  field: SchemaField;
  rawValue: unknown;
  projectId: string;
  onChange: (next: unknown) => void;
};

function renderEditor({ field, rawValue, projectId, onChange }: RenderArgs) {
  switch (field.type) {
    case "textarea":
      return (
        <TextareaFieldEditor
          field={field}
          value={toStringValue(rawValue, field)}
          onChange={onChange}
          projectId={projectId}
        />
      );
    case "boolean":
      return (
        <BooleanFieldEditor
          field={field}
          value={Boolean(rawValue)}
          onChange={onChange}
          projectId={projectId}
        />
      );
    case "select":
      return (
        <SelectFieldEditor
          field={field}
          value={toStringValue(rawValue, field)}
          onChange={onChange}
          projectId={projectId}
        />
      );
    case "number":
      return (
        <NumberFieldEditor
          field={field}
          value={toNumberValue(rawValue)}
          onChange={onChange}
          projectId={projectId}
        />
      );
    case "date":
      return (
        <DateFieldEditor
          field={field}
          value={toStringValue(rawValue, field)}
          onChange={onChange}
          projectId={projectId}
        />
      );
    case "media_url":
      return (
        <MediaUrlFieldEditor
          field={field}
          value={toStringValue(rawValue, field)}
          onChange={onChange}
          projectId={projectId}
        />
      );
    case "gallery":
      return (
        <GalleryFieldEditor
          field={field}
          value={toGalleryValue(rawValue)}
          onChange={onChange}
          projectId={projectId}
        />
      );
    default:
      return (
        <TextFieldEditor
          field={field}
          value={toStringValue(rawValue, field)}
          onChange={onChange}
          projectId={projectId}
        />
      );
  }
}

function toStringValue(raw: unknown, field: SchemaField): string {
  if (raw == null) {
    return typeof field.default_value === "string" ? field.default_value : "";
  }
  return typeof raw === "string" ? raw : String(raw);
}

function toNumberValue(raw: unknown): number | "" {
  if (raw === "" || raw == null) return "";
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : "";
}

function toGalleryValue(raw: unknown): GalleryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((i): i is GalleryItem => {
    return typeof i === "object" && i !== null && "url" in i;
  });
}
