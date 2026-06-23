---
name: Flutter Mobile Sync Rule
description: Permanent default — any web change for field staff must also update the Flutter app in the same session.
---

## The Rule
Whenever ANY change is made to the web app (React) that affects field operations staff screens, features, layouts, or views — the **equivalent change MUST also be made to the Flutter app** (`mobile/`) in the **same session**, automatically, without being asked.

**Why:** The user explicitly set this as a permanent default on 2026-06-23. The Flutter app is the field staff's mobile client — it must always stay in sync with web features relevant to them.

## Flutter App Scope
Field staff roles covered by the Flutter app:
- Data Collector
- Coordinator
- Supervisor
- FOM (Field Operations Manager)
- Data Team

## What triggers a Flutter update
- New screen added to web for any of the 5 roles above
- Layout or view change on any field staff screen
- New feature or workflow added for field staff
- Form changes, new fields, new actions

## What does NOT trigger a Flutter update
- Web-only admin/finance screens not used by field staff
- Backend-only changes (Supabase tables, RLS, Edge Functions) — Flutter picks these up automatically via the shared Supabase backend
- Web UI changes for roles not in the 5 above (e.g., pure admin, accounting staff)

## APK Build
- GitHub Actions workflow: `.github/workflows/build-flutter-apk.yml`
- Triggers automatically on any push that changes `mobile/**`
- Produces: `PACT-CommandCenter-v{run_number}.apk` under Artifacts (30-day retention)
- Build time: ~6-8 minutes
- Java 17, Flutter 3.24.5 stable

## How to apply
At the start of every task involving web changes, check if any of the 5 field staff roles are affected. If yes, plan and implement the Flutter equivalent in the same task.
