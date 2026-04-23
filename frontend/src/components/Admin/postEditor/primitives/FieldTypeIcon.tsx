import {
  Type,
  AlignLeft,
  Hash,
  Calendar,
  ToggleLeft,
  ChevronDown,
  Image,
  Images,
  HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  date: Calendar,
  boolean: ToggleLeft,
  select: ChevronDown,
  media_url: Image,
  gallery: Images,
};

interface FieldTypeIconProps {
  type: string;
  className?: string;
}

export default function FieldTypeIcon({ type, className }: FieldTypeIconProps) {
  const Icon = ICONS[type] ?? HelpCircle;
  return <Icon className={className ?? "w-4 h-4 text-gray-400"} />;
}
