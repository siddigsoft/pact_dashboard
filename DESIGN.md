---
name: PACT Platform
description: Programme and project delivery workspace for PACT — registers, reviews, and reporting cycles.
colors:
  ink: "#020817"
  canvas: "#f3f6f9"
  sheet: "#ffffff"
  page-tint: "#f8fafc"
  hairline: "#e2e8f0"
  muted-surface: "#f1f5f9"
  muted-ink: "#64748b"
  brand-blue: "#2865eb"
  navy-chrome: "#0f172a"
  status-green: "#059669"
  status-yellow: "#f59e0b"
  status-orange: "#f97316"
  status-red: "#e11d48"
  status-review: "#0284c7"
  card-edge-blue: "#dbeafe"
  tile-validated-from: "#059669"
  tile-validated-to: "#115e59"
  tile-review-from: "#0284c7"
  tile-review-to: "#1e40af"
  tile-returned-from: "#d97706"
  tile-returned-to: "#c2410c"
  tile-pending-from: "#6366f1"
  tile-pending-to: "#4338ca"
  dark-canvas: "#080c16"
  dark-sheet: "#0f1422"
  dark-hairline: "#1e293b"
typography:
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.11em"
  numeral:
    fontFamily: "JetBrains Mono, Fira Code, monospace"
    fontSize: "1.75rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
    fontFeature: "tnum"
  eyebrow:
    fontFamily: "JetBrains Mono, Fira Code, monospace"
    fontSize: "0.625rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.2em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  sheet: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "40px"
  "3xl": "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
    typography: "{typography.title}"
    height: "40px"
  button-primary-hover:
    backgroundColor: "#0f172a"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
    typography: "{typography.title}"
    height: "40px"
  input-text:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "40px"
    typography: "{typography.body}"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    typography: "{typography.title}"
  chip-idle:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    typography: "{typography.title}"
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "24px 32px"
  status-pill-review:
    backgroundColor: "#f0f9ff"
    textColor: "{colors.status-review}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
    typography: "{typography.label}"
  list-row-active:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.lg}"
    padding: "14px 12px"
  kpi-tile:
    backgroundColor: "{colors.tile-review-from}"
    textColor: "#ffffff"
    rounded: "{rounded.sheet}"
    padding: "20px"
    typography: "{typography.numeral}"
  card-bordered:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "20px"
  badge-soft:
    backgroundColor: "#dcfce7"
    textColor: "#15803d"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    typography: "{typography.label}"
---

# Design System: PACT Platform

## 1. Overview

**Creative North Star: "The Delivery Register"**

PACT is a record, not a marketing surface. Programme managers, project directors, and validators come here to answer one question per screen: what is true right now, and what do I have to sign off before the cycle closes. Every visual decision serves that. The system takes its cues from a well-kept paper register: a tinted desk, crisp white sheets laid on it, hairline rules that organise without shouting, numbered sections, and figures set in a monospace that lines up column-perfectly down the page. Density sits at "daily working tool" — generous enough to read for an hour, tight enough to hold twelve projects in one screen.

Colour is used generously, but it is never arbitrary. The system leads with a row of saturated gradient KPI tiles — the same vocabulary as the main Dashboard's `GRADIENT_PRESETS` — and every one of them is bound to a status bucket and clickable as a filter. Below that, soft `bg-{hue}-100 / text-{hue}-700` badges carry per-row state, blue-tinted card edges tie the surfaces to the platform's identity, and the four risk colours stay reserved for risk. The result reads as lively at a glance and still tells a director exactly where to look. A colour that means nothing is the only kind this system rejects.

This system rejects the SaaS-dashboard reflexes it grew out of: purple-to-blue gradient *headings*, neon glows, glassmorphic panels, and rows of identical icon-and-heading tiles that carry no data. Several of those patterns still exist as unused utilities in `src/index.css` (`.gradient-text-primary`, `.glass-effect`, `.tech-glow`, `.scan-line-effect`). They are legacy. Do not reach for them. Gradients belong on surfaces that report a number, never on text.

**Key Characteristics:**
- Two base surfaces: a tinted canvas, and white sheets on it, with saturated gradient tiles as the accent layer.
- Blue-tinted card edges (`#dbeafe`) rather than grey, matching the main Dashboard.
- Manrope for interface chrome, Inter for prose, JetBrains Mono for every figure.
- Every saturated colour is bound to a status, a risk level, or an action. None is decorative.
- Root font size is 14px; the whole scale is calibrated to that, not to 16px.

## 2. Colors

A slate-tinted neutral base carrying a saturated, status-bound accent layer: four gradient KPI tiles, soft badges, and blue card edges.

### Primary
- **Brand Blue** (#2865eb): The platform's identity and its action colour. Primary buttons, selected chips, the active tab underline, section number chips (`bg-primary/10` behind `text-primary`), the selected register row's ring, and every focus ring. The shadcn `--primary` token.
- **Ink** (#020817): Body copy and headings. Structural, not decorative — it carries hierarchy so the accent layer never has to.

### Gradient Tiles
The KPI row. Each tile is a `bg-gradient-to-br` pair, white text, a watermark icon at 10% white, and a click target that filters the register to its own bucket. Drawn from the same set as the main Dashboard's `GRADIENT_PRESETS`.

- **Validated** (#059669 → #115e59): Emerald to teal. Confirmed and published.
- **To review** (#0284c7 → #1e40af): Sky to blue. Waiting on a validator.
- **Returned** (#d97706 → #c2410c): Amber to orange. Sent back for revision.
- **Pending** (#6366f1 → #4338ca): Indigo. No entry yet this cycle.

**The 600-Floor Rule.** A gradient that carries white text starts at the `-600` step, never `-500`. White on `emerald-500`, `sky-500`, or `amber-500` lands around 2.5:1 and fails AA. Starting at `-600` clears the bar and reads richer, not duller. Check the *lightest* end of the gradient, which is the corner that fails.

### Secondary
- **Navy Chrome** (#0f172a): The persistent left sidebar and any always-dark application frame. It is a container colour, never a content colour, and never appears inside a sheet.

### Tertiary
The status set. These five are the working vocabulary of the whole product, used at full strength for dots, bars, and icons, and as `bg-{hue}-100 / text-{hue}-700` soft badges for row-level state. Never use them decoratively.

- **Status Green** (#059669): On plan. Risk flag green, completed segments of a progress bar, validated updates.
- **Status Yellow** (#f59e0b): Support needed, delivery not yet at risk. Also the "returned for revision" state.
- **Status Orange** (#f97316): Materially behind, or a key deliverable slipping.
- **Status Red** (#e11d48): Blocked or escalating. Also destructive confirmations.
- **Status Review** (#0284c7): Awaiting a human decision. Submitted-for-validation, items in a reviewer's queue. This is the one status that means "you, now" and it is the only status permitted to render as a filled pill rather than plain coloured text.

### Neutral
- **Canvas** (#f3f6f9): The desk. Page background behind sheets on register-style screens.
- **Page Tint** (#f8fafc): The lighter global `--background`, used on screens that have no sheet/canvas separation.
- **Sheet** (#ffffff): Every card, panel, popover, and selected list row.
- **Card Edge Blue** (#dbeafe, `blue-100` / `blue-900` in dark): The border on every card, panel, input, and grouped container. The main Dashboard's signature — it is what makes a white card read as part of PACT rather than as a generic shadcn card. Use this, not grey, on any bordered surface.
- **Hairline** (#e2e8f0): The `--border` token. Dividers and table rules inside a card. In new work prefer `slate-900` at 7–10% opacity so the rule tints with the surface beneath it.
- **Muted Ink** (#64748b): Secondary and caption text, inactive tabs, placeholder copy.
- **Muted Surface** (#f1f5f9): Skeleton loaders, inline code, quiet metadata strips.
- **Dark Canvas** (#080c16) / **Dark Sheet** (#0f1422) / **Dark Hairline** (#1e293b): Dark-mode equivalents. Note that the global `--card` and `--background` tokens collapse to the same value in dark mode, so sheets must set their surface explicitly rather than relying on `bg-card`.

### Named Rules

**The Working Colour Rule.** Every saturated colour must be doing a job: encoding a status, a risk level, or an action. The test is behavioural, not aesthetic — a gradient KPI tile earns its colour because it reports a number *and* filters the list when clicked. A gradient banner behind a page title reports nothing and is therefore prohibited. Lively is fine; arbitrary is not.

**The One Loud Layer Rule.** A screen gets one saturated layer, and it is the KPI tiles at the top. Everything below them steps down to soft badges (`bg-{hue}-100`), tinted strips (`bg-blue-50`), and 2–4px colour marks. If the register rows are competing with the tiles, the rows are too loud, not the tiles.

**The Clean Wash Rule.** Page-level colour is a single top-to-bottom linear gradient (`from-sky-100/70 via-sky-50/25 to-transparent`), nothing more. Multi-stop radial washes at several corners read as a dirty screen rather than as atmosphere. One direction, one hue, fading to nothing.

## 3. Typography

**Display Font:** Manrope (fallback: system-ui, sans-serif)
**Body Font:** Inter (fallback: -apple-system, Segoe UI, system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (fallback: Fira Code, monospace)

**Character:** Manrope is a low-contrast grotesk with slightly squared terminals — it holds up at 10px uppercase and at 38px display without looking like two different fonts, which is exactly what an interface with tiny labels and large figures needs. Inter carries running prose underneath it without competing. JetBrains Mono gives every figure, project code, date, and reporting period a fixed rhythm so columns of numbers align down the page. The pairing reads as instrument, not brochure.

Poppins and Playfair Display are also loaded and are applied by the base `h1`–`h6` and `.font-serif` rules in `src/index.css`. Both are legacy. New work sets its own typography explicitly and does not rely on the base heading styles.

### Hierarchy

- **Display** (Manrope 700, 2rem, line-height 1.1, tracking -0.03em): One per page. The page title in the masthead.
- **Headline** (Manrope 700, 1.375rem, tracking -0.03em): The subject of the current sheet — a project name, a record title.
- **Title** (Manrope 600–700, 0.8125rem): Row names, button labels, chip text, field group headings.
- **Body** (Inter 400, 0.8125rem, line-height 1.65, max 56ch): Explanatory copy, textarea content, helper text. Never wider than 56 characters.
- **Label** (Manrope 600, 0.625rem, uppercase, tracking 0.11em): Field labels, metric captions, table column headers.
- **Eyebrow** (JetBrains Mono 400, 0.625rem, uppercase, tracking 0.2em): The line above a title that names the context — reporting cycle, project code, section state.
- **Numeral** (JetBrains Mono 400, tabular, 1.5–1.75rem for headline figures, 0.625–0.8125rem inline): Every count, percentage, date, period, and identifier.

### Named Rules

**The Every-Number-Is-Mono Rule.** Percentages, counts, dates, ISO periods, and project codes are set in JetBrains Mono with `tabular-nums`. No exceptions. A figure in Inter inside a column of figures in mono is an instant tell that a screen was assembled rather than designed.

**The Chrome-and-Prose Rule.** Manrope for anything the user clicks, scans, or navigates by. Inter for anything they read as sentences. If you cannot decide which a piece of text is, it is probably a label, and labels are Manrope.

**The 14px Root Rule.** `html { font-size: 14px }` is set globally. A `text-sm` is 12.25px here, not 14px. Size type in explicit rem values (`text-[0.8125rem]`) rather than the fluid `clamp()`-based Tailwind scale when precision matters — the scale's `clamp()` values were tuned for a 16px root and drift on wide viewports.

## 4. Elevation

The system is structurally flat. Depth comes from a 1px inset ring and a change of surface value, not from shadow. A sheet is legible as a sheet because it is white on a tinted canvas with a hairline ring around it — the shadow is a whisper on top of that, not the mechanism. Shadows are reserved for the one element the user is currently acting on: the selected row in a register, the open sheet, a floating dock. If two things on a screen carry a shadow, one of them is wrong.

### Shadow Vocabulary

- **Hairline ring** (`box-shadow: inset 0 0 0 1px rgb(15 23 42 / 0.07)`): The default. Every sheet, input, chip, and grouped container. Tints with the surface behind it rather than sitting on top as a grey line.
- **Seated** (`box-shadow: 0 1px 2px rgb(15 23 42 / 0.06)`): Inputs and small controls at rest. Enough to seat the control on the surface, not enough to read as lifted.
- **Lifted** (`box-shadow: 0 1px 2px rgb(15 23 42 / 0.06), 0 10px 28px -14px rgb(15 23 42 / 0.35)`): The selected row pulled out of a register list. The wide, low-opacity second layer is what makes it read as picked up rather than as a button.
- **Sheet** (`box-shadow: 0 1px 2px rgb(15 23 42 / 0.05), 0 16px 40px -24px rgb(15 23 42 / 0.3)`): The primary working panel on a page.

### Named Rules

**The Hairline-First Rule.** Reach for a 1px inset ring before reaching for a shadow. If the element still does not separate from its background, change the surface value. Shadow is the third answer, not the first.

**The Tinted Shadow Rule.** Shadows are `rgb(15 23 42 / …)` — slate, matching the neutral hue. Never pure black. If a shadow looks grey and hard rather than soft and cool, the alpha is too high and the blur radius is too small.

## 5. Components

### Buttons
- **Shape:** Gently curved (8px, `--radius`). Pills (`rounded-full`) are for chips and status only, never for actions.
- **Primary:** Brand Blue fill (`bg-primary`), white text, 40px tall, 16px horizontal padding, Manrope 600 at 0.8125rem.
- **Commit actions:** The one button that ends a workflow step takes a gradient and a coloured drop shadow tinted to its own hue — Submit is sky→blue, Validate & publish is emerald→teal. One per screen state, never two side by side.
- **Hover / Focus:** Gradient buttons hover with `brightness-110` and a 2px lift. Focus is a 3px ring at `primary/15` plus a border shift to `primary/40`.
- **Active:** `scale(0.98)`. Every interactive element in this system gives a physical push on press.
- **Outline / Ghost:** Transparent fill with a hairline ring; ghost drops the ring and tints the background at 2.5% ink on hover.
- **Destructive:** Status Red fill, reserved for return-for-revision and delete.

### Chips
- **Style:** Full-radius pill, 4px/12px padding, Manrope 600 at 11.5px. Idle is transparent with a hairline ring and muted-ink text.
- **State:** Selected inverts to an Ink fill with sheet-white text and no ring. There is no intermediate hover fill — the chip either is or is not selected.

### Cards / Containers
- **Corner Style:** Sheets are 12px; grouped controls and list rows are 8px.
- **Background:** Sheet white on light canvas; #0f1422 on #080c16 in dark mode, set explicitly.
- **Shadow Strategy:** Card Edge Blue border plus the Sheet shadow. See Elevation.
- **Border:** 1px Card Edge Blue (`border-blue-100` / `dark:border-blue-900`). This is the Dashboard's signature and it is what makes a card read as PACT.
- **Internal Padding:** 20px on mobile, 32px from `sm` up. Sticky sub-headers and docks inside a sheet use negative margins to span its full width and re-apply the same padding.

### Inputs / Fields
- **Style:** Sheet-white fill, hairline ring, 8px radius, 40px tall, 0.8125rem Inter. Label sits above the input in Label type; helper or error text sits below.
- **Focus:** Border darkens to 25% ink, plus a 3px ambient ring at 7% ink. No colour change, no glow.
- **Error / Disabled:** Error swaps the ring to Status Red at 40% and puts the message below in 10.5px. Disabled drops to 60% opacity and keeps the cursor default.
- **Search:** Leading magnifier icon at 14px inset 12px, trailing clear affordance once there is a value.

### Navigation
- **Style:** Persistent left sidebar on Navy Chrome (#0f172a) with sheet-white text at 90% and 60% for inactive items. Active item takes a lighter navy fill (#1e293b), never a coloured one.
- **In-page tabs:** A ruled bar, not a pill group. Tab labels in Manrope 11.5px with the count beside them in mono at 10px and 55% opacity. The active tab is marked by a 2px Ink underline that animates between tabs with a spring (stiffness 480, damping 38). Tabs wrap; they never produce a horizontal scrollbar.
- **Mobile:** The sidebar collapses to a sheet drawer. In-page tabs wrap to a second line rather than scrolling.

### Register Row (signature component)
The core pattern of the Project Updates screen and the model for any queue in the product.

A borderless list on the canvas, rows separated by hairline rules. Each row has a fixed 6px gutter holding a risk dot, then a two-line block — name in Manrope 600 with the status at the far right, and a metadata line in mono at 10.5px joined by `/` separators — then an optional 3px progress rail across the bottom of the block. A chevron slides in from `-4px` on hover.

The selected row does not tint. It becomes a sheet: white fill, hairline ring, 8px radius, the Lifted shadow, and its dividers removed, so it reads as lifted out of the register onto the desk. This is the only place in the system where a list item changes surface class, and it is what makes a long queue navigable without colour.

### Status Pill (signature component)
A full-radius soft badge: `bg-{hue}-100` fill, `text-{hue}-700` label, a matching 1px inset ring at 15%, Manrope 700 uppercase at 10px. Sky for to-review, emerald for validated, amber for returned, indigo for draft, slate for not-started. Every row carries one, so the register reads as a colour-coded ledger at a glance.

### KPI Tile (signature component)
The row of four gradient tiles under the masthead, and the thing management recognises as "the Dashboard look".

Each tile is a `bg-gradient-to-br` surface at 12px radius with white text, a label in Manrope 700 uppercase, the figure in JetBrains Mono at 2rem, a one-line caption at 75% white, a 16px icon top-right at 80% white, and the same icon repeated at 96px / 10% white bleeding off the bottom-right corner as a watermark. Hover lifts 2px and grows the watermark to 110%. The tile is a `<button>`: clicking it filters the register to its bucket, clicking again clears back to All, and the active tile carries a white ring offset against the canvas.

**The tile must report a number.** A gradient tile with no figure in it is decoration and is prohibited.

## 6. Do's and Don'ts

### Do:
- **Do** put a tinted canvas (#f3f6f9) behind white sheets on any screen that shows a list next to a detail view. Two surfaces, no more.
- **Do** set every number in JetBrains Mono with `tabular-nums`, including inline percentages inside a sentence of metadata.
- **Do** separate a queue rail from its detail pane with a single vertical hairline rule rather than by floating two cards in space.
- **Do** use `text-[0.8125rem]`-style explicit rem sizes on new work; the fluid `clamp()` Tailwind font scale drifts on wide viewports because the root is 14px.
- **Do** border cards with `blue-100` / `dark:blue-900` rather than grey. It is the single cheapest way to make a new screen look like it belongs to PACT.
- **Do** make every gradient surface clickable and bound to a number. Colour that does not filter, navigate, or report is decoration.
- **Do** keep the saturated layer at the top of the page and step down to soft badges below it.
- **Do** give every interactive element an `active:scale-[0.98]` press and an `ease-[cubic-bezier(0.16,1,0.3,1)]` transition. Ease out, never bounce.
- **Do** design the loading, empty, and error state at the same time as the success state. Skeletons must match the real row's geometry, including varied widths.
- **Do** honour `prefers-reduced-motion` on every entrance animation, as the `.pdu-queue-row` and `.pdu-detail-enter` keyframes do.
- **Do** set dark-mode surfaces explicitly. `bg-card` and `bg-background` resolve to the same value in dark mode, so relying on them makes sheets vanish.

### Don't:
- **Don't** put a multi-stop radial gradient wash behind page content. One clean linear top wash only — see the Clean Wash Rule.
- **Don't** use `.gradient-text-primary`, `.gradient-text`, or any `background-clip: text` gradient. Gradients go on surfaces that report numbers, never on type.
- **Don't** put a gradient behind a page title, a section header, or an empty state illustration. If it has no figure in it, it does not get a gradient.
- **Don't** run more than one gradient layer down a page. Tiles at the top and one commit button at the bottom is the ceiling.
- **Don't** use `.glass-effect`, `.tech-glow`, `.tech-glow-green`, `.scan-line-effect`, `.circuit-pattern`, or `.animate-glow-pulse`. They are legacy utilities in `src/index.css` and they are not part of this system.
- **Don't** use a coloured `border-left` thicker than 1px as an accent stripe on a card, row, or alert — including the `border-l-4` in `.uber-notification-card`. Use a full hairline ring, a background tint, or a leading dot instead.
- **Don't** use Playfair Display or any serif in application UI. It is loaded for legacy reasons only.
- **Don't** let a filter tab group produce a horizontal scrollbar. Wrap.
- **Don't** stack a card inside a card. Nested sheets are always wrong; use a hairline rule or spacing to group instead.
- **Don't** put more than one shadowed element on a screen. If the selected row is lifted and the panel is lifted and the dock is lifted, nothing is.
- **Don't** use pure black (#000) or pure grey shadows. Slate-tinted `rgb(15 23 42 / …)` only.
- **Don't** reach for a modal. Project Updates does return-for-revision as an inline row swap; do the same.
- **Don't** introduce a new accent colour. If something needs to stand out and is not a status, it needs hierarchy, not hue.
