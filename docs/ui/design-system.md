# AI Vision Control Center – Design System (v0.3.0)

## 1. Overview & Visual Philosophy
The **AI Vision Control Center** is a mobile-first, professional Computer Vision operational dashboard designed for low cognitive load and maximum feed clarity. It shifts the primary focal point from bulky dashboard cards directly to the real-time camera feed and analysis canvas.

### Core Principles
- **Video Feed Primacy:** The camera feed is the dominant screen element across portrait and landscape orientations.
- **Floating Translucent HUD:** Essential metrics (FPS, Latency, Queue Dwell, Class Counts) float over the feed with frosted glass backgrounds (`backdrop-blur-md`), preserving viewport area.
- **Ergonomic Touch Targets:** All touch targets on mobile conform to min 44x44px hitboxes with responsive bottom drawer access for secondary settings.
- **High-Contrast Dark Theme:** Dark obsidian surfaces (`#090d16` to `#1e293b`) maintain high contrast against neon detection bounding boxes and tracking trails.

---

## 2. Color Palette & Semantic Tokens

### 2.1 Backgrounds & Surfaces
| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `bg-slate-950` | `#020617` | Canvas background, letterbox margin |
| `bg-slate-900` | `#0f172a` | App shell, navigation headers & bars |
| `bg-slate-800/80` | `rgba(30, 41, 59, 0.8)` | Translucent HUD panels (`backdrop-blur-md`) |
| `bg-slate-800` | `#1e293b` | Floating cards, modal surfaces |
| `border-slate-700/60` | `rgba(51, 65, 85, 0.6)` | Subtle panel dividers and bounding container borders |

### 2.2 Brand & Accents
| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `primary-500` | `#0284c7` | Primary action buttons, active navigation indicator |
| `cyan-400` | `#22d3ee` | Computer Vision tracking trails, secondary badges |
| `emerald-400` | `#34d399` | Detection bounding boxes, active live status, healthy metrics |
| `amber-400` | `#fbbf24` | Queue latency warning, frame skipping badge |
| `rose-400` | `#f43f5e` | Dropped frames, connection errors, stop action |

---

## 3. Typography & Text Hierarchy
- **Font Family:** Inter, system-ui, -apple-system, sans-serif.
- **Monospace Font:** JetBrains Mono, Fira Code, monospace (used for all numeric telemetry, timestamps, and model hashes).

| Style | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display Title** | 20px (1.25rem) | Bold (700) | 1.2 | App Shell Header, View Titles |
| **Section Header** | 16px (1.0rem) | SemiBold (600) | 1.3 | Panel Headings, Inspector Groups |
| **Body Standard** | 14px (0.875rem) | Regular (400) | 1.4 | Descriptions, Form Labels, Table Text |
| **HUD Metric Value**| 14px (0.875rem) | Bold (700) | 1.0 | Floating FPS, Latency numbers (Mono) |
| **Badge / Caption** | 11px (0.6875rem)| Medium (500) | 1.0 | Status pills, class counts, tags |

---

## 4. Spacing, Layout & Responsive Breakpoints

### 4.1 Spacing Scale
- Compact padding: `p-2` (8px) – HUD badges, compact buttons
- Standard padding: `p-4` (16px) – Panels, drawers, modal bodies
- Large padding: `p-6` (24px) – Desktop workspace margins

### 4.2 Breakpoints
- **Mobile (`< 768px`):**
  - Viewport: Full-bleed camera container (`100dvh - bottom_nav_height`).
  - Navigation: Fixed bottom bar with 5 icon tabs.
  - Controls: Bottom drawer sheet accessed via swipe/button.
- **Tablet / Desktop (`>= 768px`):**
  - Navigation: Collapsible left sidebar (64px collapsed, 240px expanded).
  - Main Canvas: Centered aspect-ratio constrained video container with side telemetry rail.

---

## 5. Component Specifications

### 5.1 Navigation Bar & Sidebar
- **Mobile Bottom Navigation (`MobileNavBar`):**
  - Position: Fixed at screen bottom (`bottom-0 w-full z-40`).
  - Height: 60px safe area.
  - Active Tab: Highlighted with emerald glow (`text-emerald-400 bg-emerald-500/10`).
  - Items:
    1. **Live Camera** (`Camera`)
    2. **Image Analysis** (`Image`)
    3. **Video Analysis** (`Film`)
    4. **Session Analytics** (`BarChart3`)
    5. **Models & System** (`Cpu`)
- **Desktop Sidebar (`DesktopSidebar`):**
  - Position: Fixed left with collapsible toggle.
  - Shows active model badge and system status icon at footer.

### 5.2 Floating HUD Overlays
- **Metrics Bar (`LiveHUD`):**
  - Position: Top-left / top-right over camera viewport (`absolute top-3 left-3 right-3 z-20 pointer-events-none`).
  - Internal chips have `pointer-events-auto` for tooltips.
  - Metrics shown:
    - **FPS:** Emerald `⚡ 12.5 FPS`
    - **Inference Latency:** Sky `⏱ 78ms`
    - **Queue Lag:** Amber `⏳ 15ms`
    - **Server Drops:** Rose `🔻 2 drops` (hidden if 0)
    - **Active Detections:** Compact badge pills showing class icon + count.

### 5.3 Buttons & Interactive Controls
- **Primary Action (Start Stream / Run Detect):**
  - `bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg shadow-emerald-950/50`
- **Stop Action:**
  - `bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg px-4 py-2 flex items-center gap-2`
- **Secondary / Ghost Button:**
  - `bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-sm`

### 5.4 State Representations
- **Loading State:** Translucent pulse shimmer with spinning loader and status label ("Initializing YOLO...", "Capturing image...").
- **Empty State:** Centered slate card with illustrative Lucide icon, clear explanation, and primary call-to-action button.
- **Error State:** Border-rose-500/50 card with warning icon and retry button.
- **Success State:** Emerald accent confirmation with auto-dismissing toast notification.
