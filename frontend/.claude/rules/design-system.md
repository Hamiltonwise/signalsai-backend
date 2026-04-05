# Alloro Design System Rules

> These rules teach Claude Code how to produce premium, warm, $2,000/month UI.
> Read before any visual work. If the output doesn't feel like Oura or Apple Health, it's wrong.

## Design Philosophy

Alloro feels like a private advisor's office. Warm. Calm. Confident. Not a SaaS dashboard.
The customer should feel like someone who knows what they're doing built this for them specifically.

Reference products: Oura Ring app, Apple Health, Wealthfront, Eight Sleep.
NOT: Zendesk, Salesforce, generic admin dashboards.

## Color Tokens

### Backgrounds
- `bg-[#F8F6F2]` -- Page background. Warm off-white. Never pure white.
- `bg-stone-50/80` -- Card background. Subtle warmth.
- `bg-[#F0EDE8]` -- Secondary card / expanded sections.
- `bg-white` -- NEVER on customer pages. Only in modals or overlays.

### Text
- `text-[#1A1D23]` -- Primary text. Always. Never `text-[#212D40]` (navy).
- `text-[#1A1D23]/60` -- Secondary text.
- `text-[#1A1D23]/40` -- Tertiary / caption text.
- `text-gray-400` -- Labels, timestamps.
- `text-gray-500` -- Context text in reading cards.

### Accent
- `text-[#D56753]` -- Terracotta. CTAs, links, active nav. Never body text.
- `bg-[#D56753]` -- Primary buttons only.
- `bg-[#212D40]` -- Action card background only. NEVER text color.

### Status
- `text-emerald-500` / `bg-emerald-500` -- Healthy readings.
- `text-amber-400` / `bg-amber-400` -- Attention readings.
- `text-red-500` / `bg-red-500` -- Critical readings.

## Typography

### Hierarchy
- Page title: `text-2xl font-semibold text-[#1A1D23]`
- Section title: `text-sm font-semibold text-[#1A1D23] uppercase tracking-wider`
- Reading value: `text-2xl font-semibold text-[#1A1D23]`
- Body text: `text-sm text-gray-500`
- Caption/label: `text-xs text-gray-400 font-semibold uppercase tracking-wider`
- Link: `text-xs text-[#D56753] font-semibold hover:underline`

### Rules
- Minimum font: `text-xs` (12px). NEVER `text-[10px]` or `text-[11px]`.
- Maximum weight: `font-semibold`. NEVER `font-bold`, `font-extrabold`, `font-black`.
- No em-dashes anywhere. Use commas or periods.

## Spacing

### Page Layout
- Max content width: `max-w-[800px]`
- Page padding: `px-4 sm:px-6 py-8 sm:py-12`
- Card padding: `p-5 sm:p-6`
- Section gap: `space-y-4`
- Content within card: `space-y-3`

### Generous Whitespace
- Premium products use space as confidence. Cramped layouts feel anxious.
- Reading cards: `p-5 sm:p-6` minimum.
- Between sections: at least `space-y-4`.
- Page top margin: `py-8 sm:py-12`.

## Components

### Card (Section Container)
```
rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden
```

### Collapsible Section Header
```
w-full flex items-center justify-between px-6 py-4 text-left hover:bg-stone-100/50 transition-colors
```

### Primary Button
```
inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D56753] text-white text-sm font-medium hover:brightness-105 transition-all
```

### Reading Status Dot
```
w-3 h-3 rounded-full ring-4 ring-opacity-20
```
With status-specific ring: `ring-emerald-500`, `ring-amber-400`, `ring-red-500`.

### Verify Link
```
inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold hover:underline
```

### Empty State
Always include:
1. What's happening ("Alloro is syncing your reviews")
2. When to expect it ("within 24 hours")
3. What to do if it doesn't work ("contact us through the chat")

### Navigation
- Bottom bar (mobile): `fixed bottom-0 h-16 bg-white border-t border-gray-100`
- Side nav (desktop): `w-48 bg-[#F8F6F2] border-r border-stone-200/60`
- Active state: `bg-[#D56753]/10 text-[#D56753]`
- Inactive state: `text-gray-500 hover:text-[#1A1D23] hover:bg-stone-100/80`

## Animations

- Page entry: `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`
- Transition duration: `duration-500` for page, `transition-colors` for interactive.
- Nothing flashy. Everything unhurried. The card doesn't pop in. It settles.

## Figma Integration

When a Figma design URL is provided:
1. Use `figma-implement-design` skill to read the design
2. Map Figma variables to the tokens above
3. Generate code using existing components (ReadingCard, Section, etc.)
4. Verify the output matches the warm, calm feel

When no Figma design exists:
1. Follow the tokens and component patterns above
2. Reference Oura/Apple Health aesthetic: large numbers, minimal chrome, generous space
3. Every page should pass the "would you show this at a dinner party?" test
