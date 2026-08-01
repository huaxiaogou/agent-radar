# Agent Radar design system

> Global source of truth. Page overrides live in `pages/` and win only where explicit.

**Product:** personal AI Coding / Agent technology intelligence radar  
**Audience:** experienced builders scanning the field in a ten-minute daily session  
**Primary job:** reveal what changed, why it matters, and how strong the evidence is  
**Design dials:** variance 7/10 · motion 4/10 · density 7/10

## Direction: signal cartography

The interface borrows from an observatory field log: measured, timestamped, and traceable. It is not a chatbot, a media homepage, or a generic SaaS dashboard. The first viewport opens on the strongest current signal and its evidence trail.

### Signature element

The **evidence pulse** is a thin horizontal rail with discrete nodes. A node represents an independent evidence family; its spacing encodes time and its fill encodes evidence status. It appears in the hero, signal cards, and concept chronology. This is the one expressive device; surrounding surfaces stay quiet.

### Deliberate rejection of generated defaults

- No AI purple/pink gradients, chat bubbles, typing dots, glass cards, floating KPI tiles, or decorative network backgrounds.
- No newspaper cosplay or warm parchment/serif treatment.
- No animation that implies fresh data when the timestamp is static.

## Tokens

### Color

| Role | Token | Value | Meaning |
|---|---|---|---|
| Atmospheric background | `--canvas` | `#F2F6F8` | cool observation surface |
| Primary surface | `--surface` | `#FFFFFF` | cards and reading panels |
| Recessed surface | `--surface-muted` | `#E7EEF3` | filters and secondary context |
| Primary ink | `--ink` | `#10243E` | headings and body |
| Secondary ink | `--ink-muted` | `#52667A` | metadata; never below 14px |
| Rule | `--rule` | `#CAD6DF` | structure, not decoration |
| Evidence blue | `--evidence` | `#2251FF` | verified links and active state |
| Evidence dark | `--evidence-dark` | `#1737A6` | accessible text on light surfaces |
| New-signal orange | `--signal` | `#B84016` | new / fast-rising only |
| Engineering cyan | `--engineering` | `#0B7285` | implementation evidence |
| Supported green | `--supported` | `#117A55` | independently supported |
| Conflict red | `--conflict` | `#B42318` | contradiction or failure |
| Focus | `--focus` | `#2251FF` | 3px visible focus ring |

Color is never the only carrier of status: every state includes text or shape.

### Typography

- **Display / headings:** Geist Sans, `Noto Sans SC`, `PingFang SC`, sans-serif; 650–760 weight, tight tracking. Character comes from condensed line lengths and asymmetric breaks, not a novelty font.
- **Reading / UI:** Geist Sans, `Noto Sans SC`, `PingFang SC`, sans-serif; 16px base, 1.6 line-height.
- **Evidence / timestamps:** Geist Mono, `SFMono-Regular`, monospace; 12–13px, tabular numerals, uppercase English labels.
- Never set Chinese body copy below 14px. Use at most three weights per screen.

### Type scale

| Token | Size | Line height | Use |
|---|---:|---:|---|
| `--text-hero` | clamp(38px, 5vw, 72px) | 0.98 | one thesis only |
| `--text-h1` | clamp(30px, 3vw, 46px) | 1.08 | page title |
| `--text-h2` | 24px | 1.2 | section heading |
| `--text-h3` | 18px | 1.35 | card title |
| `--text-body` | 16px | 1.6 | reading copy |
| `--text-meta` | 13px | 1.45 | evidence metadata |

### Spacing and geometry

- Spacing scale: `4, 8, 12, 16, 24, 32, 48, 72`.
- Desktop rail: 76px collapsed navigation plus a 288px context column where needed.
- Main readable width: 760px; full radar canvas: 1480px maximum.
- Card radius: 14px. Pills are reserved for filters/status, never used as default containers.
- Borders carry hierarchy; shadows are limited to overlays. Cards do not float on hover.

## Layout

```text
desktop ≥ 1100
┌──────┬────────────────────────────────────────────────────┐
│ mark │ date / watch status / actions                      │
│ nav  ├───────────────────────────────┬────────────────────┤
│      │ dominant signal + pulse rail  │ emerging concepts  │
│      ├───────────────────────────────┼────────────────────┤
│      │ signal stream                 │ source health      │
└──────┴───────────────────────────────┴────────────────────┘

mobile < 760
┌──────────────────────────┐
│ mark / date / menu       │
├──────────────────────────┤
│ dominant signal          │
├──────────────────────────┤
│ compact filter scroller  │
├──────────────────────────┤
│ signal stream            │
└──────────────────────────┘
```

The information hierarchy is `event → why now → evidence → engineering implication`. Metrics never precede the event itself.

## Components

### Evidence pulse

- 2px rule on a quiet blue-gray track.
- 8–12px nodes; origin candidate is outlined, independent confirmations are filled, implementation evidence uses a square node.
- Every visual node has adjacent or tooltip text and a list fallback.

### Signal card

- Fixed reading order: status/time → title → why it matters → pulse → sources → engineering implication.
- Featured card may span columns; ordinary cards remain one-dimensional and skimmable.
- Hover changes border and background only; no translate or scale.

### Filter chip

- Minimum 44px touch height, text label, selected state uses evidence-blue fill plus check mark.
- Keyboard reachable and implemented as button, not clickable `div`.

### Buttons and links

- Primary actions use evidence blue; orange is never a generic CTA color.
- Icon-only controls require an accessible name and 44×44px target.
- Internal navigation uses framework links; external evidence links expose domain and open-state clearly.

### Empty and failure states

- State what is absent, the last successful observation time, and the next available action.
- A failed analyzer cannot erase the underlying event; show “待人工分析”.

## Motion

- One orchestrated moment: evidence nodes resolve left-to-right on first load, 220–420ms total.
- UI transitions: 160–220ms ease-out, opacity/color/transform only.
- No looping ambient motion, count-up numbers, bouncing, or simulated streaming.
- Under `prefers-reduced-motion: reduce`, remove travel and show final state immediately.

## Responsive behavior

- 1440px: full three-area layout.
- 1024px: context rail becomes a compact right column.
- 768px: side navigation becomes top navigation; right rail moves below stream.
- 375px: one column, no horizontal page scroll, filter row may scroll with visible edge affordance.
- Graph views always provide a relationship list; mobile defaults to the list.

## Accessibility and interaction floor

- Text contrast ≥ 4.5:1; large text ≥ 3:1.
- Visible `:focus-visible` ring, skip link, semantic landmarks, logical heading order.
- All pointer interactions work with keyboard and touch; touch targets ≥ 44×44px.
- Status never relies on color alone.
- Interactive controls provide pressed/selected state and honest feedback.

## Final anti-pattern checklist

- No emoji icons or hand-authored illustrative SVGs.
- No clickable non-semantic containers.
- No hidden focus ring, hover-only disclosure, or mobile horizontal overflow.
- No generic KPI strip before the primary signal.
- No invented live-state, source count, or confidence claim without an explicit demo-data label.
