# Fiducial

Hue-less, print-registration interface language for Verbatim.

Near-black ink on paper-white. No brand color. Surfaces feel typeset: hairline rails, 8×8px registration marks, stacked micro-shadows. Depth is an opaque alpha border, a 1px inner highlight, and a 5% hairline drop — never glow or chroma.

## Color

| Role | Light | Dark (`.dark`) |
|---|---|---|
| Canvas | `#FAFAFA` | `#111111` |
| Card / paper | `#FFFFFF` | 2% lift of canvas |
| Ink / primary | `#262626` | `#F5F5F5` |
| On-primary | `#FAFAFA` | `#0A0A0A` |
| Muted | `#686868` | `#818181` |
| Border | black / 8% | white / 6% |
| Input | black / 10% | white / 8% |
| Ring | `#A1A1A1` | `#737373` |
| Destructive | `#FB2C36` | same |
| Success | `#00BC7D` | same |
| Info | `#2B7FFF` | same |
| Warning | `#FE9A00` | same |

Dark is the inverse of light: canvas `#111111`, cards `#141414`, ink `#F5F5F5` on near-black, borders white/6%. Semantic hues (red/green/blue/amber) stay put — they mean status, not brand.

The app follows the phone, then remembers a manual toggle (moon / sun in the header). Class strategy: `html.dark` / `html.light`.

## Type

Cal Sans UI (variable 300–700) for chrome and headings. Cal Sans Text for reading. Body 16/24/400. Controls 14/500. No tracking, no uppercase chrome.

| Level | Size | Weight | LH |
|---|---|---|---|
| Page H1 | 36 | 700 | 1.11 |
| H2 / reading title | 24 | 600 | 1.33 |
| Lede | 18 | 400 | 1.56 |
| Body | 16 | 400 | 1.50 |
| Control | 14 | 500 | 1.43 |
| Micro | 12 | 500 | 1.00 |

Inputs stay 16px on iOS so Safari does not zoom.

## Radius

`--radius: 10px`. sm 6 · md 8 · lg 10 · xl 14 · 2xl 16 (cards, sheets). Pills 9999. Fiducials 2px.

## Elevation

1. Opaque 1px alpha border
2. Inner highlight `inset 0 1px black/4%` (dark: `0 -1px white/6%`)
3. Hairline drop `0 1px 2px black/5%`

Filled primary adds `inset 0 1px white/16%` + `0 1px 2px primary/24%`. Pressed drops the hairline and inverts the inset to `black/8%`.

## Motion

150–200ms ease-in-out. Shadow only on buttons — color snaps. Overlay black/32% + blur-sm. Prefer opacity + 2% scale over travel.

## Chrome

- Rails: 1px, border at 64% opacity, 12px inset
- Registration marks: 8×8px, 2px radius, pinned near the header rule
- Header 64px, `#FAFAFA` at 80%
- Touch: hit area expands to 44×44; coarse pointer active opacity 0.72
