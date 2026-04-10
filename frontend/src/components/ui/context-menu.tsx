/**
 * Context menu primitive — thin wrapper around @radix-ui/react-context-menu
 * styled to match the PM tool's dark theme.
 *
 * Structure mirrors shadcn/ui's canonical context-menu wrapper so that
 * consumers can use the familiar <ContextMenu><ContextMenuTrigger>...</>
 * composition pattern.
 */

import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { Check, ChevronRight, Circle } from "lucide-react";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuPortal = ContextMenuPrimitive.Portal;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

// --- base style tokens (inline so we don't depend on a cn() helper) ---

const CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: "var(--color-pm-bg-secondary)",
  border: "1px solid var(--color-pm-border)",
  boxShadow: "var(--pm-shadow-elevated)",
  color: "var(--color-pm-text-primary)",
  borderRadius: "8px",
  minWidth: "180px",
  padding: "4px",
  zIndex: 60,
};

const ITEM_CLASS =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--color-pm-bg-hover)]";

const DESTRUCTIVE_ITEM_CLASS =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium outline-none transition-colors text-[#C43333] data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[rgba(196,51,51,0.1)]";

const LABEL_CLASS =
  "px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-pm-text-muted)]";

const SEPARATOR_CLASS = "my-1 h-px bg-[var(--color-pm-border-subtle)]";

const SUB_TRIGGER_CLASS =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium outline-none transition-colors data-[state=open]:bg-[var(--color-pm-bg-hover)] data-[highlighted]:bg-[var(--color-pm-bg-hover)]";

// --- components ---

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={`${SUB_TRIGGER_CLASS}${inset ? " pl-6" : ""}${className ? ` ${className}` : ""}`}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-3.5 w-3.5" strokeWidth={1.5} />
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName;

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.SubContent
    ref={ref}
    style={CONTENT_STYLE}
    className={className}
    {...props}
  />
));
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      style={CONTENT_STYLE}
      className={className}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

interface ContextMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> {
  inset?: boolean;
  destructive?: boolean;
}

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  ContextMenuItemProps
>(({ className, inset, destructive, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={`${destructive ? DESTRUCTIVE_ITEM_CLASS : ITEM_CLASS}${inset ? " pl-6" : ""}${className ? ` ${className}` : ""}`}
    {...props}
  />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    className={`${ITEM_CLASS} pl-6${className ? ` ${className}` : ""}`}
    checked={checked}
    {...props}
  >
    <span className="absolute left-1.5 flex h-3 w-3 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Check className="h-3 w-3" strokeWidth={1.5} />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName;

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.RadioItem
    ref={ref}
    className={`${ITEM_CLASS} pl-6${className ? ` ${className}` : ""}`}
    {...props}
  >
    <span className="absolute left-1.5 flex h-3 w-3 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName;

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={`${LABEL_CLASS}${inset ? " pl-6" : ""}${className ? ` ${className}` : ""}`}
    {...props}
  />
));
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={`${SEPARATOR_CLASS}${className ? ` ${className}` : ""}`}
    {...props}
  />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

const ContextMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={`ml-auto text-[10px] tracking-widest text-[var(--color-pm-text-muted)]${className ? ` ${className}` : ""}`}
    {...props}
  />
);
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
