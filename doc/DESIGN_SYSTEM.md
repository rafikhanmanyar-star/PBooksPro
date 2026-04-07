# PBooks Pro — UI Design System

Enterprise ERP design tokens for the Electron app. **Source of truth:** `styles/design-tokens.css` (CSS variables). Tailwind extensions: `tailwind.config.js`.

## Principles

- **Consistency:** Prefer semantic tokens (`--color-primary`, `--space-md`) over raw hex in components.
- **ERP-first:** Compact body (14px), tabular numbers on numeric columns, readable tables.
- **Themes:** Light/dark via `document.documentElement` `data-theme="light"` | `"dark"` (see `context/ThemeContext.tsx`).

---

## 1. Color

### Brand & semantic

| Token | Light (typical) | Usage |
|--------|------------------|--------|
| `--color-primary` | `#2563eb` | Primary actions, links, focus accent |
| `--color-success` | `#16a34a` | Success, positive amounts (optional) |
| `--color-warning` | `#f59e0b` | Warnings |
| `--color-danger` | `#dc2626` | Errors, destructive actions |

### Surfaces & text (light)

| Token | Value |
|--------|--------|
| `--surface-primary` | `#ffffff` |
| `--surface-secondary` | `#f8fafc` |
| `--text-primary` | `#0f172a` |
| `--text-secondary` | `#475569` |
| `--border-color` | `#e2e8f0` |

### Dark theme

Overridden under `[data-theme="dark"]` (e.g. `--surface-primary: #1e293b`, `--text-primary: #f1f5f9`, `--border-color: #334155`).

### App shell aliases

`--bg-primary`, `--card-bg`, `--header-bg`, `--app-*` Tailwind colors map to these variables for layout and legacy screens.

---

## 2. Typography

- **Font:** `--font-sans` → Inter, system-ui stack (see `design-tokens.css`).
- **Scale:**

| Role | Variable | Size |
|------|-----------|------|
| H1 | `--text-h1-size` | 24px |
| H2 | `--text-h2-size` | 20px |
| H3 | `--text-h3-size` | 18px |
| Body | `--text-body-size` | 14px |
| Small | `--text-small-size` | 12px |

Tailwind: `text-ds-h1`, `text-ds-body`, `text-ds-small`, etc.

**Numbers:** Use `tabular-nums` (or `.ds-table .ds-num`) for aligned accounting figures.

---

## 3. Spacing (4px grid)

| Token | Value |
|--------|--------|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 12px |
| `--space-lg` | 16px |
| `--space-xl` | 24px |
| `--space-xxl` | 32px |

Tailwind: `p-ds-md`, `gap-ds-lg`, `m-ds-xl`, …

---

## 4. Radius & shadow

| Token | Value |
|--------|--------|
| `--radius-sm` | 4px |
| `--radius-md` | 8px |
| `--radius-lg` | 12px |

| Token | Usage |
|--------|--------|
| `--shadow-card` | Cards, panels |
| `--shadow-modal` | Modals, dialogs |

Tailwind: `rounded-ds-md`, `shadow-ds-card`, `shadow-ds-modal`.

---

## 5. Layout

- **Sidebar:** `--sidebar-width` (default 16rem), `.sidebar-desktop-width`, `.main-content-offset`.
- **Content:** `.layout-content-area`, `.container-responsive`.
- **Viewport:** Compact desktop tweaks via `data-viewport-compact` (existing).

---

## 6. Components

### Buttons (`components/ui/Button.tsx`)

Variants: **primary** (brand blue), **secondary**, **danger**, **ghost**, **outline**. All use design tokens for hover/focus/disabled.

### Inputs (`components/ui/Input.tsx`)

- Standard: label, field, helper text.
- Optional `error` prop: error message + `aria-invalid` + `.ds-input-error`.
- Focus ring uses `--color-primary`.

### Tables

Utility classes:

- **`.ds-table-wrap`** — scroll + border + card shadow.
- **`.ds-table`** — full width, sticky header row (`thead th`), row hover, optional **`.ds-table-row-stripe`** on `tr` for zebra.
- **`.ds-num`** — right-aligned numeric cells.

### Cards

- **`.ds-card`** — bordered, padded summary/dashboard blocks.

### Modals

- `components/ui/Modal.tsx` uses `--modal-bg`, `--shadow-modal`, `--border-color`.

---

## 7. Interaction & accessibility

- **Focus:** `focus-visible` on buttons; inputs use ring derived from `--color-primary` or `--color-danger` when in error.
- **Contrast:** Text pairs use `--text-primary` / `--text-secondary` on `--surface-*`; dark theme tokens chosen for readability.
- **Motion:** Respect `prefers-reduced-motion` (existing animations).

---

## 8. Icons

Use inline SVG or shared icons from `constants` / UI; stroke `currentColor` inherits `text-*` tokens.

---

## 9. TypeScript

`design-system/tokens.ts` exports `cssVar` for inline `style={}` when needed; prefer Tailwind classes wired to variables.

---

## 10. Migration note

Existing screens may still use Tailwind `slate-*` / `gray-*`. Global `[data-theme="dark"]` mappings in `index.css` map many of those utilities to CSS variables. New features should use **`ds-*` utilities** and **`.ds-*` classes** directly.

---

## 11. Smoke testing

**Automated**

```bash
npm run smoke:design-system
```

Includes file/token checks. For the same checks plus `vite build`:

```bash
npm run smoke:design-system:full
```

**Manual** (after `npm run dev` or `npm run test:local-only`)

1. Header moon/sun toggles light/dark; UI stays readable.
2. Reload app — theme persists (`localStorage` key `theme`).
3. Settings → Preferences → General → Appearance — matches header.
4. Open Search (⌘K / header search) — modal readable in both themes.
5. General Ledger or any large table — borders and rows visible in dark mode.
6. Optional: any screen using `<Input error="…" />` — red border and message.
