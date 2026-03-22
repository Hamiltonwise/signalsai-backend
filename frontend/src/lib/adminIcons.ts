/**
 * Admin Icons Mapping
 * Centralized lucide-react icon imports for consistency across admin pages
 */

import {
  Bot,
  LineChart,
  Database,
  Building,
  FileText,
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Users,
  Shield,
  Settings,
  Eye,
  Trash2,
  Archive,
  ArchiveRestore,
  Play,
  Pause,
  Edit2,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  Mail,
  Lock,
  Calendar,
  MapPin,
  Star,
  Trophy,
  Zap,
  Sparkles,
  Layers,
  Info,
  Search,
  Filter,
  Download,
  Upload,
  Copy,
  MoreVertical,
  LogOut,
  Home,
  LayoutDashboard,
  Cpu,
  Activity,
  type LucideIcon,
} from "lucide-react";

// Page-specific icons
export const ADMIN_PAGE_ICONS = {
  dashboard: LayoutDashboard,
  aiInsights: LineChart,
  agentOutputs: Database,
  organizations: Building,
  logs: FileText,
  ranking: TrendingUp,
  settings: Settings,
} as const;

// Agent type icons
export const AGENT_ICONS: Record<string, LucideIcon> = {
  guardian: Shield,
  governance: Bot,
  default: Cpu,
};

// Status icons
export const STATUS_ICONS = {
  success: CheckCircle,
  error: XCircle,
  pending: Clock,
  processing: RefreshCw,
  warning: AlertTriangle,
  info: AlertCircle,
  archived: Archive,
} as const;

// Action icons
export const ACTION_ICONS = {
  view: Eye,
  edit: Edit2,
  delete: Trash2,
  archive: Archive,
  restore: ArchiveRestore,
  add: Plus,
  play: Play,
  pause: Pause,
  refresh: RefreshCw,
  search: Search,
  filter: Filter,
  download: Download,
  upload: Upload,
  copy: Copy,
  more: MoreVertical,
  external: ExternalLink,
  logout: LogOut,
} as const;

// Navigation icons
export const NAV_ICONS = {
  back: ChevronLeft,
  forward: ChevronRight,
  expand: ChevronDown,
  home: Home,
} as const;

// Entity icons
export const ENTITY_ICONS = {
  user: Users,
  organization: Building,
  location: MapPin,
  calendar: Calendar,
  email: Mail,
  security: Lock,
} as const;

// Metric icons
export const METRIC_ICONS = {
  trending: TrendingUp,
  star: Star,
  trophy: Trophy,
  zap: Zap,
  sparkles: Sparkles,
  layers: Layers,
  activity: Activity,
} as const;

// Helper to get icon by agent type
export const getAgentIcon = (agentType: string): LucideIcon => {
  const normalizedType = agentType.toLowerCase().replace(/_/g, "");
  if (normalizedType.includes("guardian")) return AGENT_ICONS.guardian;
  if (normalizedType.includes("governance")) return AGENT_ICONS.governance;
  return AGENT_ICONS.default;
};

// Helper to get status icon
export const getStatusIcon = (
  status: string
): LucideIcon => {
  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus.includes("success") || normalizedStatus.includes("pass"))
    return STATUS_ICONS.success;
  if (normalizedStatus.includes("error") || normalizedStatus.includes("fail"))
    return STATUS_ICONS.error;
  if (normalizedStatus.includes("pending") || normalizedStatus.includes("wait"))
    return STATUS_ICONS.pending;
  if (
    normalizedStatus.includes("process") ||
    normalizedStatus.includes("running")
  )
    return STATUS_ICONS.processing;
  if (normalizedStatus.includes("warn")) return STATUS_ICONS.warning;
  if (normalizedStatus.includes("archive")) return STATUS_ICONS.archived;
  return STATUS_ICONS.info;
};

// Export all icons for direct import
export {
  Bot,
  LineChart,
  Database,
  Building,
  FileText,
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Users,
  Shield,
  Settings,
  Eye,
  Trash2,
  Archive,
  ArchiveRestore,
  Play,
  Pause,
  Edit2,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  Mail,
  Lock,
  Calendar,
  MapPin,
  Star,
  Trophy,
  Zap,
  Sparkles,
  Layers,
  Info,
  Search,
  Filter,
  Download,
  Upload,
  Copy,
  MoreVertical,
  LogOut,
  Home,
  LayoutDashboard,
  Cpu,
  Activity,
};
