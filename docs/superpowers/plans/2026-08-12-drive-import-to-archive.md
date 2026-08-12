# Personal Drives → R2 Archive: Import Plan

**Date:** 12 August 2026
**Context:** Top management holds ~30GB each on personal Google Drive, iDrive, HiDrive, etc.
Goal: consolidate everything into the Cloudflare R2 archive so it's visible in the Workspace Hub.
**Builds on:** `2026-08-12-r2-wiring-implementation.md` (R2 wiring — done, deployed)

---

## Decision: hub-and-spoke rclone, not OAuth integration

Two ways to do this; we take the first.

| | Hub-and-spoke (chosen) | "Connect your Drive" button |
|---|---|---|
| User does | Shares folder with a company archive account (1 dialog) | Clicks Connect, OAuths, picks folders |
| We build | Registration script (~120 lines) + optional intake card | OAuth flow, Google app verification (weeks of *Google's* review), background worker service, job queue with progress/retry/resume, per-provider connectors |
| Timeline | Days | Multi-week project |
| Right when | One-time consolidation of ~15 accounts (this case) | Recurring, continuous self-serve syncing |

For a one-time consolidation, the button is not worth its cost. Nothing in the design blocks
adding it later if importing becomes a recurring need.

---

## How it works end to end

```
user shares Drive folder with archive@pactorg.com
   → rclone copy gdrive-mohamed: r2:pact-workspace-archive/archive/mohamed/   (bytes move)
   → node scripts/register_r2_files.js --prefix archive/mohamed/ --owner <id> --dry-run
   → tree looks right? rerun without --dry-run                                 (rows appear)
   → files live in the Workspace Hub — download, QR, permissions all work
```

**rclone moves the bytes; the script moves none** — it only writes the
`workspace_folders` / `workspace_files` rows so the Hub can see what landed.

### What each user does (their entire involvement)

**Google Drive** (OneDrive / Dropbox identical):
1. Open Drive in the browser.
2. Right-click the folder to archive → **Share**.
3. Add `archive@pactorg.com` (a company Google account created for this) as **Viewer** → Send.
4. Done. They get a "your archive is in the Hub" message when it's live.

**Consumer iDrive** (no share-to-account support, no usable API): one-time
Download/Restore of the backup to a machine, hand over the folder. Worst case for any
obscure provider is one manual export per person — never per file.

**iDrive e2 / HiDrive:** rclone connects directly (S3 / WebDAV remotes). No user action
beyond credentials.

### What the admin does

1. Shared folder appears in the archive account's "Shared with me".
2. `rclone config` a remote per person (~2 min), then:
   `rclone copy gdrive-mohamed: r2:pact-workspace-archive/archive/mohamed/ --progress`
3. **Run transfers from a cloud box, not office wifi** — cloud-to-cloud copies stream
   *through* the machine running rclone. A $5 Railway container / VPS does 30GB×N
   unattended overnight.
4. Run the registration script (below), dry-run first.

---

## The registration script (`scripts/register_r2_files.js` — to be written)

Same species as the existing `scripts/backfill_storage_to_db.js`, pointed at R2 and the
workspace tables.

**Inputs:** R2 access key (read-only suffices) + Supabase service role key (env vars);
`--prefix` to scan (e.g. `archive/mohamed/`); `--owner` user id to record as creator.

**Steps:**
1. **List** — S3 `ListObjectsV2` on the bucket under the prefix; pages of 1,000
   (key, size, timestamp).
2. **Folder tree** — split keys on `/`, collect unique folder paths, create
   `workspace_folders` rows parents-first, remembering ids (same `folderIdMap` trick the
   Hub's folder-upload dialog already uses in WorkspaceHub.tsx).
3. **Register files** — one `workspace_files` row per object: `name` from last segment,
   `storage_path` = full R2 key, `file_size` from the listing, `mime_type` guessed from
   extension, `folder_id` from step 2, `storage_provider: 'r2'`, `created_by` = owner,
   `security_level` default **internal** (raise per-folder in the Hub afterwards).
4. **Idempotent** — skip any `storage_path` already registered. A transfer that dies at
   60% can be resumed and the script rerun; only new files get rows. Safe to run after
   every import batch forever.
5. **`--dry-run`** — print the folder tree + file counts per folder, write nothing.
   The safety net against someone's Drive share containing their personal photo library.

### Bonus: same script migrates the historical ~80GB later

Those files already have `workspace_files` rows pointing at Supabase paths, so the script
gets a second mode (`--repoint`): match each R2 key to the existing row's `storage_path`
and update two fields (`storage_path`, `storage_provider: 'r2'`). Flow: rclone copies
Supabase→R2 keeping key names, script repoints rows, empty old bucket once verified.
One tool, both jobs.

---

## Optional UI: "Send my files to the Archive" intake card

There is deliberately **no Connect button** — the share dialog *is* the UI. But if
management wants a visible in-app flow, add an intake card to the Workspace Hub
(~1–2 hours: one dialog + one table, zero OAuth):

- Dialog shows the 3-step share instructions with the archive email (copy button).
- Field to paste the shared-folder link + pick the provider (Google/OneDrive/iDrive/other).
- Submit → row in `archive_import_requests` + notification to admin.
- User watches their request's status in the same card:
  **Requested → Transferring → Done (view in Hub)** — admin flips the status per rclone job.

An intake form, not an integration — gives a button to click and a status to watch while
the machinery stays rclone.

---

## Order of work

1. Create the `archive@pactorg.com` Google account; announce the share instructions.
2. Write `scripts/register_r2_files.js` (register + repoint modes).
3. Stand up the transfer box (Railway container with rclone).
4. Pilot with one person's drive end to end; then batch the rest.
5. (Optional) Intake card in the Hub.
6. (Later) Historical 80GB migration using `--repoint`.
