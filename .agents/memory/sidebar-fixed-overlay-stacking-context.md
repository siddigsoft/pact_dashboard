---
name: Sidebar fixed overlay stacking context
description: Why fixed overlays inside SidebarInset render invisibly behind the sidebar — and the correct fix.
---

# Sidebar fixed overlay stacking context

## The Rule
Never use `relative z-0` on `SidebarInset` or `global-scrollable` in MainLayout. Any `position: fixed` overlay inside those elements will render **behind** the shadcn sidebar panel.

**Why:** The shadcn sidebar panel (`sidebar.tsx:290`) uses `fixed inset-y-0 z-50` which participates in the **ROOT** CSS stacking context. Both `SidebarInset` and `global-scrollable` have `relative z-0`, creating nested stacking contexts at ROOT z-0. A `fixed z-50` child inside these contexts competes at ROOT z-0, not z-50 — so it's always painted under the sidebar panel's z-50.

**How to apply:** 
- `MainLayout.tsx`: `SidebarInset` must have no `z-N` class (use just `relative`).
- `MainLayout.tsx`: `global-scrollable` div must have no `z-N` class (use just `relative`).
- Any full-screen fixed overlay in page components must use `z-[200]` or higher to beat the sidebar's z-50.
- Alternative: use `ReactDOM.createPortal(..., document.body)` to render at body level, bypassing all stacking contexts.

## Key file locations
- `src/components/MainLayout.tsx` lines 97, 105 — SidebarInset and global-scrollable
- `src/components/ui/sidebar.tsx` line 290 — sidebar panel `fixed inset-y-0 z-50`
- Navbar: `sticky z-40` (inside SidebarInset, outside global-scrollable)
