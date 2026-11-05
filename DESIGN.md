---
name: PACT Management System
description: A calm, task-focused operations interface grounded in the PACT logo.
colors:
  pact-navy: "#273677"
  pact-navy-deep: "#1B2758"
  pact-orange: "#EC6A1F"
  pact-orange-deep: "#B94B13"
  canvas: "#F7F8FB"
  surface: "#FDFDFD"
  surface-muted: "#EFF1F7"
  ink: "#202943"
  ink-muted: "#566079"
  border: "#D8DDE9"
typography:
  headline:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  control: "6px"
  panel: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.pact-navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.pact-navy-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.pact-navy}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

# Design System: PACT Management System

## Overview

**Creative North Star: The Programme Desk.** PACT should feel like a well-organized working desk for field teams, finance staff, and administrators. People use it while reconciling records, approving payments, tracking MMP work, and managing access, often with limited time or an imperfect connection. A light canvas keeps dense information readable; navy anchors navigation and actions; orange marks the few moments that need attention.

This is a **target design direction** drawn from [the PACT logo](public/pact-logo.png) and the existing product context. It is not a claim that every current screen already follows these tokens. The existing CSS, Tailwind config, and some charts contain unrelated blue, purple, green, red, and pink values. New screens must follow this file; existing screens should be aligned incrementally.

**Key characteristics:** predictable navigation, clear page titles, one primary action per view, compact tables, plain language, and bilingual English/Arabic content where it helps staff complete work. Use a familiar top bar and sidebar; collapse the sidebar on narrow screens. Preserve table context through horizontal scrolling or a deliberate small-screen row layout.

## Colors

The logo's deep navy and orange are the only brand hues. The sampled logo is a small raster image, so the orange token is a representative color from its antialiased ring; do not treat nearby pixel variations as separate palette colors.

### Primary

- **PACT Navy** (`pact-navy`): primary buttons, selected navigation, important headings, and chart series one. Use deep navy for hover or pressed states.

### Secondary

- **PACT Orange** (`pact-orange`): sparing attention cue, focused highlights, and chart series two. Use deep orange when orange needs to carry small text on a pale surface. Orange is never a large decorative background.

### Neutral

- **Canvas, Surface, Surface Muted:** page background, content planes, and subtle selected or grouped regions.
- **Ink, Ink Muted, Border:** main text, supporting text, and quiet separation. Keep the neutrals slightly navy-tinted.

**The Two-Hue Rule.** UI chrome, icons, navigation, and charts use navy and orange plus their tints, shades, and neutrals. Do not assign a new hue to each module, role, category, or chart slice. Distinguish series with labels, patterns, line styles, and value ordering when two hues are insufficient.

**The Meaning Rule.** State cannot rely on color alone. Pair Pending, Approved, Rejected, Overdue, and similar states with text and an icon or shape. Use a restrained navy or orange tint for state backgrounds. For destructive actions, explicit text and a confirmation step matter more than a bright red surface.

**The Contrast Rule.** Check text and control contrast in both themes before shipping. Never put orange text on a pale orange fill or low-contrast white text on the logo orange. Dark mode, where offered, should use navy-tinted dark surfaces and the same two brand hues, with contrast-adjusted variants rather than a new palette.

## Typography

Use the project's existing Poppins heading and Inter body families. Arabic content needs an Arabic-capable sans fallback with comparable weight and density; test real Arabic strings and right-to-left layout rather than treating Arabic as decoration.

- **Headline:** page title, 24px/600. One per page.
- **Title:** section title, 18px/600. Use to divide genuine work areas.
- **Body:** table, form, and explanatory copy, 14px/400. Keep prose to roughly 65–75 characters per line.
- **Label:** field names, column headers, and small status labels, 12px/600. Use sentence case and clear nouns.

**The Scannability Rule.** Hierarchy comes from placement, size, and weight. Do not use extra colors or all caps to compensate for weak structure. Align numbers by decimal or right edge, and use tabular numerals for amounts and dates.

## Elevation

Flat by default. Separate the page, sidebar, table header, and work areas with surface tone, whitespace, and one-pixel borders. Reserve a soft shadow for a floating menu, popover, or dialog that genuinely overlays content. Never stack shadowed cards inside shadowed cards.

**The Surface Rule.** A panel exists only when grouping improves the task. Do not wrap every metric, paragraph, and control in a card. Avoid glass, gradient text, and colored side stripes.

## Components

- **Navigation:** group by actual work such as My Workspace, Field Operations, Programme Management, Finance, and Administration. Show only authorized destinations. Highlight the current item with navy text and a subtle tinted background; keep inactive icons neutral. Collapse groups without losing the current location.
- **Page header:** title, short context when needed, and one primary action. Put filters and secondary actions near the data they affect. Breadcrumbs appear only when they clarify a deep workflow.
- **Buttons:** navy primary, quiet neutral secondary, text or outline tertiary. Orange is for an exceptional call to attention, not a second default button system. All variants need hover, keyboard focus, pressed, disabled, and loading states.
- **Forms:** labels above controls, visible required indicators, inline help, and errors beside the relevant field. Keep focus rings clearly visible. Prefer inline editing or a dedicated workflow page for complex tasks; use dialogs for short, bounded decisions.
- **Tables:** default structure for approvals, payments, staff, projects, and audit records. Use restrained row dividers, sticky or persistent headers when helpful, aligned amounts, explicit sort state, and filters whose active state is visible. Do not replace a useful table with a grid of decorative cards.
- **Statuses:** use concise words such as Pending review, Approved, Rejected, and Overdue. Pair badge tint with label; never make color the sole explanation.
- **Charts:** navy first, orange second, then light/dark variants of those hues. Put units, legends, and direct labels where users can read them. Use patterns or line styles for additional series; avoid rainbow categorical charts.
- **Feedback:** use local skeletons for loading, actionable empty states, and errors that say what failed and how to retry. Keep state transitions around 150–250ms and honor reduced motion. Do not animate page entry.
- **Responsive and bilingual behavior:** preserve task priority when space shrinks; turn dense toolbars into compact controls before hiding data. Test Arabic labels, number formatting, text expansion, and right-to-left alignment on real screens.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| Use logo navy and orange with navy-tinted neutrals. | Add purple / blue SaaS glow and gradient accent kits. |
| Give each screen one obvious next action. | Build hero-metric card grids with big numbers, tiny labels, and accent stripes. |
| Use tables, forms, tabs, and audit trails that fit operations work. | Create card sprawl, nested cards, bordered boxes for every block, or banner stacks. |
| Use navy and orange consistently across modules and data visualization. | Give every programme area, status, or chart category its own unrelated color. |
| Use clear bilingual EN/AR copy where it helps field and finance work. | Add decorative bilingual filler or marketing language. |
| Show keyboard focus, semantic state labels, and readable contrast. | Rely on hue alone, use decorative side stripes, glassmorphism, or invented affordances for standard tasks. |

**Audit test:** if a screen reads as a rainbow when the logo is hidden, its color usage violates this design system. If an operator has to scan decoration to find the next task, simplify the layout.
