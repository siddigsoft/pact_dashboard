---
name: Down Payment payment authorization
description: Separates advance approval from actual disbursement through Pre-Funding.
---

Down Payment approval and payment are separate capabilities. Actual full, partial, complete, or batch payment requires both `down_payments:mark_paid` and `pre_funding:use_for_payment`.

Kassala Hub Supervisor assignments are a deliberate exception with two different scopes: payment/read access is global across all hubs, while Tier 1 approval and rejection are limited to Kassala Hub. They never receive Tier 2 approval or deletion authority.

**Why:** Approval permissions previously appeared grantable to non-finance users while payment buttons were hard-coded to Finance/Admin roles, making Role Management grants ineffective and conflating approval with disbursement.

**How to apply:** Keep pending approval states non-payable. Enforce the dual payment permission in controls, confirmation handlers, and the atomic database path. For Kassala supervisors, enforce the narrower approval scope per request in both UI and database transitions, not through client role claims. Detect the special assignment with an RPC whose resolver includes canonical role assignments plus the profile's primary/secondary hubs; primary roles and cached grants are incomplete.