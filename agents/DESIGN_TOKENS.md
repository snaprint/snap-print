# Design tokens (R-2)

**For:** BE (B-18, email templates) and anyone styling something outside `src/css/`.
**Direction:** B0 "Layer Lines", approved by the owner 2026-11-17 (`agents/design/README.md`).
Emails can't load the site's CSS or web fonts reliably, so everything below is a plain value with a safe fallback. Use inline styles and tables in emails.

## Colours

| Token | Hex | Use |
|---|---|---|
| `bg` | `#F2F1EC` | page / email background (off-white) |
| `surface` | `#FFFFFF` | cards, panels, inputs |
| `ink` | `#0E0E0C` | text, borders, primary buttons, footer |
| `ink-2` | `#4A4944` | secondary text |
| `ink-3` | `#6F6D66` | muted text, labels (darker than the mockup's `#85837B` so small text passes WCAG AA on `bg`) |
| `line` | `#0E0E0C` | outlines (1.5 px, same as ink) |
| `line-soft` | `#D8D6CE` | hairlines inside cards (table rows, dividers) |
| `orange` | `#FF5B14` | the one accent: main call to action ("Shop now", "Buy it now", "Pay"), cart badge, ticker dots. Text **on** orange is ink `#0E0E0C` (not white: white on this orange fails contrast) |
| `lime` | `#D9F24F` | highlight: discount tags, the active bulk tier, a highlighted word in a heading. Text on lime is ink |
| `success` | `#1F7A4A` on `#E3F2E8` | paid / delivered / in stock |
| `warning` | `#8A5A00` on `#FBF0D2` | processing, notes |
| `danger` | `#B3261E` on `#FCE8E6` | errors, cancellation |

## Type

| Role | Web font | Email-safe fallback | Style |
|---|---|---|---|
| Headings, prices, buttons | Space Grotesk 700 | `'Space Grotesk', Arial, Helvetica, sans-serif` | tight letter-spacing (−0.02 to −0.03 em), line-height 1.05 |
| Body | Inter 400/500/600 | `Inter, Arial, Helvetica, sans-serif` | 16 px, line-height 1.55 |
| Labels | JetBrains Mono 500 | `'JetBrains Mono', 'Courier New', monospace` | 12 px, UPPERCASE, letter-spacing 0.02 em, e.g. `ORDER #`, `ITEMS`, `TOTAL` |

Google Fonts URL (if the email client allows it; Gmail mostly ignores it, so the fallback must look fine):
`https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@500&family=Inter:wght@400;500;600&display=swap`

## Shape

- Corner radius **4 px** everywhere (buttons, cards, inputs, images). Pills (`999px`) only for small chips/badges.
- Borders **1.5 px solid #0E0E0C** around cards, buttons, images and tables. Hairlines inside use `#D8D6CE` 1 px.
- Buttons: 48–50 px tall, padding 0 22 px, Space Grotesk 700 15 px, 1.5 px ink border, 4 px radius, **offset shadow `3px 3px 0 #0E0E0C`** (no blur). In email, if `box-shadow` is stripped, the border alone is fine.
  - Primary (main action): background `#FF5B14`, text `#0E0E0C`.
  - Dark: background `#0E0E0C`, text `#F2F1EC`, shadow `3px 3px 0 #FF5B14`.
  - Secondary: background `#FFFFFF`, text `#0E0E0C`.
- No gradients, blur or soft drop shadows.

## Logo

Wordmark: **SNAP PRINT** in Space Grotesk 700, preceded by a small "layer lines" mark (3 horizontal ink bars, 20 × 14 px). Absolute URL for emails: `https://snaprint.in/favicon.svg` (SVG; many email clients block SVG, so in email use the text wordmark styled as above, optionally with `▤` or no mark).

## Email layout suggestion (B-18)

- Outer background `#F2F1EC`; a 600 px white card with a 1.5 px ink border and 4 px radius.
- Header: wordmark left, a mono label right (`ORDER CONFIRMED`), separated from the body by a 1.5 px ink rule.
- Item table: mono uppercase header row on `#F2F1EC`, rows separated by `#D8D6CE` hairlines, prices in Space Grotesk 700.
- Totals: one row with a lime (`#D9F24F`) background for the grand total.
- One primary button (orange) per email at most, e.g. "Track your order".
- Footer: ink background, `#F2F1EC` text, mono labels.
