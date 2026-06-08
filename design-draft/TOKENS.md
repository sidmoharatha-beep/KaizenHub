# OORJA 2.0 — Design Token System
# Food Manufacturing Factory Aesthetic
# Status: DRAFT — Not applied to production

## Color Tokens

### Primary — Deep Green (Hygiene / Food Safety)
```
--color-green-deep:      #0F4C3A   /* Primary brand — deep forest green */
--color-green-mid:       #1A6B4A   /* Hover states, secondary actions */
--color-green-light:     #10B981   /* Success, positive states, links */
--color-green-pale:      #D1FAE5   /* Success backgrounds */
--color-green-surface:   #ECFDF5   /* Success tint backgrounds */
```

### Accent — Amber (Energy / Factory Heat)
```
--color-amber:           #F5A623   /* Primary accent — CTAs, highlights */
--color-amber-light:     #FCD34D   /* Lighter accent variant */
--color-amber-dark:      #D97706   /* Darker accent — hover states */
--color-amber-pale:      #FEF3C7   /* Warning/amber backgrounds */
```

### Text — Charcoal
```
--color-charcoal:        #1F2937   /* Primary text */
--color-charcoal-mid:    #374151   /* Secondary text */
--color-charcoal-light:   #6B7280   /* Muted/placeholder text */
--color-charcoal-xlight:  #9CA3AF   /* Disabled, tertiary */
```

### Surface / Background
```
--color-surface:         #F8FAFC   /* Page background */
--color-surface-warm:    #FDFCFA   /* Warm surface for auth panel */
--color-white:           #FFFFFF   /* Card surfaces */
--color-border:          #E5E7EB   /* Default borders */
--color-border-warm:      #E8E0D5   /* Warm-toned borders */
```

### Status
```
--color-red:             #DC2626   /* Error, destructive */
--color-red-light:       #FEE2E2   /* Error background */
--color-yellow:          #F59E0B   /* Warning */
--color-yellow-light:    #FEF3C7   /* Warning background */
--color-blue:            #2563EB   /* Info, links */
--color-blue-light:      #DBEAFE   /* Info background */
--color-purple:          #7C3AED   /* Special states */
--color-purple-light:    #EDE9FE   /* Purple background */
```

## Typography

### Font Families
```
--font-heading:  'Syne', system-ui, sans-serif   /* Sturdy, industrial headings */
--font-body:     'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif  /* Clean body text */
```

### Type Scale
```
--text-xs:    10px   /* Labels, caps, badges */
--text-sm:    12px   /* Meta, captions */
--text-base:  14px   /* Body default */
--text-md:    15px   /* Body large */
--text-lg:    16px   /* Subheadings */
--text-xl:    20px   /* Section headers */
--text-2xl:   24px   /* Page headers */
--text-3xl:   28px   /* Auth headings */
--text-4xl:   32px   /* KPI values */
--text-5xl:   48px   /* Mobile hero wordmark */
--text-6xl:   80px   /* Desktop hero wordmark */
```

### Weights
```
--font-normal:    400
--font-medium:   500
--font-semibold: 600
--font-bold:     700
--font-extrabold: 800
```

## Spacing

```
--space-1:    4px
--space-2:    8px
--space-3:    12px
--space-4:    16px
--space-5:    20px
--space-6:    24px
--space-8:    32px
--space-10:   40px
--space-12:   48px
--space-16:   64px
```

## Border Radius

```
--radius-xs:    6px     /* Small badges, chips */
--radius-sm:    8px     /* Small buttons, inputs */
--radius-md:   12px     /* Cards, modals */
--radius-lg:   16px     /* Large cards, panels */
--radius-xl:   24px     /* Auth card, reward hero */
--radius-full: 9999px   /* Pills, avatars */
```

## Shadows

```
--shadow-xs:  0 1px 2px rgba(31,41,55,0.04)
--shadow-sm:  0 1px 3px rgba(31,41,55,0.06), 0 1px 2px rgba(31,41,55,0.04)
--shadow-md:  0 4px 16px rgba(31,41,55,0.08), 0 2px 6px rgba(31,41,55,0.04)
--shadow-lg:  0 12px 40px rgba(31,41,55,0.12), 0 4px 12px rgba(31,41,55,0.06)
--shadow-xl:  0 20px 60px rgba(31,41,55,0.16)
--shadow-lift: 0 8px 30px rgba(31,41,55,0.12)  /* Hover lift */
--shadow-glow-amber: 0 0 30px rgba(245,166,35,0.15)
```

## Motion / Transitions

```
--transition-fast:   0.15s cubic-bezier(0.4, 0, 0.2, 1)
--transition:        0.2s cubic-bezier(0.4, 0, 0.2, 1)
--transition-spring: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)
--transition-slow:   0.4s cubic-bezier(0.4, 0, 0.2, 1)
```

## Z-Index Scale

```
--z-base:    0
--z-dropdown: 100
--z-sticky:   200
--z-overlay:  300
--z-modal:    500
--z-toast:    9999
```

## Icon System (Lucide Style)

Inline SVG, 24x24 viewBox, stroke-width: 1.8, stroke-linecap: round, stroke-linejoin: round.

### Core Icons
- safety: shield-check
- quality: clipboard-check
- kaizen: zap (lightning bolt)
- qc: users (group)
- behavioral: heart (or award)
- home: home
- submit: plus-circle
- review: search (or file-check)
- rewards: gift (or trophy)
- admin: settings
- logout: log-out
- attachment: paperclip
- camera: camera
- image: image

### Size Variants
```
.icon-sm:  16x16  (tab buttons, inline)
.icon-md:  22x22  (KPI cards, module icons)
.icon-lg:  24x24  (nav items)
.icon-xl:  32x32  (empty states, alerts)
```

## Component Tokens

### Cards
```
.card-padding:         20px
.card-radius:          --radius-lg (16px)
.card-border:          1px solid --color-border
.card-shadow:          --shadow-sm
.card-shadow-hover:    --shadow-md
.card-transform-hover: translateY(-2px)
```

### Buttons
```
.btn-padding:          13px 20px
.btn-radius:           --radius-md (12px)
.btn-font:             --font-body, 14px, 600
.btn-primary-bg:       linear-gradient(135deg, --color-amber, --color-amber-dark)
.btn-primary-color:    --color-green-deep
```

### Form Inputs
```
.input-height:         44px (touch-friendly)
.input-padding:       13px 15px
.input-radius:         --radius-md (12px)
.input-border:         1.5px solid --color-border
.input-focus-border:   --color-amber
.input-focus-shadow:   0 0 0 3px rgba(245,166,35,0.10)
.input-bg:             --color-surface
.input-bg-focus:       --color-white
```

### Bottom Nav
```
.bottom-nav-height:    70px (incl. safe-area)
.nav-item-icon:       24x24
.nav-item-label:      10px
.nav-item-gap:        4px
.nav-active-indicator: 3px tall, amber, top of icon
```

### Topbar
```
.topbar-height:        70px
.topbar-bg:            linear-gradient(135deg, --color-green-deep, #0A3D2E)
.topbar-logo-size:     44x44px, amber gradient, radius-md
.topbar-title-size:    22px, Syne, 800
```