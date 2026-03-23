# Menu Drag-and-Drop Reorder & Indent

**Ticket:** --no-ticket
**Date:** 03/05/2026

## Problem Statement

Menu items in `MenusTab.tsx` use manual chevron up/down buttons for reordering. There's no way to drag items to reorder or indent them (change parent). This is clunky for menus with many items. Drag-and-drop is the standard UX for menu management.

## Context Summary

- `@hello-pangea/dnd` already installed, used in `CodeManagerTab.tsx`
- `reorderMenuItems` API already exists — takes `{ id, parent_id, order_index }[]`
- Backend `reorderItems` handler already does bulk parent_id + order_index updates
- Current UI: flat list with depth-based padding, GripVertical icon (decorative only), ChevronUp/ChevronDown buttons
- Nested hierarchy: items have `parent_id` and `children[]`

## Existing Patterns to Follow

`CodeManagerTab.tsx` pattern: `DragDropContext` → `Droppable` → `Draggable` with `handleDragEnd` calling reorder API.

## Proposed Approach

### Flatten-for-DnD Strategy

`@hello-pangea/dnd` doesn't natively support tree drag. We flatten the tree for the droppable list, tracking each item's depth. On drop:

1. **Reorder**: Move item within the flat list
2. **Indent/Outdent**: Horizontal drag threshold or keyboard buttons to change depth (parent_id)

Horizontal drag detection via mouse tracking:
- **Vertical drag = reorder** (repositioning within the flat list)
- **Horizontal drag = indent/outdent** (mouse X delta converted to depth change via `Math.round(deltaX / INDENT_PX)`)
- **Arrow buttons** (ArrowLeft/ArrowRight) kept as precision fallback
- **Local-first state**: changes modify `localFlatItems` only; API call fires on explicit "Save Order" click

### File Changes

| File | Change |
|------|--------|
| `signalsai/src/components/Admin/MenusTab.tsx` | Replace chevron buttons with DnD + horizontal drag indent + save button |

### Implementation Detail

1. **Flatten tree to ordered list** with depth metadata (`FlatItem[]`)
2. Wrap items list in `DragDropContext` → `Droppable` → `Draggable`
3. `onPointerDown` on each row captures `dragStartXRef.current = e.clientX`
4. Global `mousemove` listener tracks horizontal delta during drag, updates `depthDeltaRef` and `depthPreview` state for live visual feedback
5. `onDragEnd`: applies vertical reorder + horizontal depth change, clamps new depth to valid range (0 to prev item depth + 1)
6. Arrow buttons (ArrowLeft/ArrowRight) for precision indent/outdent
7. All changes modify local state only (`localFlatItems` + `hasUnsavedOrder` dirty flag)
8. "Save Order" button calls `reorderMenuItems` with full flat list of `{ id, parent_id, order_index }`

## Risk Analysis

**Level 1 — Low risk.** Single component change. No backend changes needed. Existing reorder API handles both parent_id and order_index updates. `@hello-pangea/dnd` already proven in the codebase.

## Definition of Done

- [x] Menu items are draggable to reorder
- [x] Horizontal drag indents/outdents items (mouse X delta → depth change)
- [x] Live visual preview shows projected depth during drag
- [x] Arrow buttons available as precision fallback for indent/outdent
- [x] GripVertical icon serves as drag handle
- [x] Local-first state: changes don't hit API until "Save Order" clicked
- [x] Visual depth indentation preserved during drag
- [x] Children move with their parent when dragged
- [x] Build passes clean
