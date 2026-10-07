---
name: SafeSky Nocturne
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c5c9ac'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8f9378'
  outline-variant: '#444932'
  surface-tint: '#b0d500'
  primary: '#ffffff'
  on-primary: '#2a3400'
  primary-container: '#caf300'
  on-primary-container: '#596c00'
  inverse-primary: '#536600'
  secondary: '#c8c6c5'
  on-secondary: '#303030'
  secondary-container: '#474746'
  on-secondary-container: '#b6b5b4'
  tertiary: '#ffffff'
  on-tertiary: '#1b343d'
  tertiary-container: '#cde7f3'
  on-tertiary-container: '#506873'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#caf300'
  primary-fixed-dim: '#b0d500'
  on-primary-fixed: '#171e00'
  on-primary-fixed-variant: '#3e4c00'
  secondary-fixed: '#e4e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#cde7f3'
  tertiary-fixed-dim: '#b1cad7'
  on-tertiary-fixed: '#041e28'
  on-tertiary-fixed-variant: '#324a54'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  surface-base: '#0A0A0A'
  surface-raised: '#141414'
  surface-elevated: '#1E1E1E'
  border-subtle: rgba(255, 255, 255, 0.08)
  border-crisp: '#2A2A2A'
  text-on-accent: '#000000'
  text-primary: '#F5F5F5'
  text-secondary: '#8A8A8A'
  status-alert: '#FF3B30'
  status-active: '#D4FF00'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: '0'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: '0'
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 3rem
  margin-tablet: 2rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system projects mission-critical precision, technological authority, and quiet vigilance. Designed for airspace monitoring, security infrastructure, and tactical clarity, the interface rejects decorative clutter in favor of high-contrast functional elegance. 

The aesthetic merges **minimalist technical precision** with **restrained glassmorphism**:
- Deep void canvas environments establish an atmosphere of calm operational readiness.
- An electric hyper-lime accent delivers instantaneous signal recognition without cognitive fatigue.
- Architectural layout principles pair bold geometric display scales with engineered typographic micro-data to maintain strict technical readability.
- The visual signature remains calm, disciplined, and razor-sharp, evoking the presence of advanced radar arrays and aerospace command interfaces.

## Colors

The palette operates under a high-efficiency dark taxonomy:
- **Base Canvas (`#0A0A0A`)**: Ground-zero abyss that minimizes screen illumination, ideal for dimly lit control centers and continuous monitoring.
- **Surface Layering (`#141414`, `#1E1E1E`)**: Monochromatic tiers that separate contextual containers through value rather than aggressive color.
- **Signal Lime (`#D4FF00`)**: A singular, hyper-saturated chromatic focal point used exclusively for primary calls-to-action, critical telemetry pings, and operational statuses. Typography placed on this color must strictly be pitch black (`#000000`) to maximize legibility.
- **Structural Outlines (`#2A2A2A` / `rgba(255, 255, 255, 0.08)`)**: Low-energy, precise lines framing components cleanly against the void.

## Typography

The typography couples geometric industrial display with pragmatic UI prose:
- **Headlines & Labels (`Space Grotesk`)**: Imparts an engineered, technical cadence. Display headlines utilize tight negative tracking to maintain punch and visual density. Micro-labels and telemetry readouts employ uppercase styling with open tracking (`+0.08em` to `+0.1em`) for immediate recognition across dense operational dashboards.
- **Body & Numerical Readouts (`Inter`)**: Neutral, highly legible, and optimized for data density and long-form analytical scanning. Line heights are calibrated generously to prevent visual congestion against deep dark backgrounds.

## Layout & Spacing

The structural layout relies on an anchored 12-column fluid grid system on desktop, collapsing to 8 columns on tablet and 4 columns on mobile viewports:
- **Vertical Rhythm**: Built around a base 8pt spatial unit. Spacing tokens strictly dictate the voids between modular tiles, preventing structural overlap.
- **Negative Space**: Large margins (`3rem`) frame focal modules, giving the layout an architectural, widescreen perimeter.
- **Modular Data Cells**: Interactive data streams and air surveillance widgets lock to grid increments, snapping flush with precise, hairline boundaries.

## Elevation & Depth

Depth is defined through luminosity tiers and frosted surface refraction rather than traditional diffuse drop shadows:
- **Zero-Shadow Philosophy**: Traditional soft black drop shadows disappear against an `#0A0A0A` canvas. Depth is achieved via tonal contrast (`#0A0A0A` → `#141414` → `#1E1E1E`) and crisp 1px perimeter outlines.
- **Glassmorphic Shields**: Floating overlays and modal HUDs use translucent black backdrops (`rgba(20, 20, 20, 0.75)`) combined with a `24px` backdrop blur (`backdrop-filter: blur(24px)`) and a `1px` translucent edge stroke (`rgba(255, 255, 255, 0.08)`).
- **Targeted Glows**: Primary interactive elements and active targets project an optional focused, concentrated blur halo (`0 0 24px rgba(212, 255, 0, 0.25)`), creating an authoritative instrument-panel glow.

## Shapes

The design system adopts a crisp, disciplined radius standard (Level 1 - Soft):
- **Precision Corners**: Standard modules, cards, and input fields feature subtle `0.25rem` (4px) corner rounding to maintain structural stiffness and an industrial silhouette.
- **Structural Framing**: Outlines maintain a consistent 1px thickness without corner distortion.
- **Interactive Badges**: Telemetry chips and status indicators may employ full pill radiuses solely when displaying live system indicators (e.g., radar connectivity, active transponders), separating status signifiers from physical layout containers.

## Components

### Buttons
- **Primary**: Solid electric lime (`#D4FF00`) fill, jet black (`#000000`) typography in `Space Grotesk` Medium, sharp 4px corners, zero border. Hover state dims slightly to `#C3EB00` with an ambient glow (`box-shadow: 0 0 20px rgba(212, 255, 0, 0.35)`).
- **Secondary / Ghost**: Deep charcoal fill (`#141414`) with a 1px border (`#2A2A2A`), white text (`#F5F5F5`). Hover increases border opacity to `rgba(255, 255, 255, 0.24)` and shifts surface to `#1E1E1E`.

### Cards & Telemetry Containers
- Built on `#141414` with a 1px crisp stroke of `#2A2A2A`.
- Padding scales from `space-md` on compact widgets to `space-xl` on primary command viewports.
- Inner data sections are partitioned by 1px horizontal rules tinted at `rgba(255, 255, 255, 0.06)`.

### Inputs & Search Fields
- Inset styling with a dark canvas (`#0A0A0A`), enclosed in a 1px `#2A2A2A` border.
- Placeholder text in `#8A8A8A`.
- Active focus state sharpens the border stroke to solid lime (`#D4FF00`) with no native browser outline.

### Chips & Status Indicators
- Micro-scale telemetry tags using `label-sm` in uppercase.
- Contain a pulsating 6px dot: green `#D4FF00` for operational/secure airspace, red `#FF3B30` for breach/warning alerts.
- Background uses ultra-subtle tinted fills (`rgba(212, 255, 0, 0.08)`).

### Lists & Telemetry Feeds
- Border-separated tabular rows without zebra striping.
- Hovering over a row highlights the surface to `#1A1A1A` with a micro-transition (150ms ease).
- Fixed-width numerical values set with tabular lining figures (`font-variant-numeric: tabular-nums`).