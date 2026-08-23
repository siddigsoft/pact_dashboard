---
name: Atomic Operational Cost tier reverts
description: Protecting Cost Submission tier reverts when Pre-Fund payments may exist.
---

Operational Cost tier reverts must be performed by a protected database transaction that reverses each active, unreconciled linked Pre-Fund payment before changing the source’s approval state. A reconciled payment must block the tier revert.

**Why:** Clearing payment fields in the browser while a ledger payment remains active leaves the source and Pre-Fund balance inconsistent. Reverting a lower approval tier while a later tier remains approved also creates an invalid approval chain.

**How to apply:** Keep tier shape derived from `submitter_role` rather than defaulted tier columns. Validate that only the latest approved tier is being undone, lock sources and payment rows deterministically, and make multi-item reverts all-or-nothing.

Tier-revert authority is restricted to Admin and Super Admin roles. A per-user permission override must never grant it.

**Why:** Tier reverts can reverse a Pre-Fund payment and make a request payable again; the user explicitly reserved that financial reset for Admin and Super Admin users.

**How to apply:** Enforce the role check both in the UI and in the database RPC, and revoke direct access to any legacy RPC that could bypass the protected entry point.