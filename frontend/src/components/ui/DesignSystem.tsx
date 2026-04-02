import type { ReactNode } from "react";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronDown,
  Inbox,
  RefreshCw,
} from "lucide-react";
import {
  cardVariants,
  staggerContainer,
  expandCollapse,
  chevronVariants,
  shineVariants,
  glowRingVariants,
  getScoreColor,
  scoreColorClasses,
} from "../../lib/animations";

/**
 * IntelligencePulse Component
 * Animated pulse indicator for live data or active states
 */
export const IntelligencePulse = () => (
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alloro-orange opacity-30"></span>
    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-alloro-orange opacity-60"></span>
  </span>
);

/**
 * MetricCard Component
 * Displays a single metric with label, value, and optional trend indicator
 */
interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: string;
  isHighlighted?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  trend,
  isHighlighted = false,
}) => {
  const isUp = trend?.startsWith("+");
  const isDown = trend?.startsWith("-");

  return (
    <div
      className={`flex flex-col p-6 rounded-2xl border transition-all duration-500 ${
        isHighlighted
          ? "bg-white border-alloro-orange/20 shadow-premium"
          : "bg-white border-black/5 hover:border-alloro-orange/20 hover:shadow-premium"
      }`}
    >
      <span className="text-xs font-semibold text-alloro-textDark/40 uppercase tracking-[0.2em] mb-4 leading-none text-left">
        {label}
      </span>
      <div className="flex items-center justify-between">
        <span className="text-3xl font-semibold font-heading tracking-tighter leading-none text-alloro-textDark">
          {value}
        </span>
        {trend && (
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm ${
              isUp
                ? "bg-green-100 text-green-700"
                : isDown
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * CompactTag Component
 * Small status indicator with custom styling per status type
 */
interface CompactTagProps {
  status: string;
}

export const CompactTag: React.FC<CompactTagProps> = ({ status }) => {
  const styles: Record<string, string> = {
    Increasing: "text-green-700 bg-green-50 border-green-100",
    increasing: "text-green-700 bg-green-50 border-green-100",
    Decreasing: "text-red-700 bg-red-50 border-red-100",
    decreasing: "text-red-700 bg-red-50 border-red-100",
    New: "text-indigo-700 bg-indigo-50 border-indigo-100",
    new: "text-indigo-700 bg-indigo-50 border-indigo-100",
    Dormant: "text-alloro-textDark/20 bg-alloro-bg border-black/5",
    dormant: "text-alloro-textDark/20 bg-alloro-bg border-black/5",
    Stable: "text-slate-500 bg-slate-50 border-slate-200",
    stable: "text-slate-500 bg-slate-50 border-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider border leading-none mt-1 w-fit ${
        styles[status] || styles["Stable"]
      }`}
    >
      {status}
    </span>
  );
};

/**
 * SectionHeader Component
 * Reusable section header with icon and divider
 */
interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
}) => (
  <div className="flex items-center gap-4 px-1">
    {icon && <div className="shrink-0">{icon}</div>}
    <h3 className="text-xs font-semibold uppercase tracking-[0.4em] text-alloro-textDark/40 whitespace-nowrap">
      {title}
    </h3>
    <div className="h-px w-full bg-black/10"></div>
  </div>
);

/**
 * PageHeader Component
 * Sticky header with icon, title, subtitle and action button
 */
interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actionButton?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon,
  title,
  subtitle,
  actionButton,
}) => (
  <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
      <div className="flex items-center gap-5">
        <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
          {icon}
        </div>
        <div className="flex flex-col text-left">
          <h1 className="text-xs font-semibold font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
            {title}
          </h1>
          {subtitle && (
            <span className="text-xs font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      {actionButton && (
        <div className="flex items-center gap-4">{actionButton}</div>
      )}
    </div>
  </header>
);

/**
 * StatusPill Component
 * Colored status indicator
 */
interface StatusPillProps {
  label: string;
  color?: "orange" | "green" | "red" | "blue" | "gray";
}

export const StatusPill: React.FC<StatusPillProps> = ({
  label,
  color = "blue",
}) => {
  const colorStyles: Record<string, string> = {
    orange: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    green: "bg-green-500/15 text-green-400 border-green-500/25",
    red: "bg-red-500/15 text-red-400 border-red-500/25",
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    gray: "bg-white/[0.06] text-[#a0a0a8] border-white/10",
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest border ${colorStyles[color]}`}
    >
      {label}
    </span>
  );
};

// ============================================================
// ADMIN COMPONENTS - Based on alloro-leadgen-tool patterns
// ============================================================

/**
 * AdminPageHeader Component
 * Enhanced page header with icon, title, description, and action buttons
 * Features animated entrance and optional back navigation
 */
interface AdminPageHeaderProps {
  icon: ReactNode;
  title: string;
  description?: string | ReactNode;
  actionButtons?: ReactNode;
  backButton?: {
    label: string;
    onClick: () => void;
  };
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  icon,
  title,
  description,
  actionButtons,
  backButton,
}) => (
  <motion.header
    className="mb-8"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
  >
    {backButton && (
      <motion.button
        onClick={backButton.onClick}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-alloro-orange mb-4 transition-colors"
        whileHover={{ x: -4 }}
        whileTap={{ scale: 0.98 }}
      >
        <ChevronLeft className="w-4 h-4" />
        {backButton.label}
      </motion.button>
    )}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <motion.div
          className="w-12 h-12 bg-alloro-navy text-white rounded-2xl flex items-center justify-center shadow-lg"
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          {icon}
        </motion.div>
        <div>
          <h1 className="text-xl font-bold text-alloro-textDark">{title}</h1>
          {description && (
            <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {actionButtons && (
        <div className="flex items-center gap-3">{actionButtons}</div>
      )}
    </div>
  </motion.header>
);

/**
 * AnimatedCard Component
 * Wrapper for framer-motion card animations with hover effects
 */
interface AnimatedCardProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  delay = 0,
  className = "",
  onClick,
  hoverable = true,
}) => (
  <motion.div
    custom={delay}
    variants={cardVariants}
    initial="hidden"
    animate="visible"
    exit="exit"
    whileHover={hoverable ? "hover" : undefined}
    onClick={onClick}
    className={`bg-white rounded-2xl border border-black/5 shadow-premium overflow-hidden transition-all ${
      onClick ? "cursor-pointer" : ""
    } ${
      hoverable
        ? "hover:border-alloro-orange/20 hover:shadow-2xl hover:-translate-y-1"
        : ""
    } ${className}`}
  >
    {children}
  </motion.div>
);

/**
 * DataCard Component
 * Metadata card replacing table rows - displays rich information
 */
interface DataCardProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  badges?: Array<{
    label: string;
    color?: "orange" | "green" | "red" | "blue" | "gray";
  }>;
  metadata?: Array<{
    label: string;
    value: string | number;
  }>;
  actions?: ReactNode;
  onClick?: () => void;
  status?: "success" | "pending" | "error" | "archived";
  delay?: number;
}

export const DataCard: React.FC<DataCardProps> = ({
  icon,
  title,
  subtitle,
  badges,
  metadata,
  actions,
  onClick,
  status,
  delay = 0,
}) => {
  const statusDot = {
    success: "bg-green-500",
    pending: "bg-yellow-500",
    error: "bg-red-500",
    archived: "bg-gray-400",
  };

  return (
    <AnimatedCard delay={delay} onClick={onClick} className="p-5">
      <div className="flex items-start gap-4">
        {icon && (
          <div className="w-10 h-10 bg-alloro-bg rounded-xl flex items-center justify-center shrink-0 text-alloro-navy">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {status && (
              <span
                className={`w-2 h-2 rounded-full ${statusDot[status]}`}
              ></span>
            )}
            <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>
          )}
          {badges && badges.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {badges.map((badge, idx) => (
                <StatusPill key={idx} label={badge.label} color={badge.color} />
              ))}
            </div>
          )}
          {metadata && metadata.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-3">
              {metadata.map((item, idx) => (
                <div key={idx} className="text-xs">
                  <span className="text-gray-400 uppercase tracking-wide">
                    {item.label}:
                  </span>
                  <span className="text-gray-700 font-medium ml-1">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </AnimatedCard>
  );
};

/**
 * CircularProgress Component
 * Animated SVG progress ring with score-based colors and glow effect
 */
interface CircularProgressProps {
  score?: number;
  value?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  delay?: number;
  showGlow?: boolean;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  score: scoreProp,
  value,
  size = 80,
  strokeWidth = 6,
  label,
  delay = 0,
  showGlow = true,
}) => {
  const score = scoreProp ?? value ?? 0;
  const [isVisible, setIsVisible] = useState(false);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);
  const colors = scoreColorClasses[color];

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay, type: "spring", stiffness: 100 }}
    >
      {label && (
        <span className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </span>
      )}
      <div className="relative" style={{ width: size, height: size }}>
        {showGlow && (
          <motion.div
            className={`absolute inset-0 rounded-full ${colors.bg}`}
            variants={glowRingVariants}
            initial="initial"
            animate={isVisible ? "animate" : "initial"}
            style={{ filter: "blur(8px)" }}
          />
        )}
        <svg
          className="transform -rotate-90 relative z-10"
          width={size}
          height={size}
        >
          <circle
            className={colors.bgLight}
            strokeWidth={strokeWidth}
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <motion.circle
            className={colors.text}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1], delay }}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>
        <motion.div
          className="absolute inset-0 flex items-center justify-center z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.5 }}
        >
          <span className={`text-lg font-bold ${colors.text}`}>{score}%</span>
        </motion.div>
      </div>
    </motion.div>
  );
};

/**
 * HorizontalProgressBar Component
 * Animated width fill bar with shine effect
 */
interface HorizontalProgressBarProps {
  score?: number;
  value?: number;
  label?: string;
  delay?: number;
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
  height?: number;
}

export const HorizontalProgressBar: React.FC<HorizontalProgressBarProps> = ({
  score: scoreProp,
  value,
  label,
  delay = 0,
  showValue = true,
  size = "md",
  height,
}) => {
  const score = scoreProp ?? value ?? 0;
  const color = getScoreColor(score);
  const colors = scoreColorClasses[color];
  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-4" };
  const heightStyle = height ? { height: `${height}px` } : undefined;
  const heightClass = height ? "" : heights[size];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <div className="flex justify-between items-center mb-1.5">
        {label && (
          <span className="text-sm font-medium text-gray-700">{label}</span>
        )}
        {showValue && (
          <motion.span
            className={`text-sm font-bold ${colors.text}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.3 }}
          >
            {Math.round(score)}%
          </motion.span>
        )}
      </div>
      <div
        className={`w-full ${heightClass} ${colors.bgLight} rounded-full overflow-hidden`}
        style={heightStyle}
      >
        <motion.div
          className={`h-full ${colors.bg} rounded-full relative overflow-hidden`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1], delay: delay + 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            variants={shineVariants}
            initial="initial"
            animate="animate"
          />
        </motion.div>
      </div>
    </motion.div>
  );
};

/**
 * FilterBar Component
 * Standardized filter controls container
 */
interface FilterBarProps {
  children: ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  children,
  onRefresh,
  isRefreshing,
}) => (
  <motion.div
    className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-black/5 shadow-sm"
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    {children}
    {onRefresh && (
      <motion.button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="p-2 rounded-xl bg-alloro-bg text-gray-600 hover:bg-alloro-orange/10 hover:text-alloro-orange disabled:opacity-50 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <RefreshCw
          className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
        />
      </motion.button>
    )}
  </motion.div>
);

/**
 * BulkActionBar Component
 * Selection action bar with count display
 */
interface BulkAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  totalCount?: number;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onClear?: () => void;
  actions: BulkAction[] | ReactNode;
  isAllSelected?: boolean;
  extraContent?: ReactNode;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onClear,
  actions,
  isAllSelected,
  extraContent,
}) => {
  const actionVariants = {
    primary:
      "bg-alloro-orange text-white hover:bg-alloro-orange/90 border-transparent shadow-lg shadow-alloro-orange/30",
    secondary:
      "bg-white text-gray-700 hover:bg-gray-50 border-gray-200 hover:border-gray-300",
    danger: "bg-white text-red-600 hover:bg-red-50 border-red-200",
  };

  // Only render when there are selected items
  if (selectedCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <div className="flex items-center gap-4 px-5 py-3 bg-white rounded-2xl border border-gray-200 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
              <span className="text-sm font-bold text-blue-600">
                {selectedCount}
              </span>
            </div>
            <span className="text-sm font-medium text-gray-700">
              {totalCount ? `of ${totalCount}` : ""} selected
            </span>
            {onSelectAll && onDeselectAll && (
              <button
                onClick={isAllSelected ? onDeselectAll : onSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {isAllSelected ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex items-center gap-2">
            {extraContent}
            {Array.isArray(actions)
              ? actions.map((action, idx) => (
                  <motion.button
                    key={idx}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${actionVariants[action.variant || "secondary"]}`}
                    whileHover={{ scale: action.disabled ? 1 : 1.02 }}
                    whileTap={{ scale: action.disabled ? 1 : 0.98 }}
                  >
                    {action.icon}
                    {action.label}
                  </motion.button>
                ))
              : actions}
          </div>
          {(onClear || onDeselectAll) && (
            <>
              <div className="w-px h-6 bg-gray-200" />
              <motion.button
                onClick={onClear || onDeselectAll}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Clear selection"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </motion.button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * EmptyState Component
 * Consistent empty state display
 */
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => (
  <motion.div
    className="flex flex-col items-center justify-center py-16 px-6 text-center"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
  >
    <motion.div
      className="w-16 h-16 bg-alloro-bg rounded-2xl flex items-center justify-center text-gray-400 mb-4"
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {icon || <Inbox className="w-8 h-8" />}
    </motion.div>
    <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
    {description && (
      <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>
    )}
    {action && (
      <motion.button
        onClick={action.onClick}
        className="mt-4 px-4 py-2 bg-alloro-orange text-white rounded-xl font-medium text-sm hover:bg-alloro-navy transition-colors"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
      >
        {action.label}
      </motion.button>
    )}
  </motion.div>
);

/**
 * ExpandableSection Component
 * Animated accordion section - supports both controlled and uncontrolled modes
 */
interface ExpandableSectionProps {
  // Uncontrolled mode props
  title?: string;
  icon?: ReactNode;
  badge?: string;
  defaultExpanded?: boolean;
  // Controlled mode props
  header?: ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  // Common props
  children: ReactNode;
  delay?: number;
}

export const ExpandableSection: React.FC<ExpandableSectionProps> = ({
  title,
  icon,
  badge,
  defaultExpanded = false,
  header,
  isExpanded: controlledExpanded,
  onToggle,
  children,
  delay = 0,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    }
    if (!isControlled) {
      setInternalExpanded(!internalExpanded);
    }
  };

  const renderHeader = () => {
    if (header) return header;
    return (
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-8 h-8 bg-alloro-bg rounded-lg flex items-center justify-center text-alloro-navy">
            {icon}
          </div>
        )}
        <span className="font-semibold text-gray-900">{title}</span>
        {badge && (
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
            {badge}
          </span>
        )}
      </div>
    );
  };

  return (
    <AnimatedCard delay={delay} hoverable={false} className="overflow-hidden">
      <motion.button
        onClick={handleToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        whileTap={{ scale: 0.995 }}
      >
        {renderHeader()}
        <motion.div
          variants={chevronVariants}
          animate={expanded ? "expanded" : "collapsed"}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-gray-400" />
        </motion.div>
      </motion.button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            variants={expandCollapse}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 border-t border-gray-100">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedCard>
  );
};

/**
 * TabBar Component
 * Animated tab navigation with indicator
 */
interface TabBarProps {
  tabs: Array<{
    id: string;
    label: string;
    description?: string;
    icon?: ReactNode;
  }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTab,
  onTabChange,
}) => (
  <div className="flex items-stretch gap-1 p-1.5 bg-gray-100 rounded-xl">
    {tabs.map((tab) => {
      const isActive = activeTab === tab.id;
      return (
        <motion.button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`group relative flex items-center justify-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            isActive
              ? "text-alloro-navy"
              : "text-gray-500 hover:text-gray-700"
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isActive && (
            <motion.div
              className="absolute inset-0 bg-white rounded-lg shadow-sm"
              layoutId="activeTab"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex flex-col items-center text-center">
            <span className="flex items-center gap-1.5">
              {tab.icon}
              <span>{tab.label}</span>
            </span>
            {isActive && tab.description && (
              <span className="text-xs font-normal leading-tight text-gray-400 mt-0.5">
                {tab.description}
              </span>
            )}
          </span>
        </motion.button>
      );
    })}
  </div>
);

/**
 * ActionButton Component
 * Styled button for actions with icon support and glowing orange primary variant
 */
interface ActionButtonProps {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  icon,
  onClick,
  variant = "secondary",
  size = "md",
  disabled = false,
  loading = false,
}) => {
  const variants = {
    primary:
      "bg-alloro-orange hover:bg-alloro-orange/90 text-white border-transparent shadow-lg shadow-alloro-orange/30 hover:shadow-xl hover:shadow-alloro-orange/40",
    secondary:
      "bg-white text-gray-700 hover:bg-gray-50 border-gray-200 hover:border-gray-300 shadow-sm hover:shadow",
    danger:
      "bg-white text-red-600 hover:bg-red-50 border-red-200 hover:border-red-300 shadow-sm",
    ghost:
      "bg-transparent text-gray-600 hover:bg-gray-100 border-transparent hover:text-gray-800",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-sm",
  };

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none ${variants[variant]} ${sizes[size]}`}
      whileHover={{ scale: disabled ? 1 : 1.03 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      transition={{ duration: 0.15 }}
    >
      {loading ? (
        <RefreshCw className="w-4 h-4 animate-spin" />
      ) : (
        icon && <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
      )}
      {label}
    </motion.button>
  );
};

/**
 * CardGrid Component
 * Animated grid container for cards
 */
interface CardGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
}

export const CardGrid: React.FC<CardGridProps> = ({
  children,
  columns = 2,
}) => {
  const colClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <motion.div
      className={`grid ${colClasses[columns]} gap-4`}
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
};

/**
 * Badge Component
 * Small inline badge/pill - supports both label prop and children
 */
type BadgeColor =
  | "orange"
  | "green"
  | "red"
  | "blue"
  | "gray"
  | "purple"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "default";

interface BadgeProps {
  label?: string;
  children?: ReactNode;
  color?: BadgeColor;
  variant?: BadgeColor;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  children,
  color,
  variant,
}) => {
  const colorValue = color || variant || "gray";
  const colorStyles: Record<BadgeColor, string> = {
    orange: "bg-amber-100 text-amber-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    gray: "bg-gray-100 text-gray-700",
    purple: "bg-purple-100 text-purple-700",
    success: "bg-green-100 text-green-700",
    danger: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
    default: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${colorStyles[colorValue]}`}
    >
      {children || label}
    </span>
  );
};

// ============================================================
// QUALITY IMMUNE SYSTEM -- Layout & Data-Voice Components
// ============================================================

/**
 * PageLayout -- Constrained wrapper for every admin/dashboard page.
 *
 * Enforces max-width, consistent padding, and responsive breakpoints.
 * Prevents the "wide margins on desktop" problem.
 */
interface PageLayoutProps {
  children: ReactNode;
  maxWidth?: "narrow" | "standard" | "wide";
  className?: string;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  maxWidth = "standard",
  className = "",
}) => {
  const widths = {
    narrow: "max-w-3xl",
    standard: "max-w-6xl",
    wide: "max-w-7xl",
  };

  return (
    <div className={`mx-auto ${widths[maxWidth]} px-4 sm:px-6 lg:px-8 py-6 space-y-6 ${className}`}>
      {children}
    </div>
  );
};

/**
 * MetricGrid -- Responsive grid for metric cards.
 *
 * 1-col mobile, 2-col tablet, 3-4 col desktop.
 * Consistent gap spacing. No ad-hoc grid classes.
 */
interface MetricGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export const MetricGrid: React.FC<MetricGridProps> = ({
  children,
  columns = 3,
  className = "",
}) => {
  const colClasses = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  };

  return (
    <div className={`grid ${colClasses[columns]} gap-4 ${className}`}>
      {children}
    </div>
  );
};

/**
 * DashboardSection -- Consistent section wrapper with header.
 *
 * Replaces ad-hoc Panel/CollapsibleSection patterns.
 */
interface DashboardSectionProps {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
}

export const DashboardSection: React.FC<DashboardSectionProps> = ({
  icon,
  label,
  children,
  className = "",
}) => (
  <div className={`card-supporting ${className}`}>
    <div className="flex items-center gap-2.5 mb-4">
      {icon && <div className="text-[#D56753]/50">{icon}</div>}
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D56753]/40">
        {label}
      </p>
    </div>
    {children}
  </div>
);

/**
 * StatusBadge -- Color DERIVED from score or status. No manual color prop.
 *
 * This component makes it structurally impossible to show a green badge
 * on a score of 42, or a red badge on a healthy org. The color IS the data.
 */
interface StatusBadgeProps {
  /** Numeric score (0-100) OR explicit health status */
  score?: number;
  status?: "green" | "amber" | "red" | "gray";
  /** Optional label override. Defaults to computed label. */
  label?: string;
  size?: "sm" | "md";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  score,
  status,
  label,
  size = "sm",
}) => {
  // Derive color from score if provided, otherwise use explicit status
  const derivedStatus: string = status
    ? status
    : score !== undefined
    ? score >= 70
      ? "green"
      : score >= 40
      ? "amber"
      : "red"
    : "gray";

  const derivedLabel = label
    ? label
    : score !== undefined
    ? `${score}`
    : derivedStatus;

  const styles: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    gray: "bg-gray-50 text-gray-500 border-gray-200",
  };

  const sizeStyles = size === "sm"
    ? "px-2 py-0.5 text-xs"
    : "px-3 py-1 text-xs";

  return (
    <span className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider border ${styles[derivedStatus]} ${sizeStyles}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
        derivedStatus === "green" ? "bg-emerald-500" :
        derivedStatus === "amber" ? "bg-amber-500" :
        derivedStatus === "red" ? "bg-red-500" : "bg-gray-400"
      }`} />
      {derivedLabel}
    </span>
  );
};

/**
 * InsightCard -- Data + context in one component. The Monday email voice.
 *
 * Instead of showing a number, it shows what the number means.
 * "$13,500" becomes "$13,500 MRR, $4,000 above burn."
 * "3 green" becomes "All clients active. Garrison quiet for 5 days."
 *
 * This is the Library Test applied to components: does the information
 * arrive with meaning, or does the user have to figure it out?
 */
interface InsightCardProps {
  /** The headline number or status */
  value: string;
  /** What this metric is (short label) */
  label: string;
  /** The insight: what this number MEANS right now (the Monday email voice) */
  insight?: string;
  /** Trend direction */
  trend?: "up" | "down" | "flat";
  /** Trend label (e.g. "+2 this month") */
  trendLabel?: string;
  /** Score for auto-coloring the card accent */
  score?: number;
  /** Icon component */
  icon?: ReactNode;
  className?: string;
}

export const InsightCard: React.FC<InsightCardProps> = ({
  value,
  label,
  insight,
  trend,
  trendLabel,
  icon,
  className = "",
}) => {
  const trendColor =
    trend === "up" ? "text-emerald-600" :
    trend === "down" ? "text-red-600" : "text-gray-400";

  return (
    <div className={`card-supporting ${className}`}>
      {icon && (
        <div className="mb-3 text-[#D56753]/40">{icon}</div>
      )}
      <p className="text-3xl font-semibold text-[#212D40] leading-none">{value}</p>
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D56753]/40 mt-1">
        {label}
      </p>
      {trendLabel && (
        <p className={`text-xs font-semibold mt-2 ${trendColor}`}>
          {trendLabel}
        </p>
      )}
      {insight && (
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          {insight}
        </p>
      )}
    </div>
  );
};
