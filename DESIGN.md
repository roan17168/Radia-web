# Radia — design contract

A field instrument for meeting people in physical space. Calm, tactile, legible
outdoors. It should feel like a well-made object: paper, ink, brass. Not a
dashboard, not a game HUD, not a glassmorphic AI demo.

## Direction

**Field instrument.** One map, one radius, one action at a time. Content is
quiet; the map carries the colour. Chrome recedes until touched.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#111A17` | primary text, icon strokes |
| `--ink-2` | `#3A4742` | secondary text |
| `--ink-3` | `#6C7A73` | meta, captions |
| `--paper` | `#F1F0EA` | app background |
| `--surface` | `#FCFBF7` | cards, sheets |
| `--line` | `#DEDCD2` | hairlines, dividers |
| `--pine` | `#0B4F3F` | primary action, active state |
| `--pine-soft` | `#E3EBE4` | primary tint |
| `--ember` | `#C2552A` | reward, achievement, alert |
| `--ember-soft` | `#F6E7DD` | reward tint |

Dark mode is the same object at night: `--paper #0D1512`, `--surface #131D19`,
`--line #26332D`, text `#EDEFE9`. Never invert to blue-grey.

Rules:
- Colour is earned. The map is the only saturated surface on a default screen.
- No gradients as decoration. One exception: a 2-stop wash on the map edge.
- No glass blur on primary surfaces; blur is for transient overlays only.

## Type

- Display: **Newsreader** (400/500) — section titles, empty-state headlines.
  Sentence case. Never italic as decoration.
- UI: **Instrument Sans** (400/500/600) — body, labels, controls.
- Numerals: **JetBrains Mono** (500) — distances, credits, coordinates only.

Scale: 11 / 12.5 / 14 / 17 / 22 / 30. Headings tighten (`-0.02em`), body does
not. All-caps eyebrows are allowed once per screen, at 10px, `0.12em` tracking.

## Shape & depth

- Radii: 10 (controls), 16 (cards), 22 (sheets), full only for dots and avatars.
- Borders: 1px `--line` on every card. A card without a border must have a
  shadow; never both heavy.
- Shadows: two layers, low opacity, no colour glow.

## Motion

- Enter: 180ms `cubic-bezier(.2,.8,.2,1)`, 8px rise + fade.
- Press: scale 0.98, 120ms.
- Sheets: 240ms, translateY(12px) + fade.
- Nothing loops infinitely except the map's own tile fades and the user's
  sonar ring, which communicates a live radius.
- Respect `prefers-reduced-motion`: no transforms, fades only.

## Components

- **Primary button**: pine fill, paper text, 10px radius, 38px min height.
- **Secondary**: transparent, 1px line, ink text.
- **Chip**: 30px, line border, no blur, 12px text.
- **Card**: surface, 1px line, 16px radius, 16–20px padding.
- **Dock**: floating, surface, 1px line, 4 items, active item = pine soft pill
  with pine icon and 600 weight label.
- **Input**: surface fill, 1px line, focus = 2px pine ring at 18% opacity.

## Banned tells

- Beige-on-beige "AI warm" palettes with dusty rose gradients.
- Italic serif accents and oversized quote marks.
- Pulsing dots for plain status (a static ring is honest).
- Side-tab tutorial layouts.
- Emoji as product iconography.
- Glassmorphic cards with 30px blur and white 10% overlays.
- Every section wrapped in a `rounded-3xl` card with a gradient border.
- Empty states that fill the space with fabricated content.
