---
name: MonitoringDashboard "grants" migration is not financial Grant Tracking
description: Naming collision between an unrelated monitoring/RPC migration and the real Grant Tracking accounting feature.
---

`MonitoringDashboard.tsx` shows an empty-state hint referencing
`20260328_monitoring_grants_and_rpc.sql`. Despite the filename, this migration
is about SQL permission **grants** and RPC setup for the general monitoring
actions dashboard — it has nothing to do with financial Grant Tracking.

The real Grant Tracking feature (award amounts, expenses, milestones) lives in
`AccountingGrants.tsx` against `acct_grants` / `acct_grant_expenses` /
`acct_grant_milestones` tables, and is a separate, fully built implementation.

**Why:** an earlier investigation nearly treated MonitoringDashboard's
migration hint as evidence that Grant Tracking was incomplete/gated, which
was a false lead purely from the filename's use of the word "grants".

**How to apply:** if asked to fix/extend "grant tracking" or investigate a
migration-required gap, check `AccountingGrants.tsx` first — don't assume
every mention of "grants" in the codebase refers to the financial feature.
