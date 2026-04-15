# Responsive Vocabulary

Standardized Tailwind class ladders for the alloro frontend. **Every new client-facing component must follow this table.** New shared primitives in `src/components/ui/DesignSystem.tsx` must be responsive-by-default.

Default Tailwind v4 breakpoints (no custom config): `sm:640 md:768 lg:1024 xl:1280 2xl:1536`. Test target: iPhone 16 (393px) and 1440px desktop.

## Class ladders

| Concern                       | Mobile (default)        | sm: (640+)         | md: (768+)            | lg: (1024+)            |
| ----------------------------- | ----------------------- | ------------------ | --------------------- | ---------------------- |
| Card padding                  | `p-4`                   | `sm:p-6`           | —                     | `lg:p-8`               |
| Section padding (page-level)  | `px-4 py-6`             | `sm:px-6`          | `md:px-8 md:py-8`     | `lg:px-10 lg:py-10`    |
| Headline (h1)                 | `text-2xl`              | `sm:text-3xl`      | —                     | `lg:text-4xl`          |
| Sub-headline (h2)             | `text-xl`               | `sm:text-2xl`      | —                     | `lg:text-3xl`          |
| Body (lg)                     | `text-base`             | —                  | —                     | `lg:text-lg`           |
| Body (sm)                     | `text-sm`               | —                  | —                     | `lg:text-base`         |
| Card max-width                | `w-full max-w-md`       | `sm:max-w-lg`      | —                     | `lg:max-w-xl`          |
| Layout direction (cards/cols) | `flex-col`              | —                  | `md:flex-row`         | —                      |
| Inter-card gap                | `gap-3`                 | `sm:gap-4`         | —                     | `lg:gap-6`             |
| CTA buttons in narrow cards   | `w-full`                | `sm:w-auto`        | —                     | —                      |

## Rules

1. **No fixed `text-*` without responsive prefix** in client-facing components. `text-3xl` on its own = reject.
2. **No fixed `p-*`/`px-*`/`py-*` larger than `p-6`** without a smaller mobile fallback.
3. **Cards always start with `w-full`** before any `max-w-*`. Otherwise they fail to shrink.
4. **`flex-col md:flex-row`** for any side-by-side card layout. Defaults to stacked on mobile.
5. **Don't introduce new responsive ladders.** Use this table. If a case truly doesn't fit, propose an addition here in the same PR.

## Out of scope for this convention

- Admin pages (`/admin/*`) — different audience, allowed to be desktop-first.
- Email HTML templates — use their own constraints.
- Map widgets, charts, embeds — must be wrapped in a responsive parent but their internals are exempt.
