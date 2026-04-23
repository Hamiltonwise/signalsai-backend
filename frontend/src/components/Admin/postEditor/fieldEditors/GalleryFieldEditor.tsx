import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Clipboard, ClipboardPaste, Images, Check } from "lucide-react";
import InlineEditRow from "../primitives/InlineEditRow";
import GalleryItemCard from "./GalleryItemCard";
import { useBulkPaste } from "../hooks/useBulkPaste";
import { useClipboardRow } from "../hooks/useClipboardRow";
import type { FieldEditorProps, GalleryItem } from "../types";

function newId(): string {
  // crypto.randomUUID is available in all modern browsers and in Vite dev/prod.
  return crypto.randomUUID();
}

function ensureIds(items: GalleryItem[]): { next: GalleryItem[]; changed: boolean } {
  let changed = false;
  const next = items.map((item) => {
    if (item && typeof item.id === "string" && item.id.length > 0) return item;
    changed = true;
    return { ...item, id: newId() };
  });
  return { next, changed };
}

export default function GalleryFieldEditor({
  field,
  value,
  onChange,
  projectId,
}: FieldEditorProps<GalleryItem[]>) {
  const items = useMemo(() => (Array.isArray(value) ? value : []), [value]);

  // Synthesize stable ids lazily on first mount / when new id-less items appear.
  // Guarded so we only dispatch onChange when something actually changed.
  const hasPatchedRef = useRef(false);
  useEffect(() => {
    const { next, changed } = ensureIds(items);
    if (changed && !hasPatchedRef.current) {
      hasPatchedRef.current = true;
      onChange(next);
    } else if (!changed) {
      hasPatchedRef.current = false;
    }
  }, [items, onChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const clipboard = useClipboardRow<GalleryItem>("gallery-item");
  const [pasted, setPasted] = useState(false);

  const bulk = useBulkPaste({
    onAddUrls: (urls) => {
      const added: GalleryItem[] = urls.map((u) => ({ id: newId(), url: u, alt: "" }));
      onChange([...items, ...added]);
    },
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      onChange(arrayMove(items, oldIndex, newIndex));
    },
    [items, onChange]
  );

  const updateItem = useCallback(
    (id: string, next: GalleryItem) => {
      onChange(items.map((it) => (it.id === id ? next : it)));
    },
    [items, onChange]
  );

  const deleteItem = useCallback(
    (id: string) => {
      onChange(items.filter((it) => it.id !== id));
    },
    [items, onChange]
  );

  const addBlank = useCallback(() => {
    onChange([...items, { id: newId(), url: "", alt: "" }]);
  }, [items, onChange]);

  const pasteRow = useCallback(async () => {
    const fromClipboard = await clipboard.paste();
    if (!fromClipboard) return;
    // Always mint a fresh id — reusing a copied id collides when pasting into
    // the same gallery the item was copied from.
    const appended: GalleryItem = { ...fromClipboard, id: newId() };
    onChange([...items, appended]);
    setPasted(true);
    window.setTimeout(() => setPasted(false), 800);
  }, [clipboard, items, onChange]);

  const isEmpty = items.length === 0;

  return (
    <InlineEditRow field={field}>
      <div className="flex flex-col gap-3 min-w-0 w-full">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg border border-dashed border-gray-200 bg-gray-50/60">
            <div className="flex items-center gap-2 text-gray-400">
              <Images className="w-5 h-5" />
              <span className="text-sm">No items yet</span>
            </div>
            <button
              type="button"
              onClick={addBlank}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add your first item
            </button>
            <button
              type="button"
              onClick={bulk.open}
              className="text-[11px] text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 rounded"
            >
              Or paste URLs
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <GalleryItemCard
                      key={item.id}
                      item={item}
                      projectId={projectId}
                      onChange={(next) => updateItem(item.id, next)}
                      onDelete={() => deleteItem(item.id)}
                      onCopy={async () => {
                        await clipboard.copy(item);
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </SortableContext>
          </DndContext>
        )}

        {!isEmpty && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={addBlank}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add item
            </button>
            <button
              type="button"
              onClick={bulk.open}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            >
              <Clipboard className="w-3.5 h-3.5" />
              Paste URLs
            </button>
            <button
              type="button"
              onClick={pasteRow}
              aria-label="Paste copied item"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            >
              {pasted ? (
                <>
                  <Check className="w-3 h-3 text-green-600" /> Pasted
                </>
              ) : (
                <>
                  <ClipboardPaste className="w-3 h-3" /> Paste row
                </>
              )}
            </button>
          </div>
        )}

        {bulk.dialog}
      </div>
    </InlineEditRow>
  );
}
