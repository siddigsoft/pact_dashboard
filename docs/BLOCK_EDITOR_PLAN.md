# PACT Notion-Style Block Editor — Saved Plan

**Status:** Saved for later review · **Owner:** TBD · **Last updated:** 2026-04-25
**Decision so far:** Build a Notion-style block editor **inside PACT** (no
external Notion subscription, no per-user fees, no vendor lock-in). Self-hosted
on the existing Supabase + React stack.

---

## 1. Why this, not "connect to Notion"

| | Connect to real Notion | **Build block editor inside PACT (chosen)** |
|---|---|---|
| Subscription cost | Per-user Notion seats | **None — fully free** |
| Offline use (field staff) | No — Notion is online-only | **Yes — IndexedDB / Hive, syncs on reconnect** |
| Bilingual EN + AR with proper RTL | Weak | **Native** |
| Permissions | Separate Notion ACLs | **Reuses PACT RLS, hubs, departments, roles** |
| Vendor dependency | Notion + their rate limits | **None** |
| Engineering effort | Low | Medium (a few sprints, phased) |

Decision driver: PACT is **mobile-first, offline-first, bilingual, RLS-secured**.
Notion satisfies none of those three.

---

## 2. Free open-source stack (no paid tier needed)

| Layer | Library / service | License | Cost |
|---|---|---|---|
| **Editor** | **BlockNote** (recommended) | MIT | Free |
| Runner-up editors | TipTap (core), Novel, Lexical, Plate, Editor.js | MIT/Apache | Free |
| Document storage | Supabase Postgres (already yours) | — | Already paid |
| File / image uploads | Supabase Storage (already yours) | — | Already paid |
| Search | Postgres full-text search | — | Free, built-in |
| Bilingual EN/AR + RTL | HTML `dir="rtl"` + existing i18n | — | Free |
| PDF / Excel export | jsPDF + xlsx (already in PACT) | — | Free |
| Optional live co-editing | Yjs + self-hosted Hocuspocus, **or** Supabase Realtime | MIT | Free |
| Offline drafts | IndexedDB + Service Worker (already in PACT) | — | Free |

**No new vendor, no new bill, no per-user fee.**

Why **BlockNote** specifically:
- MIT licensed, no paid tier.
- Slash menu, drag handles, headings, checklists, tables, images, quotes,
  callouts — Notion-style out of the box.
- Built on TipTap / ProseMirror — mature.
- Supports custom blocks → we add `/project`, `/site`, `/partner`, `/task`,
  `/user` mention blocks linking to live PACT records.
- Stores documents as JSON → drops straight into a Supabase JSONB column.
- RTL works.

---

## 3. Pages affected

### Phase A — Launch pair (1–2 sprints)

| Page | Change |
|---|---|
| **Project Details** (`/projects/:id`) — all 10 project types | Description textarea → block editor with mentions of sites / partners / tasks. |
| **Knowledge Base** (`/knowledge-base`) — **NEW page** | Wiki-style surface for SOPs, policies, onboarding guides, donor templates. Folder tree + role-filtered visibility. |

### Phase B — Field + HQ pickup (1 sprint)

| Page | Change |
|---|---|
| **Site Visits & MMP narratives** (`/site-visits`, `/mmp/*`) | Notes field → block editor with inline photos, GPS pins, voice memos, checklists. Works offline. |
| **CRM Engagements / Meeting Notes** (`/crm/engagements/:id`) | New "Notes" tab: agendas, action items, attendees, `/partner` `/contact` mentions. |

### Phase C — Internal communications (when stable)

| Page | Change |
|---|---|
| **Performance Reviews** (`/performance-reviews`) | Reviewer comments → blocks; goals as checklists; links to delivered projects/tasks. |
| **Broadcast Center** (admin announcements) | Headings, callouts, inline images instead of plain text. |
| **Changelog** (`/changelog`) | Entries authored in the editor instead of hand-written Markdown. |
| **Hierarchical Tasks** (`/my-tasks`, `/team-tasks`, admin overview) | Task descriptions → blocks; sub-tasks + photo proofs render inline. |
| **Project Field Tasks** (per-project tracker) | Same as hierarchical tasks. |

**Total:** 8 existing pages enriched + 1 new page. **No page removed, no data lost.**

---

## 4. Features the system will gain

### Authoring (everywhere the editor appears)
- Slash menu (`/`) for: heading, bullet list, numbered list, **checklist**,
  quote, callout, divider, code, table, image, file.
- Inline formatting: bold, italic, underline, strikethrough, inline code, links.
- Drag-handle on every block to reorder content.
- Nested lists & toggles (collapse / expand sections).
- Tables with add / remove rows and columns.
- Inline images & files uploaded directly to Supabase Storage.
- **Bilingual EN + AR with proper RTL** for every block.
- Markdown shortcuts (`#` heading, `- [ ]` checklist, etc.) for fast typing.

### PACT-specific extensions (the differentiator)
- **`/project` mention** — pick a project; renders as clickable chip.
- **`/site` mention** — link to master sites registry.
- **`/partner`** / **`/contact` mention** — link to CRM records.
- **`/task` mention** — link to a hierarchical or field task.
- **`/user` mention** — assigns a person + triggers a notification on existing
  channels (in-app + WhatsApp + email + push).
- **`/file` block** — pulls from Supabase storage with the correct RLS.

### Data, sync & safety
- **Offline-safe drafts** — saved to IndexedDB (web) / Hive (mobile),
  synced on reconnect, idempotent so nothing duplicates.
- **Autosave** every few seconds with a "saved · just now" indicator.
- **Per-page version history** — restore any earlier revision.
- **Row-Level Security carries through** — same role / hub / department rules
  govern every document.
- **Audit trail** of edits using the existing audit infrastructure.

### Collaboration (free tier)
- **Comments on blocks** — text-based right-rail comments; notifies the
  assignee on existing channels.
- **@mentions of users** with notification dispatch.
- *(Optional later)* Live multi-cursor co-editing via Yjs — free,
  self-hosted, no extra service.

### Search
- **Full-text search across all editor content** using Postgres FTS, surfaced
  in the global search bar — find any phrase typed in any project description,
  MMP note, knowledge-base page, or meeting note.

### Export & sharing
- **PDF export** per page with bilingual layout (existing jsPDF stack).
- **Excel export** for any table block (existing xlsx stack).
- **Public read-only share link** (optional, off by default, expires) — share a
  single SOP page with a partner without giving them a PACT account.
- **Copy as Markdown / HTML** for one-click pasting into emails or WhatsApp.

### Admin & governance (Knowledge Base specifically)
- Folders + drag-to-reorder pages in a left tree.
- Page templates — "Donor SOP", "Project kickoff", "Meeting notes",
  "Onboarding checklist" — admin-managed.
- Role-based visibility per page (everyone / specific roles / specific
  departments).
- Pinned pages at the top of the tree.
- Read receipts on important SOPs (who has acknowledged the latest version).

---

## 5. What stays exactly the same — no limitations on what we do today

- Every existing page keeps its layout, buttons, and workflows. Only the
  description / notes area inside the listed pages changes.
- Old plain-text content auto-imports as a single paragraph block on first
  edit — nothing deleted.
- All existing features keep working unchanged: approvals, RLS, role-based
  permissions, hub / department scoping, audit log, notifications (in-app +
  email + WhatsApp + push), offline sync, exports, bilingual EN + AR + RTL,
  search.
- Existing APIs and edge functions stay backward-compatible — anything reading
  those text fields still gets text back (rendered from the blocks).
- Per-page fallback to plain text if a team prefers it — no rebuild needed.

---

## 6. Honest trade-offs to acknowledge

1. **Storage shape changes** for the affected fields — those columns become
   JSONB instead of plain text. Migration is automatic and reversible (a
   plain-text rendering is kept alongside).
2. **Search index needs a one-time rebuild** after rollout so old text content
   is indexed in the new format. Takes minutes, runs once.

Neither limits what the system can do — they're just facts about the rollout.

---

## 7. Out of scope for this plan

- **Mobile Flutter app authoring UI.** Mobile reads the rendered output in
  Phase A–C; full mobile authoring is a separate piece of work if/when wanted.
- **Live multi-cursor co-editing.** Optional, off by default, can be enabled
  later for free without breaking anything.
- **Connecting to the real Notion.com.** Explicitly rejected (subscription,
  online-only, weak RTL, separate ACLs).

---

## 8. Open items to confirm before starting Phase A

1. Confirm **BlockNote** as the chosen library (vs TipTap core / Novel /
   Lexical).
2. Confirm Knowledge Base page lives at **`/knowledge-base`** (or another
   route).
3. Confirm which existing roles can **author** vs **read** Knowledge Base
   pages by default.
4. Confirm whether the **public read-only share link** feature ships in
   Phase A or is deferred.
5. Confirm whether **comments on blocks** ship in Phase A or Phase B.

---

*Saved for later review. No implementation kicked off.*
