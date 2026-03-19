# Study Heatmap (Quiz-Style) Style Guide

## Design Goals
- Match quiz UI conventions: rounded cards, soft borders, compact typography, clear hierarchy.
- Keep interactions lightweight: hover feedback, accessible focus states, fast rendering.

## Color Tokens
Heat levels use a single blue hue family with increasing opacity.

- Level 0 (none): `transparent` (border uses `var(--border-subtle)`)
- Level 1 (low): `rgba(96, 165, 250, 0.18)`
- Level 2 (medium): `rgba(96, 165, 250, 0.35)`
- Level 3 (high): `rgba(59, 130, 246, 0.55)`
- Level 4 (max): `rgba(37, 99, 235, 0.85)`

Borders follow the same level scale:

- Level 1: `rgba(96, 165, 250, 0.35)`
- Level 2: `rgba(96, 165, 250, 0.55)`
- Level 3: `rgba(59, 130, 246, 0.75)`
- Level 4: `rgba(37, 99, 235, 0.95)`

## Spacing & Layout
- Wrapper card: `rounded-2xl`, `border border-[var(--border-subtle)]`, `p-4`
- Grid gap: `3px`
- Cell radius: `6px`
- Responsive cell size: `--hm-cell` clamps to `8px…16px` based on available width
- Month labels: `text-[10px] font-semibold` with `#93C5FD`

## Interaction Patterns
- Cells are buttons with `role="gridcell"` for keyboard navigation and screen readers.
- Hover feedback: translate up by `1px` (visual lift).
- Focus state: `focus-visible:ring-2 focus-visible:ring-blue-400/70`
- Selection: blue halo `box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35)`
- Tooltip: anchored above the hovered/focused cell; shows date + study metrics.
- Drill-down: clicking a cell toggles a details panel; `Escape` closes.

## Animation Timings
- Hover transition: `150ms` (`transition-[transform,box-shadow] duration-150`)
- Drill-down panel: `200ms` fade/slide (`framer-motion` duration `0.2`)
