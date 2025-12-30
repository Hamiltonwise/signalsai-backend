# Frontend Reskin Implementation Plan v2.0

## Project Overview

**Goal**: Reskin the signalsai frontend application to match the new design system from the newdesign folder while preserving all existing functionality, API integrations, and technical behaviors.

**Frontend Location**: `../signalsai/src/`
**New Design Reference**: `../newdesign/components/`

---

## Table of Contents

1. [Design System Changes](#design-system-changes-summary)
2. [Phase 1: Global Styles](#phase-1-global-styles-update)
3. [Phase 2: Sidebar](#phase-2-sidebar-component-reskin)
4. [Phase 3: Dashboard](#phase-3-dashboard-overview-reskin)
5. [Phase 4: PMS Statistics](#phase-4-pms-statistics-reskin)
6. [Phase 5: Rankings](#phase-5-rankings-dashboard-reskin)
7. [Phase 6: Tasks](#phase-6-tasks-view-reskin)
8. [Phase 7: Notifications](#phase-7-notifications-page-reskin)
9. [Phase 8: Settings](#phase-8-settings-page-reskin)
10. [Phase 9: Profile Page](#phase-9-create-profile-page)
11. [Phase 10: Help Page](#phase-10-create-help-page)
12. [Phase 11: Sign In](#phase-11-sign-in-page-reskin)
13. [Phase 12: PageWrapper](#phase-12-pagewrapper--layout-updates)
14. [Phase 13: Admin Pages](#phase-13-admin-pages-basic-reskin)
15. [Appendix A: Reusable Components](#appendix-a-reusable-component-library)
16. [Appendix B: Animation Patterns](#appendix-b-animation-patterns)
17. [Appendix C: Skeleton Loaders](#appendix-c-skeleton-loader-patterns)
18. [Appendix D: Form Input Patterns](#appendix-d-form-input-patterns)
19. [Appendix E: Modal/Dialog Patterns](#appendix-e-modaldialog-patterns)
20. [Critical Preservation List](#critical-preservation-list)

---

## Design System Changes Summary

### Color Palette Migration

| Old Variable    | Old Value | New Variable        | New Value |
| --------------- | --------- | ------------------- | --------- |
| `alloro-cobalt` | #244EE6   | `alloro-orange`     | #D66853   |
| `alloro-navy`   | #0D1321   | `alloro-navy`       | #11151C   |
| `alloro-teal`   | #06B6D4   | (keep as secondary) | #06B6D4   |
| `alloro-bg`     | #F3F6F8   | `alloro-bg`         | #F8FAFC   |
| (new)           | -         | `alloro-sidebg`     | #0D1117   |
| (new)           | -         | `alloro-sidehover`  | #161B22   |
| (new)           | -         | `alloro-textDark`   | #11151C   |

### Typography

- **Body font**: Inter (unchanged)
- **Heading font**: Plus Jakarta Sans (unchanged)
- **Font weights**: Use `font-black` (900) more frequently for headings
- **Letter spacing**: Wider tracking `tracking-[0.2em]` to `tracking-[0.4em]` on uppercase labels

### Spacing & Layout

- **Max content width**: `max-w-[1100px]` (reduced from `max-w-[1600px]`)
- **Container padding**: `px-6 lg:px-10` consistent pattern
- **Section spacing**: `space-y-10 lg:space-y-16` between major sections
- **Border radius**: Use `rounded-2xl` and `rounded-3xl` liberally

### Shadow System

```css
shadow-premium: 0 4px 20px rgba(0,0,0,0.08)
shadow-soft-glow: 0 0 20px rgba(214,104,83,0.2)
shadow-inner-soft: inset 0 2px 4px rgba(0,0,0,0.06)
```

---

## Phase 1: Global Styles Update

### File: `../signalsai/src/index.css`

**Step 1**: Update the `@theme inline` section to add new colors:

```css
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  /* UPDATED: alloro-navy slightly darker */
  --color-alloro-navy: #11151c;

  /* NEW: Replace cobalt with orange as primary accent */
  --color-alloro-orange: #d66853;

  /* KEEP: teal as secondary accent */
  --color-alloro-teal: #06b6d4;

  /* UPDATED: Slightly lighter background */
  --color-alloro-bg: #f8fafc;

  /* NEW: Sidebar colors */
  --color-alloro-sidebg: #0d1117;
  --color-alloro-sidehover: #161b22;

  /* NEW: Text dark color */
  --color-alloro-textDark: #11151c;

  /* ...rest of existing variables... */
}
```

**Step 2**: Update body background in html,body rule:

```css
html,
body {
  font-family: "Inter", sans-serif;
  background-color: #f8fafc; /* Updated from #F3F6F8 */
}
```

**Step 3**: Add new utility classes in `@layer components`:

```css
@layer components {
  /* Existing glass classes - keep as is */
  .glass {
    @apply bg-white border border-slate-200 shadow-sm;
  }
  .glass-card {
    @apply rounded-xl p-4;
  }
  .glass-hover {
    @apply transition-colors hover:bg-slate-50;
  }

  /* NEW: Premium Shadow */
  .shadow-premium {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  }

  /* NEW: Soft Glow (for orange accent elements) */
  .shadow-soft-glow {
    box-shadow: 0 0 20px rgba(214, 104, 83, 0.2);
  }

  /* NEW: Inner Soft shadow */
  .shadow-inner-soft {
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
  }

  /* NEW: Glass Header (sticky headers) */
  .glass-header {
    @apply bg-white/80 backdrop-blur-xl;
  }

  /* NEW: Skeleton loader base */
  .skeleton {
    @apply animate-pulse bg-slate-200 rounded;
  }

  /* NEW: Input focus ring (orange) */
  .input-focus-orange:focus {
    @apply outline-none border-alloro-orange ring-4 ring-alloro-orange/10;
  }
}
```

**Step 4**: Add skeleton shimmer animation (after existing animations):

```css
@keyframes skeleton-shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton-shimmer {
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}
```

---

## Phase 2: Sidebar Component Reskin

### File: `../signalsai/src/components/Sidebar.tsx`

**Reference Code Snippet** (from `../newdesign/components/Sidebar.tsx`):

```tsx
// NavItem Component - COPY THIS PATTERN
const NavItem = ({
  icon,
  label,
  active = false,
  onClick,
  badge,
  hasNotification = false,
}: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group relative
    ${
      active
        ? "bg-alloro-sidehover text-white shadow-sm border border-white/5"
        : "text-white/40 hover:text-white hover:bg-alloro-sidehover"
    }`}
  >
    <div className="flex items-center gap-3.5">
      <div
        className={`transition-transform duration-300 ${
          active
            ? "scale-110 text-alloro-orange"
            : "opacity-40 group-hover:opacity-100"
        }`}
      >
        {icon}
      </div>
      <span
        className={`text-[13px] font-semibold tracking-tight ${
          active ? "text-white" : "group-hover:text-white/80"
        }`}
      >
        {label}
      </span>
      {hasNotification && !active && (
        <span className="absolute left-2.5 top-2.5 flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alloro-orange opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-alloro-orange"></span>
        </span>
      )}
    </div>
    <div className="flex items-center gap-2">
      {badge && (
        <span
          className={`px-2 py-0.5 rounded-md text-[9px] font-black leading-none
          ${
            active ? "bg-alloro-orange text-white" : "bg-white/10 text-white/40"
          }`}
        >
          {badge}
        </span>
      )}
      {!badge && active && <ChevronRight size={14} className="opacity-20" />}
    </div>
  </button>
);
```

### Key Changes Required:

**1. Sidebar container background:**

```tsx
// CHANGE FROM:
className = "... bg-alloro-navy ...";
// TO:
className = "... bg-alloro-sidebg ...";
```

**2. Brand header logo:**

```tsx
// CHANGE FROM:
<div className="w-10 h-10 bg-alloro-cobalt rounded-xl ...">
// TO:
<div className="w-10 h-10 bg-alloro-orange rounded-xl flex items-center justify-center text-xl font-black font-heading text-white shadow-soft-glow transition-transform group-hover:scale-105">
```

**3. Brand subtitle:**

```tsx
// CHANGE FROM:
<span className="text-alloro-teal ...">
// TO:
<span className="text-[9px] font-black text-white/30 uppercase tracking-[0.25em] mt-1.5 leading-none">
```

**4. NavItem active state - Replace ALL instances:**

```tsx
// CHANGE FROM:
"bg-alloro-cobalt text-white shadow-[0_10px_20px_-5px_rgba(36,78,230,0.3)]";
// TO:
"bg-alloro-sidehover text-white shadow-sm border border-white/5";
```

**5. NavItem active icon color:**

```tsx
// ADD to active icon:
"text-alloro-orange";
```

**6. Notification ping:**

```tsx
// CHANGE FROM:
"bg-alloro-cobalt";
// TO:
"bg-alloro-orange";
```

**7. Add Profile and Help navigation items:**

Add these to the navigation section (after existing nav items):

```tsx
{
  /* NEW: Add Support section with Help and Profile */
}
<div className="space-y-1.5">
  <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] px-4 mb-4">
    Support
  </div>
  <NavItem
    icon={<HelpCircle size={18} />}
    label="Help Center"
    active={location.pathname === "/help"}
    onClick={() => navigate("/help")}
  />
</div>;
```

**8. Footer account section:**

```tsx
// Add Profile link to account section
<div
  className="bg-white/5 border border-white/5 rounded-2xl p-5 transition-all hover:bg-alloro-sidehover cursor-pointer group"
  onClick={() => navigate("/profile")}
>
  <div className="flex items-center gap-3 mb-4">
    <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[10px] font-black border border-white/10 group-hover:border-alloro-orange transition-colors">
      {/* User initials */}
    </div>
    {/* User info */}
  </div>
  {/* Logout button */}
</div>
```

**9. Add HelpCircle import:**

```tsx
import { HelpCircle } from "lucide-react";
```

---

## Phase 3: Dashboard Overview Reskin

### File: `../signalsai/src/components/dashboard/DashboardOverview.tsx`

### 3.1 IntelligencePulse Component

**Reference Code** (copy exactly):

```tsx
const IntelligencePulse = () => (
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alloro-orange opacity-30"></span>
    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-alloro-orange opacity-60"></span>
  </span>
);
```

### 3.2 MetricCard Component

**Reference Code** (copy exactly):

```tsx
const MetricCard = ({ label, value, trend, isHighlighted }: any) => {
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
      <span className="text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.2em] mb-4 leading-none text-left">
        {label}
      </span>
      <div className="flex items-center justify-between">
        <span className="text-3xl font-black font-heading tracking-tighter leading-none text-alloro-textDark">
          {value}
        </span>
        {trend && (
          <span
            className={`text-[11px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm ${
              isUp
                ? "bg-green-100 text-green-700"
                : isDown
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {trend}{" "}
            {isUp ? (
              <ArrowUpRight size={10} />
            ) : isDown ? (
              <TrendingDown size={10} />
            ) : null}
          </span>
        )}
      </div>
    </div>
  );
};
```

### 3.3 CompactTag Component

**Reference Code** (copy exactly):

```tsx
const CompactTag = ({ status }: { status: string }) => {
  const styles: any = {
    Increasing: "text-green-700 bg-green-50 border-green-100",
    Decreasing: "text-red-700 bg-red-50 border-red-100",
    New: "text-indigo-700 bg-indigo-50 border-indigo-100",
    Dormant: "text-alloro-textDark/20 bg-alloro-bg border-black/5",
    Stable: "text-slate-500 bg-slate-50 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border leading-none mt-1 w-fit ${
        styles[status] || styles["Stable"]
      }`}
    >
      {status}
    </span>
  );
};
```

### 3.4 Header Section Pattern

```tsx
<header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
  <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
    <div className="flex items-center gap-5">
      <IntelligencePulse />
      <div className="flex flex-col text-left">
        <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
          Practice Intelligence
        </h1>
        <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
          Operational Integrity Hub
        </span>
      </div>
    </div>
    <div className="flex items-center gap-4">
      <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-black/5 shadow-inner-soft">
        <ShieldCheck size={14} className="text-alloro-orange opacity-60" />
        <span className="text-[9px] font-black text-alloro-orange/60 uppercase tracking-widest">
          Secure Pulse Protocol
        </span>
      </div>
      <button
        onClick={handleRefresh}
        className="p-3 hover:bg-white rounded-xl transition-all active:scale-95 text-alloro-textDark/30"
      >
        <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
      </button>
    </div>
  </div>
</header>
```

### 3.5 Greeting Section Pattern

```tsx
<section className="animate-in fade-in slide-in-from-bottom-2 duration-700 text-left">
  <div className="flex items-center gap-4 mb-3">
    <div className="px-3 py-1.5 bg-[#FDECEA] rounded-lg text-[#D66853] text-[10px] font-black uppercase tracking-widest border border-[#D66853]/10 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-[#D66853]"></span>
      Real-time Analysis • {currentDate}
    </div>
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></span>
      <span className="text-green-500 text-[10px] font-black uppercase tracking-widest">
        Healthy Growth Signals
      </span>
    </div>
  </div>
  <h1 className="text-5xl lg:text-6xl font-black font-heading text-alloro-navy tracking-tight leading-none mb-4">
    Good Morning, {userName}.
  </h1>
  <p className="text-xl lg:text-2xl text-slate-500 font-medium tracking-tight leading-relaxed max-w-4xl">
    Your practice momentum is{" "}
    <span className="text-alloro-orange underline underline-offset-8 font-black">
      Optimized
    </span>
    . We have identified {actionCount} refinements for your attention today.
  </p>
</section>
```

### 3.6 Intelligence Briefing Banner

```tsx
<section className="animate-in fade-in slide-in-from-top-8 duration-1000">
  <div className="bg-alloro-orange rounded-2xl p-6 lg:px-10 lg:py-8 text-white relative overflow-hidden shadow-xl">
    <div className="absolute top-0 right-0 p-80 bg-white/10 rounded-full -mr-40 -mt-40 blur-[120px] pointer-events-none"></div>
    <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 text-left">
      <div className="flex items-start sm:items-center gap-6">
        <div className="w-12 h-12 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shadow-inner shrink-0 group">
          <Zap
            size={24}
            className="text-white group-hover:scale-110 transition-transform"
          />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl sm:text-2xl font-black font-heading tracking-tight leading-none">
            Intelligence Briefing
          </h3>
          <p className="text-white/80 text-base font-medium tracking-tight max-w-lg leading-relaxed">
            You have{" "}
            <span className="text-white font-black underline decoration-white/40 underline-offset-4">
              {criticalActions} critical actions
            </span>{" "}
            to secure ${recoveryAmount}+ in recovery.
          </p>
        </div>
      </div>
      <button
        onClick={() => navigate("/tasks")}
        className="w-full sm:w-auto px-10 py-4 bg-white text-alloro-orange rounded-2xl text-[11px] font-black uppercase tracking-[0.25em] shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-4 shrink-0"
      >
        REVIEW ACTIONS <ArrowRight size={16} />
      </button>
    </div>
  </div>
</section>
```

### 3.7 Section Headers Pattern

```tsx
<div className="flex items-center gap-4 px-1">
  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-alloro-textDark/40 whitespace-nowrap">
    Section Title Here
  </h3>
  <div className="h-px w-full bg-black/10"></div>
</div>
```

### 3.8 Wins/Risks Two-Column Pattern

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-left">
  {/* Wins Column */}
  <div className="space-y-5">
    <div className="flex items-center gap-3 text-green-600 font-black text-[10px] uppercase tracking-[0.3em]">
      <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center border border-green-100 shadow-sm">
        <TrendingUp size={16} />
      </div>
      Wins
    </div>
    <div className="space-y-3">
      {wins.map((win, idx) => (
        <div
          key={idx}
          className="flex gap-4 p-5 bg-white border border-slate-50 rounded-2xl shadow-sm hover:shadow-md transition-all"
        >
          <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" size={20} />
          <span className="text-sm font-bold text-slate-500 leading-relaxed tracking-tight">
            {win}
          </span>
        </div>
      ))}
    </div>
  </div>

  {/* Risks Column */}
  <div className="space-y-5">
    <div className="flex items-center gap-3 text-red-600 font-black text-[10px] uppercase tracking-[0.3em]">
      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center border border-red-100 shadow-sm">
        <AlertTriangle size={16} />
      </div>
      Risks
    </div>
    <div className="space-y-3">
      {risks.map((risk, idx) => (
        <div
          key={idx}
          className="flex gap-4 p-5 bg-white border border-slate-50 rounded-2xl shadow-sm hover:shadow-md transition-all"
        >
          <div className="w-2.5 h-2.5 bg-red-400 rounded-full shrink-0 mt-2"></div>
          <span className="text-sm font-bold text-slate-500 leading-relaxed tracking-tight">
            {risk}
          </span>
        </div>
      ))}
    </div>
  </div>
</div>
```

### 3.9 Footer Pattern

```tsx
<footer className="pt-24 pb-12 flex flex-col items-center gap-10 text-center">
  <div className="w-16 h-16 bg-alloro-orange text-white rounded-2xl flex items-center justify-center text-3xl font-black shadow-2xl">
    A
  </div>
  <div className="space-y-4">
    <p className="text-[11px] text-alloro-textDark/20 font-black tracking-[0.4em] uppercase">
      Alloro Practice Intelligence • v2.6.0
    </p>
    <div className="flex items-center justify-center gap-10 text-[10px] font-black text-alloro-textDark/30 uppercase tracking-[0.2em]">
      <span className="flex items-center gap-3">
        <ShieldCheck size={18} /> HIPAA SECURE
      </span>
      <span className="flex items-center gap-3">
        <Activity size={18} /> LIVE ANALYTICS
      </span>
    </div>
  </div>
</footer>
```

---

## Phase 4: PMS Statistics Reskin

### File: `../signalsai/src/components/PMS/PMSVisualPillars.tsx`

### 4.1 Page Header Pattern

```tsx
<header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
  <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
    <div className="flex items-center gap-5">
      <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
        <BarChart3 size={20} />
      </div>
      <div className="flex flex-col text-left">
        <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
          Revenue Attribution
        </h1>
        <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
          PMS Sync Verified Protocol
        </span>
      </div>
    </div>
    <button
      onClick={handleExport}
      className="flex items-center gap-3 px-6 py-3.5 bg-white border border-black/5 text-alloro-navy rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-alloro-orange/20 transition-all shadow-premium active:scale-95"
    >
      <Download size={14} className={isExporting ? "animate-bounce" : ""} />
      <span className="hidden sm:inline">
        {isExporting ? "Exporting..." : "Export Attribution Hub"}
      </span>
    </button>
  </div>
</header>
```

### 4.2 Hero Section Pattern

```tsx
<section className="animate-in fade-in slide-in-from-bottom-2 duration-700 text-left pt-2">
  <div className="flex items-center gap-4 mb-3">
    <div className="px-3 py-1.5 bg-alloro-orange/5 rounded-lg text-alloro-orange text-[10px] font-black uppercase tracking-widest border border-alloro-orange/10 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-alloro-orange"></span>
      Ledger Pulse Active
    </div>
  </div>
  <h1 className="text-5xl lg:text-6xl font-black font-heading text-alloro-navy tracking-tight leading-none mb-4">
    Revenue Intelligence.
  </h1>
  <p className="text-xl lg:text-2xl text-slate-500 font-medium tracking-tight leading-relaxed max-w-4xl">
    Analyzing production attribution across{" "}
    <span className="text-alloro-orange underline underline-offset-8 font-black">
      All Marketing & Doctor Referral
    </span>{" "}
    channels for maximum practice yield.
  </p>
</section>
```

### 4.3 Velocity Pipeline Chart Pattern

```tsx
<section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden group">
  <div className="px-10 py-8 border-b border-black/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-alloro-bg flex items-center justify-center text-alloro-orange">
        <Calendar size={22} />
      </div>
      <div className="text-left">
        <h2 className="text-xl font-black font-heading text-alloro-navy tracking-tight leading-none">
          Referral Velocity Pipeline
        </h2>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
          Trailing 6-month Synced Analysis
        </p>
      </div>
    </div>
    <div className="flex items-center gap-8 bg-slate-50 px-6 py-3 rounded-2xl border border-black/5">
      <div className="flex items-center gap-2.5">
        <div className="w-2.5 h-2.5 rounded-full bg-alloro-orange"></div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Marketing
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="w-2.5 h-2.5 rounded-full bg-alloro-navy"></div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Doctor
        </span>
      </div>
    </div>
  </div>
  <div className="p-10 lg:p-14 space-y-10">
    {monthlyData.map((data, index) => (
      <div
        key={index}
        className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-12 group/row"
      >
        <div className="w-24 sm:text-right shrink-0">
          <div className="text-sm font-black text-alloro-navy uppercase tracking-widest">
            {data.month}
          </div>
          <div className="text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-1">
            FY {data.year}
          </div>
        </div>
        <div className="flex-1 space-y-3.5">
          <div className="relative h-6 flex items-center gap-5">
            <div
              className="h-full bg-alloro-orange rounded-xl shadow-lg shadow-alloro-orange/10 transition-all duration-1000 group-hover/row:brightness-110"
              style={{ width: `${(data.selfReferrals / maxValue) * 100}%` }}
            />
            <span className="text-sm font-black text-alloro-navy tabular-nums font-sans">
              {data.selfReferrals}
            </span>
          </div>
          <div className="relative h-4 flex items-center gap-5">
            <div
              className="h-full bg-alloro-navy/80 rounded-xl transition-all duration-1000"
              style={{ width: `${(data.doctorReferrals / maxValue) * 100}%` }}
            />
            <span className="text-[11px] font-black text-slate-400 tabular-nums font-sans">
              {data.doctorReferrals}
            </span>
          </div>
        </div>
      </div>
    ))}
  </div>
</section>
```

### 4.4 Attribution Matrix Table Pattern

```tsx
<section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden">
  <div className="px-10 py-8 border-b border-black/5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
    <div className="text-left">
      <h2 className="text-xl font-black font-heading text-alloro-navy tracking-tight">
        Attribution Master Matrix
      </h2>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
        Direct Production Sync
      </p>
    </div>
    <div className="flex p-1.5 bg-slate-50 border border-black/5 rounded-2xl overflow-x-auto w-full lg:w-auto">
      {["All", "Doctor", "Marketing"].map((filter) => (
        <button
          key={filter}
          onClick={() => setActiveFilter(filter)}
          className={`flex-1 lg:flex-none px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${
            activeFilter === filter
              ? "bg-white text-alloro-navy shadow-md border border-black/5"
              : "text-slate-400 hover:text-alloro-navy"
          }`}
        >
          {filter}
        </button>
      ))}
    </div>
  </div>
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse table-fixed">
      <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] border-b border-black/5">
        <tr>
          <th className="px-10 py-5 w-[25%]">Ledger Source</th>
          <th className="px-4 py-5 text-center w-[12%]">Volume</th>
          <th className="px-4 py-5 text-center w-[15%]">Yield %</th>
          <th className="px-4 py-5 text-right w-[18%]">Production</th>
          <th className="px-10 py-5 w-[30%]">Intelligence Note</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {/* Map through data */}
      </tbody>
    </table>
  </div>
</section>
```

### 4.5 Upload Section Pattern

```tsx
<section className="bg-white rounded-3xl border border-black/5 shadow-premium p-10 lg:p-16 flex flex-col md:flex-row items-center justify-between gap-12 relative overflow-hidden group">
  <div className="absolute top-0 right-0 w-96 h-96 bg-alloro-orange/[0.03] rounded-full blur-3xl -mr-48 -mt-48 pointer-events-none group-hover:bg-alloro-orange/[0.06] transition-all duration-700"></div>

  <div className="space-y-8 flex-1 text-left relative z-10">
    <div className="flex items-center gap-4">
      <div className="w-14 h-14 bg-alloro-navy text-white rounded-2xl flex items-center justify-center shadow-2xl">
        <Upload size={24} />
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-alloro-orange">
          Ledger Ingestion
        </span>
        <h3 className="text-3xl font-black font-heading text-alloro-navy tracking-tight mt-1">
          Sync your practice.
        </h3>
      </div>
    </div>
    <p className="text-lg text-slate-500 font-medium tracking-tight leading-relaxed max-w-lg">
      Upload your latest exports from{" "}
      <span className="text-alloro-navy font-black">
        Cloud9, Dolphin, or Gaidge
      </span>{" "}
      to refresh all intelligence models instantly.
    </p>
    <div className="flex flex-wrap items-center gap-8 pt-4">
      <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        <ShieldCheck size={16} className="text-green-500" /> 100% HIPAA SECURE
      </div>
      <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        <Lock size={16} className="text-alloro-orange" /> AES-256 ENCRYPTED
      </div>
    </div>
  </div>

  <label className="w-full md:w-[400px] h-[300px] border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 flex flex-col items-center justify-center cursor-pointer hover:border-alloro-orange hover:bg-white transition-all group/upload shrink-0 relative z-10">
    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-premium border border-black/5 mb-5 group-hover/upload:scale-110 group-hover/upload:text-alloro-orange transition-all">
      <Upload size={28} />
    </div>
    <span className="text-base font-black text-alloro-navy font-heading">
      Drop Revenue CSV Export
    </span>
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3">
      Max Ingestion: 50MB
    </span>
    <input
      type="file"
      className="hidden"
      accept=".csv"
      onChange={handleFileUpload}
    />
  </label>
</section>
```

---

## Phase 5: Rankings Dashboard Reskin

### File: `../signalsai/src/components/dashboard/RankingsDashboard.tsx`

### 5.1 KPICard Component

```tsx
const KPICard = ({
  label,
  value,
  sub,
  trend,
  dir,
  rating,
  suffix,
  warning,
}: any) => (
  <div className="bg-white border border-black/5 rounded-2xl p-8 shadow-premium flex flex-col transition-all hover:shadow-2xl hover:-translate-y-1 group">
    <div className="flex justify-between items-start mb-8">
      <span className="text-[10px] font-black text-alloro-textDark/30 uppercase tracking-[0.25em] leading-none">
        {label}
      </span>
      {trend && (
        <span
          className={`text-[10px] font-black px-2.5 py-1 rounded-lg border tabular-nums leading-none ${
            dir === "up"
              ? "bg-green-50 text-green-700 border-green-100"
              : dir === "down"
              ? "bg-red-50 text-red-700 border-red-100"
              : "bg-slate-50 text-slate-600 border-slate-200"
          }`}
        >
          {dir === "up" && "+"}
          {trend}
        </span>
      )}
    </div>

    <div className="flex items-baseline gap-1 mb-2">
      <span className="text-4xl lg:text-5xl font-black font-sans text-alloro-navy tracking-tighter leading-none tabular-nums group-hover:text-alloro-orange transition-colors">
        {value}
      </span>
      {suffix && (
        <span className="text-base font-black text-slate-300 ml-1">
          {suffix}
        </span>
      )}
      {rating && (
        <Star size={20} className="text-amber-500 fill-amber-500 ml-2 mb-1.5" />
      )}
      {warning && (
        <AlertTriangle
          size={20}
          className="text-alloro-orange ml-2 mb-1.5 animate-pulse"
        />
      )}
    </div>

    <div className="mt-auto text-[13px] font-bold text-slate-500 leading-tight tracking-tight pt-4">
      {sub}
    </div>
  </div>
);
```

### 5.2 Location Cards Pattern

```tsx
<section className="grid grid-cols-1 md:grid-cols-2 gap-8">
  {locations.map((loc) => (
    <div
      key={loc.id}
      onClick={() => setSelectedLocation(loc.id)}
      className={`p-10 rounded-3xl border-2 cursor-pointer transition-all duration-500 relative group overflow-hidden ${
        selectedLocation === loc.id
          ? "bg-white border-alloro-orange shadow-premium"
          : "bg-white/60 border-black/5 hover:border-slate-300 shadow-inner-soft"
      }`}
    >
      <div className="flex justify-between items-start mb-10">
        <div className="flex gap-6">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
              selectedLocation === loc.id
                ? "bg-alloro-orange text-white shadow-xl rotate-3"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            <Building2 size={28} />
          </div>
          <div className="text-left">
            <h3 className="text-2xl font-black font-heading text-alloro-navy tracking-tight mb-1">
              {loc.name}
            </h3>
            <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
              <MapPin size={12} className="text-alloro-orange" /> {loc.city}
            </div>
          </div>
        </div>
        {selectedLocation === loc.id && (
          <CheckCircle2
            className="text-alloro-orange shrink-0 animate-in zoom-in duration-300"
            size={28}
          />
        )}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-50/50 rounded-2xl p-5 text-center border border-black/5 group-hover:bg-white transition-colors">
          <p className="text-2xl font-black font-heading text-alloro-navy leading-none mb-2 font-sans">
            {loc.rank}
          </p>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
            Market Rank
          </p>
        </div>
        {/* More stat cards */}
      </div>
    </div>
  ))}
</section>
```

### 5.3 Competitive Matrix Table Pattern

```tsx
<section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden">
  <div className="px-10 py-8 border-b border-black/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
    <div className="text-left">
      <h2 className="text-xl font-black font-heading text-alloro-navy tracking-tight">
        Competitive Matrix (L30)
      </h2>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
        Benchmarked against market leaders
      </p>
    </div>
    <div className="bg-slate-50 px-6 py-3 rounded-2xl border border-black/5 text-[10px] font-black text-alloro-orange uppercase tracking-widest animate-pulse">
      Live Surveillance Mode
    </div>
  </div>
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse table-fixed">
      <thead className="bg-slate-50/50 text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.25em] border-b border-black/5">
        <tr>
          <th className="px-10 py-5 w-[40%]">Practice Entity</th>
          <th className="px-4 py-5 text-center w-[15%]">Rank</th>
          <th className="px-4 py-5 text-center w-[20%]">Total Reviews</th>
          <th className="px-10 py-5 text-right w-[25%]">Mthly Velocity</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {competitors.map((comp, idx) => (
          <tr
            key={idx}
            className={`${
              comp.isUser ? "bg-alloro-orange/[0.03]" : "hover:bg-slate-50/30"
            } transition-all group`}
          >
            <td className="px-10 py-7 text-left">
              <div className="flex flex-col">
                <span
                  className={`text-[16px] font-black tracking-tight ${
                    comp.isUser ? "text-alloro-orange" : "text-alloro-navy"
                  }`}
                >
                  {comp.name}
                </span>
                {comp.isUser ? (
                  <span className="text-[9px] font-black bg-alloro-orange text-white px-2 py-0.5 rounded uppercase tracking-widest w-fit mt-1.5 leading-none">
                    Your Identity
                  </span>
                ) : (
                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest w-fit mt-1.5 leading-none">
                    Local Competitor
                  </span>
                )}
              </div>
            </td>
            <td className="px-4 py-7 text-center">
              <span
                className={`text-2xl font-black font-heading tabular-nums ${
                  comp.rank <= 3 ? "text-alloro-orange" : "text-slate-300"
                }`}
              >
                #{comp.rank}
              </span>
            </td>
            <td className="px-4 py-7 text-center font-black text-alloro-navy tabular-nums font-sans text-lg">
              {comp.reviews.toLocaleString()}
            </td>
            <td className="px-10 py-7 text-right">
              <div className="flex items-center justify-end gap-2 text-green-600 font-black text-lg font-sans">
                {comp.monthly}
                <ArrowUpRight size={18} className="opacity-40" />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</section>
```

---

## Phase 6: Tasks View Reskin

### File: `../signalsai/src/components/tasks/TasksView.tsx`

### 6.1 TaskCard Component

```tsx
interface TaskCardProps {
  task: Task;
  isReadOnly: boolean;
  onToggle?: () => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, isReadOnly, onToggle }) => {
  const [showHelp, setShowHelp] = useState(false);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const isDone = task.status === "Done";

  const handleHelpSubmit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!comment.trim()) return;
    setSent(true);
    setTimeout(() => {
      setShowHelp(false);
      setComment("");
      setSent(false);
    }, 1500);
  };

  return (
    <div
      onClick={!isReadOnly ? onToggle : undefined}
      className={`
        group relative bg-white rounded-3xl p-8 border transition-all duration-500 select-none text-left
        ${
          isDone
            ? "border-green-100 bg-green-50/20 opacity-60 shadow-none"
            : "border-black/5 shadow-premium hover:shadow-2xl hover:border-alloro-orange/20 hover:-translate-y-1"
        }
        ${!isReadOnly ? "cursor-pointer active:scale-[0.98]" : ""}
      `}
    >
      <div className="flex flex-row gap-8 items-start">
        <div className="shrink-0 mt-1">
          {isDone ? (
            <div className="w-8 h-8 rounded-xl bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-500/20">
              <CheckSquare size={20} />
            </div>
          ) : (
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all duration-300 ${
                isReadOnly
                  ? "bg-alloro-navy/5 text-alloro-navy border-transparent"
                  : "bg-white border-slate-200 group-hover:border-alloro-orange group-hover:bg-alloro-orange/5 text-slate-200 group-hover:text-alloro-orange"
              }`}
            >
              {isReadOnly ? <Zap size={18} /> : <Square size={18} />}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <h3
                className={`font-black text-xl text-alloro-navy font-heading tracking-tight leading-tight transition-all ${
                  isDone ? "line-through opacity-30" : ""
                }`}
              >
                {task.title}
              </h3>
              {task.priority === "High" && !isDone && (
                <span className="px-3 py-1 bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-100 leading-none">
                  Priority Alpha
                </span>
              )}
            </div>
            {!isDone && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHelp(!showHelp);
                }}
                className={`p-2 rounded-xl transition-all duration-300 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${
                  showHelp
                    ? "bg-alloro-orange text-white"
                    : "bg-alloro-bg text-slate-400 hover:text-alloro-orange hover:bg-alloro-orange/5"
                }`}
              >
                <HelpCircle size={14} /> {showHelp ? "Close" : "Ask Question"}
              </button>
            )}
          </div>

          {showHelp ? (
            <div
              className="animate-in fade-in slide-in-from-top-2 duration-300 py-4 space-y-4 border-t border-black/5 mt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative">
                <textarea
                  autoFocus
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="e.g. Where should I place the QR code?"
                  className="w-full h-24 bg-alloro-bg border border-black/5 rounded-2xl px-5 py-4 text-alloro-navy font-bold text-sm focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all resize-none"
                />
                <button
                  onClick={handleHelpSubmit}
                  disabled={!comment.trim() || sent}
                  className="absolute bottom-4 right-4 p-2.5 bg-alloro-navy text-white rounded-xl shadow-lg hover:bg-black transition-all active:scale-95 disabled:opacity-30"
                >
                  {sent ? <CheckCircle2 size={16} /> : <Send size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">
                Your strategist will receive this inquiry immediately.
              </p>
            </div>
          ) : (
            <>
              <p
                className={`text-[16px] leading-relaxed font-bold tracking-tight transition-all ${
                  isDone ? "opacity-30" : "text-slate-500"
                }`}
              >
                {task.description}
              </p>

              <div className="flex flex-wrap items-center gap-x-10 gap-y-3 pt-6 border-t border-black/5 text-[10px] font-black text-alloro-textDark/30 uppercase tracking-[0.2em]">
                <span className="flex items-center gap-2.5">
                  <Clock size={16} className="text-alloro-orange/40" />{" "}
                  {isDone
                    ? `Verified: ${task.completedDate}`
                    : `Due: ${task.dueDate}`}
                </span>
                <span className="flex items-center gap-2.5">
                  <Users size={16} className="text-alloro-orange/40" />{" "}
                  {task.assignee}
                </span>
                <div className="flex items-center gap-2">
                  <Layout size={14} className="opacity-40" />
                  <span className="text-slate-500">
                    {task.category} Coordinator Hub
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
```

### 6.2 Sprint Progress Monitor

```tsx
<section className="bg-white rounded-[2.5rem] border border-black/5 p-10 lg:p-16 shadow-premium relative overflow-hidden group">
  <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-alloro-orange/[0.03] rounded-full blur-[120px] -mr-40 -mt-40 pointer-events-none group-hover:bg-alloro-orange/[0.06] transition-all duration-700"></div>

  <div className="relative z-10 flex flex-col md:flex-row items-center gap-12 lg:gap-20">
    <div className="w-40 h-40 rounded-full border-[12px] border-slate-50 flex items-center justify-center text-4xl font-black font-heading text-alloro-navy relative shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-700">
      <svg className="absolute inset-0 w-full h-full -rotate-90">
        <circle
          cx="50%"
          cy="50%"
          r="42%"
          stroke="currentColor"
          strokeWidth="12"
          fill="transparent"
          className="text-slate-50"
        />
        <circle
          cx="50%"
          cy="50%"
          r="42%"
          stroke="currentColor"
          strokeWidth="12"
          fill="transparent"
          strokeDasharray="264"
          strokeDashoffset={264 - (264 * completionPct) / 100}
          strokeLinecap="round"
          className="text-alloro-orange transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(214,104,83,0.3)]"
        />
      </svg>
      <span className="font-sans tabular-nums">{completionPct}%</span>
    </div>
    <div className="flex-1 space-y-4 text-center md:text-left">
      <h2 className="text-3xl lg:text-4xl font-black font-heading text-alloro-navy tracking-tighter leading-none">
        Sprint Integrity Monitor
      </h2>
      <p className="text-lg lg:text-xl text-slate-500 font-medium tracking-tight leading-relaxed max-w-lg">
        You have verified{" "}
        <span className="text-alloro-orange font-black">
          {completedTasks} of {totalTasks} tactical directives
        </span>{" "}
        in the current window.
      </p>
    </div>
    <div className="grid grid-cols-2 gap-6 shrink-0 w-full md:w-auto">
      <div className="bg-slate-50/80 rounded-3xl p-8 border border-black/5 text-center min-w-[120px] group-hover:bg-white transition-colors duration-500">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 leading-none">
          System
        </p>
        <p className="text-3xl font-black font-heading text-alloro-navy leading-none font-sans">
          {alloroTaskCount}
        </p>
      </div>
      <div className="bg-slate-50/80 rounded-3xl p-8 border border-black/5 text-center min-w-[120px] group-hover:bg-white transition-colors duration-500">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 leading-none">
          Manual
        </p>
        <p className="text-3xl font-black font-heading text-alloro-navy leading-none font-sans">
          {userTaskCount}
        </p>
      </div>
    </div>
  </div>
</section>
```

### 6.3 Add Task Button Pattern

```tsx
<button className="w-full py-16 sm:py-20 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-6 text-slate-400 font-black uppercase tracking-[0.4em] text-[10px] hover:border-alloro-orange hover:text-alloro-orange hover:bg-white transition-all group shadow-inner-soft active:scale-[0.99]">
  <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:shadow-premium transition-all">
    <Plus size={28} />
  </div>
  Initialize Manual Task
</button>
```

---

## Phase 7: Notifications Page Reskin

### File: `../signalsai/src/pages/Notifications.tsx`

**Full Component Reference** (copy and adapt):

```tsx
import React from "react";
import {
  Bell,
  Zap,
  AlertCircle,
  Clock,
  Trash2,
  CheckCircle2,
  ChevronRight,
  Activity,
  ShieldCheck,
  Lock,
} from "lucide-react";

const Notifications = () => {
  // Keep existing data fetching logic
  const { notifications, isLoading, markAsRead } = useNotifications(); // your existing hook

  if (isLoading) {
    return <NotificationsSkeleton />;
  }

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      <div className="max-w-[1400px] mx-auto relative flex flex-col">
        <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
          <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
                <Bell size={20} />
              </div>
              <div className="flex flex-col text-left">
                <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
                  Intelligence Signals
                </h1>
                <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
                  Real-time Practice Surveillance
                </span>
              </div>
            </div>
            <button className="flex items-center gap-2.5 text-[10px] font-black text-slate-400 hover:text-alloro-orange uppercase tracking-[0.2em] transition-all group">
              <Trash2 size={16} className="group-hover:rotate-12" /> Clear Feed
              Matrix
            </button>
          </div>
        </header>

        <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-12 lg:space-y-20 text-left">
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 pt-2">
            <div className="flex items-center gap-4 mb-3">
              <div className="px-3 py-1.5 bg-alloro-orange/5 rounded-lg text-alloro-orange text-[10px] font-black uppercase tracking-widest border border-alloro-orange/10 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-alloro-orange animate-pulse"></span>
                Signals Active
              </div>
            </div>
            <h1 className="text-5xl lg:text-6xl font-black font-heading text-alloro-navy tracking-tight leading-none mb-4">
              Practice Pulse.
            </h1>
            <p className="text-xl lg:text-2xl text-slate-500 font-medium tracking-tight leading-relaxed max-w-4xl">
              Live stream of{" "}
              <span className="text-alloro-orange underline underline-offset-8 font-black">
                Clinical & Operational Events
              </span>{" "}
              that require your leadership attention.
            </p>
          </section>

          {/* Notification Cards */}
          <section className="bg-white rounded-[2.5rem] border border-black/5 shadow-premium overflow-hidden">
            <div className="divide-y divide-black/5">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="p-10 lg:p-14 hover:bg-slate-50/40 transition-all flex flex-col sm:flex-row gap-10 group cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-alloro-orange opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-500 group-hover:scale-110 shadow-sm ${
                      notif.type === "success"
                        ? "bg-green-50 text-green-600 border-green-100"
                        : notif.type === "warning"
                        ? "bg-amber-50 text-amber-600 border-amber-100"
                        : "bg-red-50 text-red-600 border-red-100"
                    }`}
                  >
                    {notif.type === "success" ? (
                      <CheckCircle2 size={28} />
                    ) : notif.type === "warning" ? (
                      <Zap size={28} />
                    ) : (
                      <AlertCircle size={28} />
                    )}
                  </div>

                  <div className="flex-1 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <h3 className="text-2xl font-black text-alloro-navy font-heading tracking-tight leading-none group-hover:text-alloro-orange transition-colors">
                        {notif.title}
                      </h3>
                      <span
                        className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border shrink-0 w-fit shadow-sm ${
                          notif.impact?.includes("Critical")
                            ? "bg-red-50 text-red-600 border-red-100"
                            : notif.impact?.includes("High")
                            ? "bg-amber-50 text-amber-600 border-amber-100"
                            : "bg-white text-alloro-navy border-black/5"
                        }`}
                      >
                        {notif.impact || "System Update"}
                      </span>
                    </div>
                    <p className="text-lg lg:text-xl text-slate-500 font-medium leading-relaxed tracking-tight max-w-4xl">
                      {notif.description}
                    </p>
                    <div className="flex items-center justify-between pt-6 border-t border-black/[0.03]">
                      <div className="flex items-center gap-8 text-[11px] font-black text-slate-300 uppercase tracking-[0.2em]">
                        <span className="flex items-center gap-2.5">
                          <Clock size={18} className="text-alloro-orange/30" />{" "}
                          {notif.time}
                        </span>
                        <button
                          onClick={() => markAsRead(notif.id)}
                          className="text-alloro-navy hover:text-alloro-orange transition-colors"
                        >
                          Mark as Resolved
                        </button>
                      </div>
                      <div className="w-10 h-10 rounded-full border border-black/5 flex items-center justify-center text-slate-200 group-hover:text-alloro-orange group-hover:border-alloro-orange/20 transition-all group-hover:translate-x-2">
                        <ChevronRight size={20} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Signal Surveillance Footer */}
          <section className="p-12 lg:p-20 bg-alloro-navy rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col items-center text-center space-y-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-80 bg-alloro-orange/5 rounded-full -mr-40 -mt-40 blur-[120px] pointer-events-none group-hover:bg-alloro-orange/10 transition-all duration-700"></div>

            <div className="w-20 h-20 bg-white/10 text-white rounded-[1.5rem] flex items-center justify-center border border-white/10 shadow-2xl relative z-10">
              <ShieldCheck size={40} className="text-white/60" />
            </div>
            <div className="space-y-4 relative z-10">
              <h4 className="text-2xl font-black font-heading text-white tracking-tight">
                Signal Surveillance Active
              </h4>
              <p className="text-blue-100/40 font-bold text-lg max-w-lg leading-relaxed tracking-tight">
                Alloro AI is continuously processing clinical health signals
                across your entire digital and practice footprint.
              </p>
            </div>
            <div className="flex items-center gap-12 pt-6 relative z-10">
              <div className="flex items-center gap-3 text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
                <Lock size={16} /> SOC2 SECURE
              </div>
              <div className="flex items-center gap-3 text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
                <Activity size={16} /> LIVE DATASTREAM
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Notifications;
```

---

## Phase 8: Settings Page Reskin

### File: `../signalsai/src/pages/Settings.tsx`

Apply the same header and page structure patterns. Use form input patterns from Appendix D.

---

## Phase 9: Create Profile Page

### New File: `../signalsai/src/pages/Profile.tsx`

Create a new page with user profile information using existing `useAuth` context data. Include:

- Profile avatar section
- Account information form
- Security settings section

Add route in App.tsx: `/profile`

---

## Phase 10: Create Help Page

### New File: `../signalsai/src/pages/Help.tsx`

Create a help center page with:

- Search functionality
- Quick action cards (Documentation, Video Tutorials, Live Chat)
- FAQ section
- Contact CTA footer

Add route in App.tsx: `/help`

---

## Phase 11: Sign In Page Reskin

### File: `../signalsai/src/pages/Signin.tsx`

Update logo to use `bg-alloro-orange` and buttons to use orange accent.

---

## Phase 12: PageWrapper & Layout Updates

### File: `../signalsai/src/components/PageWrapper.tsx`

Add mobile header with hamburger menu, profile, and notification buttons.

---

## Phase 13: Admin Pages Basic Reskin

Replace all `alloro-cobalt` → `alloro-orange` and `bg-blue-*` → orange variants.

---

## Appendix A: Reusable Component Library

Create `../signalsai/src/components/ui/DesignSystem.tsx` with:

- IntelligencePulse
- MetricCard
- CompactTag
- SectionHeader
- PageHeader
- StatusPill

---

## Appendix B: Animation Patterns

Add CSS animations for:

- `animate-in`, `fade-in`, `slide-in-from-bottom-*`
- Framer Motion variants if using framer-motion

---

## Appendix C: Skeleton Loader Patterns

Create `../signalsai/src/components/ui/Skeletons.tsx` with:

- MetricCardSkeleton
- TableRowSkeleton
- TaskCardSkeleton
- NotificationSkeleton
- ChartSkeleton
- PageSkeleton

---

## Appendix D: Form Input Patterns

### Standard Input

```tsx
<input className="w-full pl-12 pr-4 py-4 bg-alloro-bg border border-black/5 rounded-2xl text-alloro-navy font-bold focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all" />
```

### Textarea

```tsx
<textarea className="w-full h-32 bg-alloro-bg border border-black/5 rounded-2xl px-5 py-4 text-alloro-navy font-bold text-sm focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all resize-none" />
```

---

## Appendix E: Modal/Dialog Patterns

Create `../signalsai/src/components/ui/Modal.tsx` with:

- Modal component with backdrop blur
- ConfirmDialog for logout, delete actions

---

## Critical Preservation List

**DO NOT MODIFY** these aspects:

1. All API calls and data fetching logic
2. React hooks and context providers
3. Authentication flow
4. React Router structure (only add new routes)
5. TypeScript interfaces
6. Form submission handlers
7. Event handlers with business logic

---

## Quick Reference: Color Replacements

```
alloro-cobalt → alloro-orange
bg-blue-600 → bg-alloro-orange
text-blue-600 → text-alloro-orange
border-blue-500 → border-alloro-orange
focus:ring-blue-500 → focus:ring-alloro-orange
```

## Quick Reference: New Classes

```
shadow-premium
shadow-soft-glow
shadow-inner-soft
glass-header
skeleton-shimmer
rounded-3xl / rounded-2xl
tracking-[0.2em] to tracking-[0.4em]
```

---

## Implementation Order

1. Phase 1: Global styles
2. Phase 2: Sidebar
3. Phase 12: PageWrapper
4. Appendix A: Reusable components
5. Appendix C: Skeleton loaders
6. Phase 3-13: Individual pages
7. Final testing
