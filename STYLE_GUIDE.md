# OORJA 2.0 — Style Guide
Food Manufacturing Factory Aesthetic · KaizenHub Frontend

---

## Color Tokens

### Primary — Deep Green
```
--color-green-deep:    #0F4C3A   /* Primary brand, headers, nav */
--color-green-mid:     #1A6B4A   /* Hover states */
--color-green-light:   #10B981   /* Success states, positive actions */
--color-green-pale:    #D1FAE5   /* Success backgrounds */
```

### Accent — Amber
```
--color-amber:         #F5A623   /* CTAs, highlights, active states */
--color-amber-dark:    #D97706   /* Hover accent */
--color-amber-pale:    #FEF3C7   /* Warning backgrounds */
```

### Text — Charcoal
```
--color-charcoal:      #1F2937   /* Primary text */
--color-charcoal-mid:  #374151   /* Secondary text */
--color-charcoal-light: #6B7280  /* Muted text, placeholders */
--color-charcoal-xlight: #9CA3AF /* Disabled, tertiary */
```

### Surface
```
--color-surface:      #F8FAFC   /* Page background */
--color-surface-warm:  #FDFCFA   /* Auth panel background */
--color-white:         #FFFFFF   /* Cards, modals */
--color-border:        #E5E7EB   /* Default borders */
```

### Status
```
--color-red:           #DC2626   /* Error, destructive */
--color-red-light:     #FEE2E2   /* Error backgrounds */
--color-yellow:        #F59E0B   /* Warning */
--color-yellow-light:  #FEF3C7   /* Warning backgrounds */
--color-blue:          #2563EB   /* Info */
--color-blue-light:    #DBEAFE   /* Info backgrounds */
--color-purple:        #7C3AED   /* Special states */
--color-purple-light:  #EDE9FE   /* Purple backgrounds */
```

---

## Typography

**Font Families**
- Headings: `'Syne', system-ui, sans-serif` — sturdy, industrial
- Body: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`

**Scale**
```
--text-xs:    10px   /* Labels, caps, badges */
--text-sm:    12px   /* Meta, captions */
--text-base:  14px   /* Body default */
--text-md:    15px   /* Body large */
--text-lg:    16px   /* Subheadings */
--text-xl:    20px   /* Section headers */
--text-2xl:   24px   /* Page headers */
--text-3xl:   28px   /* Auth headings */
--text-5xl:   48px   /* Mobile hero wordmark */
--text-6xl:   80px   /* Desktop hero wordmark */
```

---

## Spacing
```
--space-1:  4px    --space-2:  8px    --space-3:  12px
--space-4:  16px   --space-5:  20px   --space-6:  24px
--space-8:  32px   --space-10: 40px   --space-12: 48px
```

---

## Border Radius
```
--radius-xs:   6px     --radius-sm:   8px
--radius-md:  12px     --radius-lg:  16px
--radius-xl:  24px     --radius-full: 9999px
```

---

## Shadows
```
--shadow-sm:  0 1px 3px rgba(31,41,55,0.06), 0 1px 2px rgba(31,41,55,0.04)
--shadow-md:  0 4px 16px rgba(31,41,55,0.08), 0 2px 6px rgba(31,41,55,0.04)
--shadow-lg:  0 12px 40px rgba(31,41,55,0.12), 0 4px 12px rgba(31,41,55,0.06)
--shadow-lift: 0 8px 30px rgba(31,41,55,0.12)  /* Hover lift effect */
```

---

## Component Patterns

### Buttons
- **Primary**: `background: linear-gradient(135deg, var(--color-amber), var(--color-amber-dark))` · `color: var(--color-green-deep)` · amber glow shadow on hover, lift +2px
- **Secondary**: white bg, `border: 1.5px solid var(--color-border)` · amber border on hover
- **Approve**: green-pale bg, green text · hover fills green
- **Reject**: red-light bg, red text · hover fills red

### Cards
- `background: var(--color-white)` · `border: 1px solid var(--color-border)` · `border-radius: var(--radius-lg)` · `padding: 20px`
- Hover: `transform: translateY(-2px)` + `box-shadow: var(--shadow-md)`

### Badges / Status Pills
- Pill shape (`border-radius: var(--radius-full)`) · uppercase · 10px font · 700 weight
- Pending: amber-pale · Approved: green-pale · Rejected: red-light · Screened: blue-light

### Chips (team members, tags)
- `background: var(--color-green-deep)` · `color: #fff` · `border-radius: 16px` · `padding: 4px 10px`
- Font: 13px · close `×` button on right

### Modal
- Backdrop: `rgba(31,41,55,0.45)` + `backdrop-filter: blur(4px)`
- Card: white · `border-radius: var(--radius-xl)` · `padding: 28px` · max-width 400px
- Cancel: surface bg + border · Confirm: amber gradient

### Photo Upload Zone
```
.photo-upload-zone {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 16px;
  text-align: center;
  cursor: pointer;
  background: var(--color-surface);
  min-height: 80px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.photo-upload-zone:hover { border-color: var(--color-amber); background: rgba(245,166,35,0.04); }
.photo-upload-zone.drag-over { border-color: var(--color-amber); }
.photo-upload-zone input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.photo-upload-error { display: none; font-size: 12px; color: var(--color-red); background: var(--color-red-light); padding: 6px 10px; border-radius: var(--radius-xs); }
.photo-preview { display: none; margin-top: 10px; }
.photo-preview img { width: 100%; max-height: 200px; object-fit: cover; border-radius: var(--radius-md); border: 1px solid var(--color-border); }
.photo-remove-btn {
  position: absolute; top: 8px; right: 8px; width: 28px; height: 28px;
  background: rgba(31,41,55,0.75); border: none; border-radius: 50%;
  display: none; align-items: center; justify-content: center; cursor: pointer;
}
.photo-remove-btn:hover { background: var(--color-red); }
```
- Max file size: **1MB** · Allowed: `image/*`
- Drop-zone icon: camera SVG in green-pale circle

### Navigation
- **Bottom Nav**: fixed · white bg · top shadow · 70px height
  - Active: amber top-bar indicator (3px), amber icon + label
  - Inactive: charcoal-light icon + label
  - Spring scale animation on active
- **Topbar**: sticky · deep green gradient · 70px height
  - Logo: 44×44 amber gradient rounded square
  - User chip: initials avatar + name + role label
  - Logout: ghost button with icon

### KPI Cards
- 4-column grid on desktop, 2-column on mobile
- Top: 3px amber gradient line
- Icon: 44×44 green-pale rounded square
- Value: Syne 30px bold
- Hover: lift -3px + deeper shadow

### Leaderboard Rows
- Hover: surface background tint
- Top 3: amber gradient avatar
- Others: green-deep gradient avatar

---

## Form Inputs
```
input, select, textarea {
  width: 100%;
  padding: 13px 15px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: 'Inter', sans-serif;
  background: var(--color-surface);
  transition: border-color 0.2s, box-shadow 0.2s;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--color-amber);
  box-shadow: 0 0 0 3px rgba(245,166,35,0.10);
  background: var(--color-white);
}
```

---

## Icon System
Inline SVG · 24×24 viewBox · stroke-width: 1.8 · stroke-linecap: round · stroke-linejoin: round

- Safety: shield-check
- Quality: clipboard-check
- Kaizen: lightning bolt
- QC Circle: users
- Behavioral: heart
- Home: home
- Submit: plus-circle
- Review: file-search
- Rewards: gift
- Admin: settings
- Logout: log-out
- Camera/photo: camera

---

## Animations
```
--transition:        0.2s cubic-bezier(0.4, 0, 0.2, 1)
--transition-spring: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)
```
- Page load: fadeIn + translateY(10px) over 0.3s
- Button hover: translateY(-2px) + shadow lift
- Card hover: translateY(-2px) + deeper shadow
- Nav active: scale(1.12) + amber color
- Toast: slideIn from top with spring easing